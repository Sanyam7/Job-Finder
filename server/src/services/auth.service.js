import { ACCOUNT_STATUS, ERROR_CODES, REGISTERABLE_ROLES, ROLES, LIMITS } from '@verihire/shared';
import logger from '../config/logger.js';
import { userRepository } from '../repositories/user.repository.js';
import { withTransaction } from '../database/transaction.js';
import { createForOwner } from './employer.service.js';
import { tokenRepository } from '../repositories/token.repository.js';
import { TOKEN_TYPE } from '../models/verificationToken.model.js';
import { generateToken, hashToken } from '../utils/crypto.util.js';
import { burnPasswordTime } from '../utils/password.util.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from '../errors/index.js';
import { MESSAGES, format } from '../constants/messages.js';
import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../constants/events.js';
import * as tokenService from './token.service.js';

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; //  1 hour

/**
 * @typedef {Object} RequestContext
 * @property {string} [ip]
 * @property {string} [userAgent]
 */

/**
 * Creates an account that is usable immediately.
 *
 * There is no email-verification step: the account is active on creation and the same
 * credentials sign in straight away. Password reset still issues a token by email, so
 * `issueVerificationToken` and the token table remain in use for that.
 *
 * @param {{firstName: string, lastName: string, email: string, password: string,
 *          role: string, companyName?: string}} dto
 * @param {RequestContext} [ctx]
 */
export const register = async (dto, ctx = {}) => {
  // ADMIN is never obtainable through a public endpoint — the seeder and an existing
  // admin's promotion are the only two paths.
  if (!REGISTERABLE_ROLES.includes(dto.role)) {
    throw new ForbiddenError(ERROR_CODES.FORBIDDEN, MESSAGES.AUTH.ADMIN_SIGNUP_BLOCKED);
  }

  if (await userRepository.emailExists(dto.email)) {
    throw new ConflictError(ERROR_CODES.EMAIL_ALREADY_EXISTS, MESSAGES.AUTH.EMAIL_TAKEN);
  }

  /**
   * ★ An employer's company profile is created here, in the same transaction as the user.
   *
   * Not in a `USER_REGISTERED` subscriber, and not lazily on first use: without a profile,
   * every employer endpoint answers 404 EMPLOYER_PROFILE_MISSING — `GET /employers/me`,
   * `PATCH /employers/me`, `POST /employers/me/verification` and `POST /jobs` alike. There
   * is no request that creates one, so the account would be permanently unable to reach any
   * part of the product it signed up for. The profile is an invariant of an employer
   * account existing, so it commits with the account or not at all.
   */
  const user = await withTransaction(
    async (session) => {
      const created = await userRepository.create(
        {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          passwordHash: dto.password, // the model's pre-save hook hashes this
          role: dto.role,
          status: ACCOUNT_STATUS.ACTIVE,
          /**
           * Email verification has been removed as a product decision: an account is
           * usable the moment it is created, with the same credentials it was created
           * with. The column is kept rather than dropped so existing rows, the JWT claim
           * and the user DTO stay valid, and so reinstating verification later is a
           * change of policy rather than a migration.
           */
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
        },
        { session },
      );

      if (created.role === ROLES.EMPLOYER) {
        await createForOwner(
          { userId: String(created._id), companyName: dto.companyName ?? '' },
          { session },
        );
      }

      return created;
    },
    { name: 'register' },
  );

  eventBus.emit(EVENTS.USER_REGISTERED, {
    userId: String(user._id),
    email: user.email,
    firstName: user.firstName,
    role: user.role,
    companyName: dto.companyName ?? null,
    ip: ctx.ip ?? null,
  });

  logger.info('User registered', { userId: String(user._id), role: user.role });
  return user;
};

/**
 * Authenticates a user.
 *
 * Every failure path returns the same message and burns comparable CPU, so the endpoint
 * cannot be used to discover which email addresses have accounts.
 *
 * @param {{email: string, password: string}} dto
 * @param {RequestContext} [ctx]
 */
