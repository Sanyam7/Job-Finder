import multer from 'multer';
import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_DOCUMENT_MIME,
  ALLOWED_RESUME_MIME,
  ERROR_CODES,
  LIMITS,
} from '@verihire/shared';
import { validateFileSignature } from '../utils/file.util.js';
import { BadRequestError, PayloadTooLargeError, UnsupportedMediaTypeError } from '../errors/index.js';
import { MESSAGES, format } from '../constants/messages.js';
import logger from '../config/logger.js';

/**
 * Files are buffered in memory, never written to disk.
 *
 * Nothing uploaded here is ever executable or servable from our filesystem — the buffer is
 * validated, forwarded to Cloudinary, and dropped. Writing user uploads to a directory the
 * web server can reach is how "upload a resume" becomes remote code execution.
 */
const memoryStorage = multer.memoryStorage();

/**
 * `readonly` because the allow-lists arrive frozen from the shared package and this only
 * reads them. Declaring `string[]` would force every caller to copy a frozen array purely to
 * satisfy the type.
 *
 * @param {{allowedMime: readonly string[], maxBytes: number, maxFiles?: number}} config
 */
const buildUploader = ({ allowedMime, maxBytes, maxFiles = 1 }) =>
  multer({
    storage: memoryStorage,
    limits: { fileSize: maxBytes, files: maxFiles, fields: 20, parts: 30 },
    fileFilter: (_req, file, cb) => {
      // First pass only. The declared MIME type is a hint, not evidence — the real check
      // happens in verifyFileSignature once we can see the bytes.
      if (!allowedMime.includes(file.mimetype)) {
        cb(new UnsupportedMediaTypeError(ERROR_CODES.UNSUPPORTED_FILE_TYPE, MESSAGES.UPLOAD.INVALID_TYPE));
        return;
      }
      cb(null, true);
    },
  });

export const uploadResume = buildUploader({
  allowedMime: ALLOWED_RESUME_MIME,
  maxBytes: LIMITS.MAX_RESUME_BYTES,
}).single('resume');

export const uploadImage = buildUploader({
  allowedMime: ALLOWED_IMAGE_MIME,
  maxBytes: LIMITS.MAX_IMAGE_BYTES,
}).single('image');

export const uploadDocuments = buildUploader({
  allowedMime: ALLOWED_DOCUMENT_MIME,
  maxBytes: LIMITS.MAX_DOCUMENT_BYTES,
  maxFiles: 5,
}).array('documents', 5);

/**
 * ★ The check that actually matters.
 *
 * Reads the file's magic number and compares it to what was claimed. `resume.pdf` with
 * `Content-Type: application/pdf` that is really an HTML document gets rejected here — the
 * only layer that looks at the bytes rather than at attacker-supplied metadata.
 *
 * @param {string[]} allowedTypes keys from FILE_SIGNATURES
 * @returns {import('express').RequestHandler}
 */
export const verifyFileSignature = (allowedTypes) => (req, _res, next) => {
  const files = req.file ? [req.file] : (req.files ?? []);
  if (!files.length) return next();

  for (const file of files) {
    const result = validateFileSignature(file.buffer, file.originalname, allowedTypes);

    if (!result.valid) {
      logger.warn('Upload rejected by signature check', {
        requestId: req.id,
        userId: req.user?.id,
        claimedMime: file.mimetype,
        detected: result.detected,
        originalName: file.originalname,
      });

      return next(
        new UnsupportedMediaTypeError(
          ERROR_CODES.CORRUPTED_FILE,
          result.reason ?? MESSAGES.UPLOAD.CORRUPTED,
        ),
      );
    }

    file.detectedType = result.detected;
  }

  return next();
};

/** @type {import('express').RequestHandler} */
export const requireFile = (req, _res, next) => {
  const hasFile = Boolean(req.file) || (req.files?.length ?? 0) > 0;
  if (!hasFile) {
    return next(new BadRequestError(ERROR_CODES.MISSING_FIELD, MESSAGES.UPLOAD.NO_FILE));
  }
  return next();
};

/**
 * Multer throws before our validators run, so its errors need translating here rather than
 * only in the global handler.
 * @param {number} maxBytes
 * @returns {import('express').ErrorRequestHandler}
 */
export const handleUploadErrors = (maxBytes) => (err, _req, _res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return next(
      new PayloadTooLargeError(
        ERROR_CODES.FILE_TOO_LARGE,
        format(MESSAGES.UPLOAD.TOO_LARGE, { limit: `${Math.round(maxBytes / 1024 / 1024)}MB` }),
      ),
    );
  }
  return next(err);
};

/** Convenience chains used by the routers. */
export const RESUME_TYPES = ['pdf', 'doc', 'zip']; // zip == docx container
export const IMAGE_TYPES = ['jpg', 'png', 'webp', 'gif'];
export const DOCUMENT_TYPES = ['pdf', 'jpg', 'png', 'doc', 'zip'];
