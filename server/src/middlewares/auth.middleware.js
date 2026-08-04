import { ACCOUNT_STATUS, ERROR_CODES } from '@verihire/shared';
import { User } from '../models/user.model.js';
import { extractBearerToken, verifyAccessToken } from '../utils/jwt.util.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';
import logger from '../config/logger.js';

/**
 * Loads and validates the caller from the access token.
 *
 * The token is verified cryptographically **and** the user is re-read from the database on
 * every request. That extra read is deliberate: a purely stateless check would let a
 * suspended account keep working for the remaining lifetime of its access token, which on a
 * platform whose entire value proposition is moderation is not acceptable. The lookup is a
 * single indexed `_id` fetch of a small document.
 *
 * @type {import('express').RequestHandler}
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw new UnauthorizedError(ERROR_CODES.TOKEN_MISSING, MESSAGES.ERROR.UNAUTHORIZED);
  }

  // Throws JsonWebTokenError / TokenExpiredError — normalised by the global error handler.
  const payload = verifyAccessToken(token);

  const user = await User.findById(payload.sub)
    .select('+passwordHash email role status isEmailVerified firstName lastName passwordChangedAt')
    .lean(false);

  if (!user || user.deletedAt) {
    throw new UnauthorizedError(ERROR_CODES.TOKEN_INVALID, 'This account no longer exists.');
  }

  if (user.isPasswordChangedAfter(payload.iat ?? 0)) {
    throw new UnauthorizedError(
      ERROR_CODES.PASSWORD_CHANGED,
      'Your password changed. Please sign in again.',
    );
  }

  if (user.status === ACCOUNT_STATUS.SUSPENDED) {
    throw new ForbiddenError(ERROR_CODES.ACCOUNT_SUSPENDED, MESSAGES.AUTH.ACCOUNT_SUSPENDED, {
      reason: user.suspendedReason ?? null,
    });
  }

  if (user.status === ACCOUNT_STATUS.DELETED) {
    throw new UnauthorizedError(ERROR_CODES.TOKEN_INVALID, 'This account no longer exists.');
  }

  req.user = {
    id: String(user._id),
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    isEmailVerified: user.isEmailVerified,
  };
  req.userDoc = user;

  return next();
});

/**
 * Populates `req.user` when a valid token is present and does nothing otherwise.
 *
 * Used for endpoints that behave differently for signed-in users (a job card showing
 * "saved", the higher authenticated rate-limit quota) but must still serve guests.
 * Any token problem is silently ignored here — this middleware never rejects.
 *
 * @type {import('express').RequestHandler}
 */
export const optionalAuth = async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub)
      .select('email role status isEmailVerified firstName lastName passwordChangedAt')
      .lean(false);

    if (
      user &&
      !user.deletedAt &&
      user.status === ACCOUNT_STATUS.ACTIVE &&
      !user.isPasswordChangedAfter(payload.iat ?? 0)
    ) {
      req.user = {
        id: String(user._id),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
      };
      req.userDoc = user;
    }
  } catch (error) {
    logger.debug('optionalAuth ignored an invalid token', {
      requestId: req.id,
      reason: /** @type {Error} */ (error).message,
    });
  }

  return next();
};

/**
 * Blocks users who have not confirmed their email address.
 * @type {import('express').RequestHandler}
 */
export const requireVerifiedEmail = (req, _res, next) => {
  if (!req.user) {
    return next(new UnauthorizedError(ERROR_CODES.TOKEN_MISSING, MESSAGES.ERROR.UNAUTHORIZED));
  }
  if (!req.user.isEmailVerified) {
    return next(
      new ForbiddenError(ERROR_CODES.EMAIL_NOT_VERIFIED, MESSAGES.AUTH.EMAIL_NOT_VERIFIED, {
        email: req.user.email,
      }),
    );
  }
  return next();
};

export default authenticate;
