import multer from 'multer';
import mongoose from 'mongoose';
import { ERROR_CODES, LIMITS } from '@verihire/shared';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES, format } from '../constants/messages.js';
import {
  ApiError,
  BadRequestError,
  ConflictError,
  InternalError,
  PayloadTooLargeError,
  UnauthorizedError,
  ValidationError,
} from '../errors/index.js';

/**
 * 404 for anything that reached the end of the router stack.
 * @type {import('express').RequestHandler}
 */
export const notFoundHandler = (req, _res, next) => {
  next(
    new ApiError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      format(MESSAGES.ERROR.ROUTE_NOT_FOUND, { method: req.method, path: req.originalUrl }),
    ),
  );
};

/* ------------------------------------------------------------------ normalisers */

/** Mongoose validation failure → field-level 422 the client can render inline. */
const fromMongooseValidation = (err) => {
  const fieldErrors = Object.values(err.errors ?? {}).map((e) => ({
    field: e.path,
    message: e.message,
  }));
  return new ValidationError(fieldErrors);
};

/**
 * Duplicate key → 409 with the right domain code.
 *
 * This is how "one application per job per candidate" and "unique email" are enforced:
 * the unique index is the guarantee, and this maps its error into product language. A
 * check-then-insert in the service would still race; the index cannot.
 */
const fromDuplicateKey = (err) => {
  const keys = Object.keys(err.keyPattern ?? err.keyValue ?? {});
  const key = keys.join('+');

  if (key.includes('email')) {
    return new ConflictError(ERROR_CODES.EMAIL_ALREADY_EXISTS, MESSAGES.AUTH.EMAIL_TAKEN);
  }
  if (key.includes('job') && key.includes('applicant')) {
    return new ConflictError(ERROR_CODES.ALREADY_APPLIED, MESSAGES.APPLICATION.ALREADY_APPLIED);
  }
  if (key.includes('user') && key.includes('entityType')) {
    return new ConflictError(ERROR_CODES.ALREADY_BOOKMARKED, MESSAGES.BOOKMARK.ALREADY_EXISTS);
  }
  return new ConflictError(
    ERROR_CODES.CONFLICT,
    'A record with those details already exists.',
    keys.length ? keys.map((field) => ({ field, message: 'Already in use' })) : null,
  );
};

const fromMulter = (err) => {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return new PayloadTooLargeError(
        ERROR_CODES.FILE_TOO_LARGE,
        format(MESSAGES.UPLOAD.TOO_LARGE, {
          limit: `${Math.round(LIMITS.MAX_RESUME_BYTES / 1024 / 1024)}MB`,
        }),
      );
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return new BadRequestError(ERROR_CODES.TOO_MANY_FILES, 'Too many files in that upload.');
    default:
      return new BadRequestError(ERROR_CODES.BAD_REQUEST, MESSAGES.UPLOAD.FAILED);
  }
};

/**
 * Converts any thrown value into an ApiError.
 * @param {unknown} err
 * @returns {ApiError}
 */
const normalise = (err) => {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) return fromMongooseValidation(err);
  if (err instanceof mongoose.Error.CastError) {
    return new BadRequestError(ERROR_CODES.INVALID_ID, MESSAGES.ERROR.INVALID_ID, [
      { field: err.path, message: 'Not a valid identifier' },
    ]);
  }
  if (err instanceof multer.MulterError) return fromMulter(err);

  const anyErr = /** @type {any} */ (err);

  if (anyErr?.code === 11000) return fromDuplicateKey(anyErr);
  if (anyErr?.name === 'JsonWebTokenError') {
    return new UnauthorizedError(ERROR_CODES.TOKEN_INVALID, 'That session token is not valid.');
  }
  if (anyErr?.name === 'TokenExpiredError') {
    return new UnauthorizedError(ERROR_CODES.TOKEN_EXPIRED, 'Your session has expired.');
  }
  if (anyErr?.type === 'entity.too.large') {
    return new PayloadTooLargeError(ERROR_CODES.FILE_TOO_LARGE, 'That request body is too large.');
  }
  if (anyErr?.type === 'entity.parse.failed') {
    return new BadRequestError(ERROR_CODES.BAD_REQUEST, 'Request body is not valid JSON.');
  }
  if (anyErr?.name === 'MongoServerSelectionError' || anyErr?.name === 'MongoNetworkError') {
    const dbErr = new InternalError(ERROR_CODES.DATABASE_ERROR, MESSAGES.ERROR.DB_UNAVAILABLE);
    dbErr.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
    return dbErr;
  }

  const internal = new InternalError();
  internal.stack = anyErr?.stack ?? internal.stack;
  internal.cause = err;
  return internal;
};

/**
 * ★ The single exit point for every failure in the application.
 *
 * @type {import('express').ErrorRequestHandler}
 */
export const globalErrorHandler = (err, req, res, _next) => {
  const error = normalise(err);

  const context = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id ?? null,
    role: req.user?.role ?? null,
    ip: req.ip,
    code: error.code,
    statusCode: error.statusCode,
  };

  if (!error.isOperational || error.statusCode >= 500) {
    // A real bug. Keep the original stack — `normalise` preserved it.
    logger.error(`Unhandled: ${error.message}`, {
      ...context,
      stack: error.stack,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
    });
  } else if (error.statusCode >= 400) {
    logger.warn(`${error.code}: ${error.message}`, context);
  }

  // Never let a response go out twice — Express will throw ERR_HTTP_HEADERS_SENT.
  if (res.headersSent) return;

  res.status(error.statusCode).json({
    success: false,
    statusCode: error.statusCode,
    message: error.message,
    error: {
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
      ...(env.isProduction ? {} : { stack: error.stack }),
    },
    meta: {
      requestId: req.id ?? null,
      timestamp: new Date().toISOString(),
    },
  });
};

export default globalErrorHandler;
