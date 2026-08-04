import { v2 as cloudinary } from 'cloudinary';
import env from './env.js';
import logger from './logger.js';

let configured = false;

export const getCloudinary = () => {
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
    logger.info('Cloudinary configured', { cloud: env.CLOUDINARY_CLOUD_NAME });
  }
  return cloudinary;
};

/**
 * Storage folders.
 *
 * Resumes and KYC documents are uploaded as `type: 'authenticated'`, which means their
 * Cloudinary URLs are useless without a signature. Logos and avatars are public because
 * they are rendered on public pages.
 */
/**
 * Annotated `string` rather than left to infer as template-literal types. The folder is a
 * plain string everywhere it travels — through the uploader, into `FOLDER_ACCESS` lookups and
 * membership tests — and the inferred `` `${string}/avatars` `` types make each of those a
 * type error without buying any safety the `FOLDER_ACCESS` map does not already give.
 *
 * @type {Readonly<Record<'RESUME'|'AVATAR'|'COMPANY_LOGO'|'COMPANY_COVER'|'COMPANY_DOCS', string>>}
 */
export const FOLDERS = Object.freeze({
  RESUME: `${env.CLOUDINARY_FOLDER}/resumes`,
  AVATAR: `${env.CLOUDINARY_FOLDER}/avatars`,
  COMPANY_LOGO: `${env.CLOUDINARY_FOLDER}/logos`,
  COMPANY_COVER: `${env.CLOUDINARY_FOLDER}/covers`,
  COMPANY_DOCS: `${env.CLOUDINARY_FOLDER}/documents`,
});

/** @type {Record<string, 'public'|'authenticated'>} */
export const FOLDER_ACCESS = Object.freeze({
  [FOLDERS.RESUME]: 'authenticated',
  [FOLDERS.COMPANY_DOCS]: 'authenticated',
  [FOLDERS.AVATAR]: 'public',
  [FOLDERS.COMPANY_LOGO]: 'public',
  [FOLDERS.COMPANY_COVER]: 'public',
});

export default getCloudinary;
