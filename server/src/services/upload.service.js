import { ERROR_CODES } from '@verihire/shared';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { getCloudinary, FOLDERS, FOLDER_ACCESS } from '../config/cloudinary.js';
import { sanitiseFilename } from '../utils/file.util.js';
import { InternalError } from '../errors/index.js';

/**
 * @typedef {Object} UploadedAsset
 * @property {string} publicId
 * @property {string} url
 * @property {string} originalName
 * @property {string} format
 * @property {number} sizeBytes
 * @property {string} resourceType
 * @property {'public'|'authenticated'} accessMode
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * Uploads a buffer to Cloudinary.
 *
 * Resumes and company documents go up as `type: 'authenticated'`: their delivery URLs
 * require a signature, so possession of a publicId is not possession of the file. A public
 * resume URL is a permanent, unrevocable leak of someone's phone number and address — and
 * "unguessable URL" is not access control.
 *
 * @param {Buffer} buffer
 * @param {{folder: string, originalName: string, publicId?: string,
 *          transformation?: Record<string, any>}} options
 * @returns {Promise<UploadedAsset>}
 */
export const uploadBuffer = async (buffer, { folder, originalName, publicId, transformation }) => {
  const cloudinary = getCloudinary();
  const accessMode = FOLDER_ACCESS[folder] ?? 'public';
  const isImage = [FOLDERS.AVATAR, FOLDERS.COMPANY_LOGO, FOLDERS.COMPANY_COVER].includes(folder);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        // `raw` for PDFs/DOCX — Cloudinary must not try to transform them as images.
        resource_type: isImage ? 'image' : 'raw',
        type: accessMode === 'authenticated' ? 'authenticated' : 'upload',
        overwrite: true,
        invalidate: true,
        // Cloudinary's own AV/type check, in addition to our magic-byte validation.
        ...(isImage ? { transformation: transformation ?? [{ quality: 'auto:good' }] } : {}),
      },
      (error, result) => {
        if (error || !result) {
          logger.error('Cloudinary upload failed', { folder, message: error?.message });
          reject(new InternalError(ERROR_CODES.UPLOAD_FAILED, 'Upload failed. Please try again.'));
          return;
        }

        resolve({
          publicId: result.public_id,
          url: result.secure_url,
          originalName: sanitiseFilename(originalName),
          format: result.format ?? originalName.split('.').pop() ?? '',
          sizeBytes: result.bytes,
          resourceType: result.resource_type,
          accessMode,
          width: result.width,
          height: result.height,
        });
      },
    );

    stream.end(buffer);
  });
};

/**
 * Mints a short-lived signed URL for a private asset.
 *
 * Deliberately short (default 5 minutes): the URL is handed to one browser for one
 * download. A long-lived signed URL that leaks into a shared document or a browser history
 * export is functionally a public URL.
 *
 * @param {string} publicId
 * @param {{resourceType?: string, expiresInSeconds?: number, download?: boolean,
 *          filename?: string}} [opts]
 * @returns {string}
 */
export const getSignedUrl = (publicId, opts = {}) => {
  const cloudinary = getCloudinary();
  const ttl = opts.expiresInSeconds ?? env.SIGNED_URL_TTL_SECONDS;

  return cloudinary.url(publicId, {
    resource_type: opts.resourceType ?? 'raw',
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + ttl,
    ...(opts.download
      ? { flags: `attachment${opts.filename ? `:${sanitiseFilename(opts.filename)}` : ''}` }
      : {}),
  });
};

/**
 * @param {string} publicId
 * @param {{resourceType?: string, accessMode?: string}} [opts]
 */
export const destroyAsset = async (publicId, opts = {}) => {
  if (!publicId) return false;
  try {
    const cloudinary = getCloudinary();
    await cloudinary.uploader.destroy(publicId, {
      resource_type: opts.resourceType ?? 'raw',
      type: opts.accessMode === 'authenticated' ? 'authenticated' : 'upload',
      invalidate: true,
    });
    return true;
  } catch (error) {
    // A failed delete leaves an orphan in storage; it must not fail the user's request.
    // The weekly cleanup cron sweeps these up.
    logger.warn('Cloudinary delete failed — orphaned asset', {
      publicId,
      message: /** @type {Error} */ (error).message,
    });
    return false;
  }
};

/**
 * Downloads a private asset back into memory — used by the resume parse worker.
 * @param {string} publicId
 * @returns {Promise<Buffer>}
 */
export const downloadAsset = async (publicId) => {
  const url = getSignedUrl(publicId, { expiresInSeconds: 120 });
  const response = await fetch(url);
  if (!response.ok) {
    throw new InternalError(
      ERROR_CODES.UPLOAD_FAILED,
      `Could not retrieve stored file (${response.status})`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
};

export { FOLDERS };
export default { uploadBuffer, getSignedUrl, destroyAsset, downloadAsset, FOLDERS };
