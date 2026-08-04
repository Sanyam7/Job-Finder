import { ERROR_CODES } from '@verihire/shared';
import { HTTP_STATUS } from '../constants/httpStatus.js';

/**
 * @typedef {import('@verihire/shared').ErrorCode} ErrorCode
 */

/**
 * Base application error.
 *
 * `isOperational` is the important field: it separates "the caller did something invalid"
 * (expected, log at warn, return the real message) from "we have a bug" (unexpected, log at
 * error with a stack, return a generic message). Without that distinction you either leak
 * internals to users or lose real stack traces in the noise.
 *
 * ★ Every subclass annotates `code` as `ErrorCode` rather than letting TypeScript infer it.
 * Inference takes the type from the *default value*, so an unannotated
 * `constructor(code = ERROR_CODES.NOT_FOUND)` is typed as accepting the literal `'NOT_FOUND'`
 * and nothing else — which would reject `JOB_NOT_FOUND`, `USER_NOT_FOUND` and every other code
 * the codebase actually throws. The annotation widens it to the real union, and still catches
 * a misspelled code.
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {ErrorCode} code machine-readable code from ERROR_CODES
   * @param {string} message human-readable message, safe to show a user
   * @param {unknown} [details] field errors or extra context for the client
   */
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  /** @returns {Record<string, unknown>} */
  toJSON() {
    return {
      name: this.name,
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class BadRequestError extends ApiError {
  /**
   * @param {ErrorCode} [code]
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(code = ERROR_CODES.BAD_REQUEST, message = 'Invalid request.', details = null) {
    super(HTTP_STATUS.BAD_REQUEST, code, message, details);
  }
}

export class UnauthorizedError extends ApiError {
  /**
   * @param {ErrorCode} [code]
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(
    code = ERROR_CODES.UNAUTHORIZED,
    message = 'You need to sign in to do that.',
    details = null,
  ) {
    super(HTTP_STATUS.UNAUTHORIZED, code, message, details);
  }
}

export class ForbiddenError extends ApiError {
  /**
   * @param {ErrorCode} [code]
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(
    code = ERROR_CODES.FORBIDDEN,
    message = "You don't have permission to do that.",
    details = null,
  ) {
    super(HTTP_STATUS.FORBIDDEN, code, message, details);
  }
}

export class NotFoundError extends ApiError {
  /**
   * @param {ErrorCode} [code]
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(code = ERROR_CODES.NOT_FOUND, message = 'Not found.', details = null) {
    super(HTTP_STATUS.NOT_FOUND, code, message, details);
  }
}

export class ConflictError extends ApiError {
  /**
   * @param {ErrorCode} [code]
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(code = ERROR_CODES.CONFLICT, message = 'That conflicts with existing data.', details = null) {
    super(HTTP_STATUS.CONFLICT, code, message, details);
  }
}

export class PayloadTooLargeError extends ApiError {
  /**
   * @param {ErrorCode} [code]
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(code = ERROR_CODES.FILE_TOO_LARGE, message = 'That file is too large.', details = null) {
    super(HTTP_STATUS.PAYLOAD_TOO_LARGE, code, message, details);
  }
}

export class UnsupportedMediaTypeError extends ApiError {
  /**
   * @param {ErrorCode} [code]
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(
    code = ERROR_CODES.UNSUPPORTED_FILE_TYPE,
    message = 'That file type is not supported.',
    details = null,
  ) {
    super(HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE, code, message, details);
  }
}

export class ValidationError extends ApiError {
  /**
   * @param {Array<{field: string, message: string, value?: unknown}>} fieldErrors
   * @param {string} [message]
   */
  constructor(fieldErrors = [], message = 'Validation failed.') {
    super(HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_ERROR, message, fieldErrors);
  }
}

export class TooManyRequestsError extends ApiError {
  /**
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(message = 'Too many requests. Please try again shortly.', details = null) {
    super(HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODES.TOO_MANY_REQUESTS, message, details);
  }
}

export class InternalError extends ApiError {
  /**
   * @param {ErrorCode} [code]
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(
    code = ERROR_CODES.INTERNAL_ERROR,
    message = 'Something went wrong on our end.',
    details = null,
  ) {
    super(HTTP_STATUS.INTERNAL_SERVER_ERROR, code, message, details);
    this.isOperational = false;
  }
}

export class ServiceUnavailableError extends ApiError {
  /**
   * @param {ErrorCode} [code]
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(
    code = ERROR_CODES.SERVICE_UNAVAILABLE,
    message = 'That service is temporarily unavailable.',
    details = null,
  ) {
    super(HTTP_STATUS.SERVICE_UNAVAILABLE, code, message, details);
  }
}
