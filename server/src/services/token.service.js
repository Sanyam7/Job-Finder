import { randomUUID } from 'node:crypto';
import { ERROR_CODES } from '@verihire/shared';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { tokenRepository } from '../repositories/token.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { generateToken, hashToken } from '../utils/crypto.util.js';
import { signAccessToken } from '../utils/jwt.util.js';
import { UnauthorizedError } from '../errors/index.js';
import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../constants/events.js';

const REFRESH_TTL_MS = () => env.JWT_REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/**
 * @typedef {Object} IssuedTokens
 * @property {string} accessToken
 * @property {string} refreshToken raw value — goes into the cookie, never persisted
 * @property {Date} refreshExpiresAt
 * @property {string} sessionId
 */

/**
 * Starts a new session (a new token family).
 *
 * @param {{id: string, role: string, email: string, isEmailVerified: boolean}} user
 * @param {{ip?: string, userAgent?: string, session?: import('mongoose').ClientSession}} [ctx]
 * @returns {Promise<IssuedTokens>}
 */
export const issueTokenPair = async (user, ctx = {}) => {
  const rawRefresh = generateToken(48);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS());

  const record = await tokenRepository.createRefreshToken(
    {
      user: user.id,
      tokenHash: hashToken(rawRefresh),
      family: randomUUID(),
      expiresAt,
      ip: ctx.ip ?? null,
      userAgent: truncate(ctx.userAgent, 500),
      device: describeDevice(ctx.userAgent),
    },
    { session: ctx.session },
  );

  return {
    accessToken: signAccessToken(user),
    refreshToken: rawRefresh,
    refreshExpiresAt: expiresAt,
    sessionId: String(record._id),
  };
};

/**
 * ★ Rotates a refresh token, with reuse detection.
 *
 * The three outcomes:
 *  1. Token unknown        → 401. Nothing to revoke.
 *  2. Token already revoked → REUSE. Kill the entire family, alert, 401.
 *  3. Token valid          → revoke it, issue a successor in the same family.
 *
 * Case 2 is the one that matters. Because every refresh invalidates its predecessor, a
 * stolen token stops working the moment either party refreshes — and the *second* use is
 * what tells us the theft happened at all.
 *
 * @param {string} rawToken
 * @param {{ip?: string, userAgent?: string}} [ctx]
 * @returns {Promise<IssuedTokens & {user: any}>}
 */
export const rotateRefreshToken = async (rawToken, ctx = {}) => {
  const existing = await tokenRepository.findRefreshByRaw(rawToken);

  if (!existing) {
    throw new UnauthorizedError(
      ERROR_CODES.REFRESH_TOKEN_INVALID,
      'Your session is no longer valid. Please sign in again.',
    );
  }

  if (existing.revokedAt) {
    await tokenRepository.revokeFamily(String(existing.family), 'REUSE_DETECTED');

    logger.error('Refresh token reuse detected — family revoked', {
      userId: String(existing.user),
      family: existing.family,
      originallyRevokedAt: existing.revokedAt,
      originalReason: existing.revokedReason,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    eventBus.emit(EVENTS.SECURITY_TOKEN_REUSE, {
      userId: String(existing.user),
      family: String(existing.family),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    throw new UnauthorizedError(
      ERROR_CODES.SESSION_REVOKED,
      'Your session ended for security reasons. Please sign in again.',
    );
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError(
      ERROR_CODES.REFRESH_TOKEN_INVALID,
      'Your session has expired. Please sign in again.',
    );
  }

  const user = await userRepository.findById(String(existing.user), { lean: false });
  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    await tokenRepository.revokeFamily(String(existing.family), 'ADMIN');
    throw new UnauthorizedError(ERROR_CODES.SESSION_REVOKED, 'This account is no longer active.');
  }

  const rawNext = generateToken(48);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS());
  const nextHash = hashToken(rawNext);

  const successor = await tokenRepository.createRefreshToken({
    user: String(user._id),
    tokenHash: nextHash,
    family: existing.family, // same family — the chain is what makes reuse detectable
    expiresAt,
    ip: ctx.ip ?? null,
    userAgent: truncate(ctx.userAgent, 500),
    device: describeDevice(ctx.userAgent),
  });

  await tokenRepository.revokeRefreshToken(String(existing._id), {
    reason: 'ROTATED',
    replacedBy: nextHash,
  });

  const sessionUser = {
    id: String(user._id),
    role: user.role,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
  };

  return {
    accessToken: signAccessToken(sessionUser),
    refreshToken: rawNext,
    refreshExpiresAt: expiresAt,
    sessionId: String(successor._id),
    user,
  };
};

/**
 * @param {string} rawToken
 * @param {string} [reason]
 */
export const revokeRefreshToken = async (rawToken, reason = 'LOGOUT') => {
  const existing = await tokenRepository.findRefreshByRaw(rawToken);
  if (!existing || existing.revokedAt) return false;
  await tokenRepository.revokeRefreshToken(String(existing._id), { reason });
  return true;
};

/**
 * @param {string} userId
 * @param {string} [reason]
 * @param {{exceptRawToken?: string}} [opts]
 */
export const revokeAllSessions = async (userId, reason = 'LOGOUT_ALL', opts = {}) => {
  let exceptId;
  if (opts.exceptRawToken) {
    const keep = await tokenRepository.findRefreshByRaw(opts.exceptRawToken);
    exceptId = keep ? String(keep._id) : undefined;
  }
  const result = await tokenRepository.revokeAllForUser(userId, reason, { exceptId });
  return result.modifiedCount ?? 0;
};

/** @param {string} userId */
export const listSessions = (userId) => tokenRepository.findActiveSessions(userId);

/**
 * @param {string} sessionId
 * @param {string} userId
 */
export const revokeSessionById = async (sessionId, userId) => {
  const session = await tokenRepository.findSessionForUser(sessionId, userId);
  if (!session || session.revokedAt) return false;
  await tokenRepository.revokeRefreshToken(sessionId, { reason: 'LOGOUT' });
  return true;
};

/**
 * Cookie options for the refresh token.
 *
 * `httpOnly` puts it out of reach of any XSS payload; `sameSite: strict` means a malicious
 * site cannot trigger a refresh from the user's browser; the `path` scope stops it from
 * being attached to every API call, which limits where it can leak.
 *
 * @param {Date} expiresAt
 * @returns {import('express').CookieOptions}
 */
export const refreshCookieOptions = (expiresAt) => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'strict',
  path: `${env.API_PREFIX}/auth`,
  expires: expiresAt,
  signed: false,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const clearRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: /** @type {const} */ ('strict'),
  path: `${env.API_PREFIX}/auth`,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

/** @param {string|undefined} ua @param {number} max */
const truncate = (ua, max) => (ua ? String(ua).slice(0, max) : null);

/** Very rough UA summary — enough for a recognisable "active sessions" list. */
const describeDevice = (ua) => {
  if (!ua) return null;
  const agent = String(ua);
  const os =
    /Windows/i.test(agent) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(agent) ? 'macOS'
    : /Android/i.test(agent) ? 'Android'
    : /iPhone|iPad|iOS/i.test(agent) ? 'iOS'
    : /Linux/i.test(agent) ? 'Linux'
    : 'Unknown OS';
  const browser =
    /Edg\//i.test(agent) ? 'Edge'
    : /OPR\//i.test(agent) ? 'Opera'
    : /Chrome\//i.test(agent) ? 'Chrome'
    : /Firefox\//i.test(agent) ? 'Firefox'
    : /Safari\//i.test(agent) ? 'Safari'
    : 'Unknown browser';
  return `${browser} on ${os}`;
};
