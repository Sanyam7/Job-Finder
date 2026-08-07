import env from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { hashToken } from '../utils/crypto.util.js';
import { MESSAGES } from '../constants/messages.js';
import * as authService from '../services/auth.service.js';
import * as tokenService from '../services/token.service.js';
import * as userService from '../services/user.service.js';
import {
  toSelfUser,
  toSessionUser,
  toSession,
} from '../dtos/response/user.response.dto.js';

/**
 * Controllers are thin by contract (ADR-003): read the validated input, call one service,
 * shape the response. No business rules, no database access.
 */

/** @param {import('express').Request} req */
const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? undefined,
});

/** @param {import('express').Request} req */
const readRefreshCookie = (req) => req.cookies?.[env.REFRESH_COOKIE_NAME] ?? null;

/**
 * @param {import('express').Response} res
 * @param {{refreshToken: string, refreshExpiresAt: Date}} tokens
 */
const setRefreshCookie = (res, tokens) => {
  res.cookie(
    env.REFRESH_COOKIE_NAME,
    tokens.refreshToken,
    tokenService.refreshCookieOptions(tokens.refreshExpiresAt),
  );
};

export const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.validated, requestContext(req));

  // 201 with no tokens: the account exists but the session starts at sign-in, after the
  // email has been verified. Auto-signing-in here would let an unverified address hold a
  // live session.
  return ApiResponse.created(
    res,
    { user: toSelfUser(user), requiresEmailVerification: true },
    MESSAGES.AUTH.REGISTERED,
  );
});

export const login = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.login(req.validated, requestContext(req));
  setRefreshCookie(res, tokens);

  const context = await userService.buildSessionContext(user);

  return ApiResponse.ok(
    res,
    {
      user: toSessionUser(user, context),
      accessToken: tokens.accessToken,
      // The client stores this in memory only — see docs/07 §4.
      expiresIn: env.JWT_ACCESS_EXPIRY,
    },
    MESSAGES.AUTH.LOGIN_SUCCESS,
  );
});

export const refresh = asyncHandler(async (req, res) => {
  const raw = readRefreshCookie(req);
  const tokens = await authService.refresh(raw, requestContext(req));
  setRefreshCookie(res, tokens);

  const context = await userService.buildSessionContext(tokens.user);

  return ApiResponse.ok(
    res,
    {
      user: toSessionUser(tokens.user, context),
      accessToken: tokens.accessToken,
      expiresIn: env.JWT_ACCESS_EXPIRY,
    },
    MESSAGES.AUTH.TOKEN_REFRESHED,
  );
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  res.clearCookie(env.REFRESH_COOKIE_NAME, tokenService.clearRefreshCookieOptions());
  return ApiResponse.ok(res, null, MESSAGES.AUTH.LOGOUT_SUCCESS);
});

export const logoutAll = asyncHandler(async (req, res) => {
  const revoked = await authService.logoutAll(req.user.id);
  res.clearCookie(env.REFRESH_COOKIE_NAME, tokenService.clearRefreshCookieOptions());
  return ApiResponse.ok(res, { revokedSessions: revoked }, MESSAGES.AUTH.LOGOUT_ALL_SUCCESS);
});

export const me = asyncHandler(async (req, res) => {
  const { user, context } = await userService.getAccount(req.user.id);
  return ApiResponse.ok(res, { user: toSessionUser(user, context) }, MESSAGES.AUTH.PROFILE_FETCHED);
});

/**
 * Always 200, whether or not the address is registered.
 *
 * A "no account with that email" response turns this endpoint into a free membership
 * oracle — useful for building a target list of people who are job-hunting.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.validated.email, requestContext(req));
  return ApiResponse.ok(res, null, MESSAGES.AUTH.RESET_LINK_SENT);
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.validated, requestContext(req));
  res.clearCookie(env.REFRESH_COOKIE_NAME, tokenService.clearRefreshCookieOptions());
  return ApiResponse.ok(res, null, MESSAGES.AUTH.PASSWORD_RESET);
});

export const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.validated, {
    ...requestContext(req),
    currentRefreshToken: readRefreshCookie(req) ?? undefined,
  });
  return ApiResponse.ok(res, result, MESSAGES.AUTH.PASSWORD_CHANGED);
});

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await tokenService.listSessions(req.user.id);
  const currentRaw = readRefreshCookie(req);
  // Hash the caller's own cookie to flag "this device" without ever sending a hash out.
  const currentHash = currentRaw ? hashToken(currentRaw) : null;

  return ApiResponse.ok(
    res,
    {
      sessions: sessions.map((session) => ({
        ...toSession(session),
        isCurrent: Boolean(currentHash) && session.tokenHash === currentHash,
      })),
    },
    MESSAGES.AUTH.SESSIONS_FETCHED,
  );
});

export const revokeSession = asyncHandler(async (req, res) => {
  await tokenService.revokeSessionById(req.validated.sessionId, req.user.id);
  return ApiResponse.ok(res, null, MESSAGES.AUTH.SESSION_REVOKED);
});