export const login = async (dto, ctx = {}) => {
  const user = await userRepository.findByEmail(dto.email, { withPassword: true });

  if (!user || user.deletedAt) {
    await burnPasswordTime(); // equalise timing against the "user exists" path
    throw new UnauthorizedError(ERROR_CODES.INVALID_CREDENTIALS, MESSAGES.AUTH.INVALID_CREDENTIALS);
  }

  if (user.isLocked()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new UnauthorizedError(
      ERROR_CODES.ACCOUNT_LOCKED,
      format(MESSAGES.AUTH.ACCOUNT_LOCKED, { minutes }),
    );
  }

  const passwordMatches = await user.comparePassword(dto.password);

  if (!passwordMatches) {
    const { locked } = await user.registerFailedLogin();

    eventBus.emit(EVENTS.SECURITY_LOGIN_FAILED, {
      userId: String(user._id),
      email: user.email,
      ip: ctx.ip ?? null,
      locked,
    });

    if (locked) {
      eventBus.emit(EVENTS.SECURITY_ACCOUNT_LOCKED, {
        userId: String(user._id),
        email: user.email,
        ip: ctx.ip ?? null,
      });
      throw new UnauthorizedError(
        ERROR_CODES.ACCOUNT_LOCKED,
        format(MESSAGES.AUTH.ACCOUNT_LOCKED, { minutes: LIMITS.ACCOUNT_LOCK_MINUTES }),
      );
    }

    throw new UnauthorizedError(ERROR_CODES.INVALID_CREDENTIALS, MESSAGES.AUTH.INVALID_CREDENTIALS);
  }

  if (user.status === ACCOUNT_STATUS.SUSPENDED) {
    throw new ForbiddenError(ERROR_CODES.ACCOUNT_SUSPENDED, MESSAGES.AUTH.ACCOUNT_SUSPENDED, {
      reason: user.suspendedReason ?? null,
    });
  }

  await user.registerSuccessfulLogin(ctx.ip);

  const tokens = await tokenService.issueTokenPair(
    {
      id: String(user._id),
      role: user.role,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
    },
    ctx,
  );

  eventBus.emit(EVENTS.USER_LOGGED_IN, {
    userId: String(user._id),
    role: user.role,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  return { user, tokens };
};

/**
 * @param {string} rawRefreshToken
 * @param {RequestContext} [ctx]
 */
export const refresh = (rawRefreshToken, ctx = {}) => {
  if (!rawRefreshToken) {
    throw new UnauthorizedError(
      ERROR_CODES.REFRESH_TOKEN_MISSING,
      'No session found. Please sign in.',
    );
  }
  return tokenService.rotateRefreshToken(rawRefreshToken, ctx);
};

/** @param {string} rawRefreshToken */
export const logout = async (rawRefreshToken) => {
  if (!rawRefreshToken) return false;
  return tokenService.revokeRefreshToken(rawRefreshToken, 'LOGOUT');
};

/** @param {string} userId */
export const logoutAll = (userId) => tokenService.revokeAllSessions(userId, 'LOGOUT_ALL');

/**
 * @param {string} email
 * @param {RequestContext} [ctx]
 */
export const forgotPassword = async (email, ctx = {}) => {
  const user = await userRepository.findByEmail(email);
  if (!user || user.deletedAt || user.status !== ACCOUNT_STATUS.ACTIVE) return;

  const rawToken = await issueVerificationToken(
    String(user._id),
    TOKEN_TYPE.PASSWORD_RESET,
    ctx.ip,
  );

  eventBus.emit(EVENTS.PASSWORD_RESET_REQUESTED, {
    userId: String(user._id),
    email: user.email,
    firstName: user.firstName,
    resetToken: rawToken,
    ip: ctx.ip ?? null,
  });
};

/**
 * Completes a password reset.
 *
 * Every session is revoked afterwards: if the reset was triggered because an account was
 * compromised, leaving the attacker's session alive would defeat the whole exercise.
 *
 * @param {{token: string, password: string}} dto
 * @param {RequestContext} [ctx]
 */
export const resetPassword = async (dto, ctx = {}) => {
  const record = await tokenRepository.findVerificationByRaw(
    dto.token,
    TOKEN_TYPE.PASSWORD_RESET,
  );

  if (!record || record.usedAt) {
    throw new BadRequestError(ERROR_CODES.TOKEN_INVALID, MESSAGES.AUTH.INVALID_TOKEN);
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw new BadRequestError(ERROR_CODES.TOKEN_EXPIRED, MESSAGES.AUTH.EXPIRED_TOKEN);
  }

  const user = await userRepository.findByIdWithPassword(String(record.user));
  if (!user || user.deletedAt) {
    throw new BadRequestError(ERROR_CODES.TOKEN_INVALID, MESSAGES.AUTH.INVALID_TOKEN);
  }

  if (await user.comparePassword(dto.password)) {
    throw new BadRequestError(ERROR_CODES.BAD_REQUEST, MESSAGES.AUTH.SAME_PASSWORD);
  }

  user.passwordHash = dto.password; // hashed by the pre-save hook
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();

  await tokenRepository.markVerificationUsed(String(record._id));
  await tokenService.revokeAllSessions(String(user._id), 'PASSWORD_CHANGED');

  eventBus.emit(EVENTS.PASSWORD_RESET_COMPLETED, {
    userId: String(user._id),
    email: user.email,
    firstName: user.firstName,
    ip: ctx.ip ?? null,
  });

  return user;
};

/**
 * Changes the password of a signed-in user.
 *
 * The current session survives; every other one is revoked. Signing the user out of the
 * device they are actively using would be hostile, but leaving a stolen session alive on
 * another device would be unsafe.
 *
 * @param {string} userId
 * @param {{currentPassword: string, newPassword: string}} dto
 * @param {RequestContext & {currentRefreshToken?: string}} [ctx]
 */
export const changePassword = async (userId, dto, ctx = {}) => {
  const user = await userRepository.findByIdWithPassword(userId);
  if (!user) throw new UnauthorizedError(ERROR_CODES.USER_NOT_FOUND, MESSAGES.USER.NOT_FOUND);

  if (!(await user.comparePassword(dto.currentPassword))) {
    throw new BadRequestError(
      ERROR_CODES.INVALID_CREDENTIALS,
      MESSAGES.AUTH.CURRENT_PASSWORD_WRONG,
    );
  }
  if (dto.currentPassword === dto.newPassword) {
    throw new BadRequestError(ERROR_CODES.BAD_REQUEST, MESSAGES.AUTH.SAME_PASSWORD);
  }

  user.passwordHash = dto.newPassword;
  await user.save();

  const revoked = await tokenService.revokeAllSessions(userId, 'PASSWORD_CHANGED', {
    exceptRawToken: ctx.currentRefreshToken,
  });

  eventBus.emit(EVENTS.PASSWORD_CHANGED, {
    userId: String(user._id),
    email: user.email,
    firstName: user.firstName,
    ip: ctx.ip ?? null,
    revokedSessions: revoked,
  });

  return { revokedSessions: revoked };
};

/**
 * Issues a single-use token and invalidates any outstanding ones of the same type.
 * @param {string} userId
 * @param {string} type
 * @param {string} [ip]
 * @returns {Promise<string>} the RAW token — the only place it exists in plaintext
 */
const issueVerificationToken = async (userId, type, ip) => {
  await tokenRepository.invalidateVerificationTokens(userId, type);

  const rawToken = generateToken(32);
  const ttl = type === TOKEN_TYPE.PASSWORD_RESET ? PASSWORD_RESET_TTL_MS : EMAIL_VERIFY_TTL_MS;

  await tokenRepository.createVerificationToken({
    user: userId,
    tokenHash: hashToken(rawToken),
    type,
    expiresAt: new Date(Date.now() + ttl),
    ip: ip ?? null,
  });

  return rawToken;
};

export default {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  changePassword,
};
