import { ERROR_CODES, VERIFICATION_STATUS, slugify } from '@verihire/shared';
import logger from '../config/logger.js';
import { employerRepository } from '../repositories/employer.repository.js';
import { jobRepository } from '../repositories/job.repository.js';
import { BadRequestError, ConflictError, NotFoundError } from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';
import { buildSnapshot } from './verification.service.js';
import * as uploadService from './upload.service.js';
import { FOLDERS } from '../config/cloudinary.js';

/**
 * Company-profile fields that were part of what an admin verified.
 *
 * Changing any of them invalidates the verification: if a company could rename itself and
 * swap its website after approval, the verified badge would attest to nothing. Cosmetic
 * fields (description, tagline, logo, size) do not carry that weight.
 */
const VERIFIED_CORE_FIELDS = ['companyName', 'website', 'gstNumber'];
const VERIFIED_CORE_NESTED = ['contact.email'];

/**
 * Creates the empty company profile that accompanies an employer sign-up.
 *
 * Called from `authService.register` inside the same transaction as the user, so an
 * employer account cannot exist without one. It has to be that way rather than a
 * `USER_REGISTERED` subscriber: without a profile every employer endpoint answers 404
 * EMPLOYER_PROFILE_MISSING, including `PATCH /employers/me` — so there is no route back
 * and the account is permanently locked out of the product. That is an invariant of the
 * account, not a side effect of creating one.
 *
 * Idempotent: an existing profile is returned rather than duplicated, so a retry after a
 * partial failure is safe.
 *
 * `slug` is passed as a starting point only — the model's pre-save hook recomputes it to
 * something unique, because two companies genuinely can share a name.
 *
 * @param {{userId: string, companyName: string}} params
 * @param {{session?: import('mongoose').ClientSession|null}} [opts]
 */
export const createForOwner = async ({ userId, companyName }, opts = {}) => {
  const existing = await employerRepository.findByOwner(userId, {
    select: '_id',
    session: opts.session,
  });
  if (existing) return existing;

  return employerRepository.create(
    {
      owner: userId,
      companyName,
      slug: slugify(companyName),
      members: [{ user: userId, role: 'OWNER' }],
      verificationStatus: VERIFICATION_STATUS.UNSUBMITTED,
    },
    { session: opts.session },
  );
};

/** @param {string} userId */
export const getOwnProfile = async (userId) => {
  const employer = await employerRepository.findByOwner(userId, { lean: false });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }
  return employer;
};

/**
 * Updates the company profile.
 *
 * ★ Editing a verified core field resets the company to PENDING and hides its jobs. The
 * response tells the employer this happened — silently unpublishing someone's listings
 * would be worse than refusing the edit.
 *
 * @param {string} userId
 * @param {Record<string, any>} dto
 */
export const updateProfile = async (userId, dto) => {
  const employer = await getOwnProfile(userId);

  const wasVerified = employer.verificationStatus === VERIFICATION_STATUS.VERIFIED;

  const changedCore = [
    ...VERIFIED_CORE_FIELDS.filter(
      (field) => dto[field] !== undefined && dto[field] !== employer.get(field),
    ),
    ...VERIFIED_CORE_NESTED.filter(
      (path) => getNested(dto, path) !== undefined && getNested(dto, path) !== employer.get(path),
    ),
  ];

  applyUpdate(employer, dto);

  const requiresReVerification = wasVerified && changedCore.length > 0;

  if (requiresReVerification) {
    employer.verificationStatus = VERIFICATION_STATUS.PENDING;
    employer.verification.submittedAt = new Date();
    employer.verification.reviewedAt = null;
    employer.verification.reviewedBy = null;
    employer.verification.attemptCount = (employer.verification.attemptCount ?? 0) + 1;
  }

  await employer.save();

  if (requiresReVerification) {
    await jobRepository.setVisibilityForEmployer(String(employer._id), false);
    logger.info('Verified company edited core details — returned to review', {
      employerId: String(employer._id),
      changedCore,
    });
  } else {
    // Keep the denormalised snapshot on their jobs current.
    await jobRepository.refreshCompanySnapshot(
      String(employer._id),
      buildSnapshot(employer, employer.verificationStatus === VERIFICATION_STATUS.VERIFIED),
    );
  }

  return { employer, requiresReVerification, changedCore };
};

/**
 * @param {string} userId
 * @param {Buffer} buffer
 * @param {{originalName: string, kind: 'logo'|'cover'}} meta
 */
export const updateBranding = async (userId, buffer, { originalName, kind }) => {
  const employer = await getOwnProfile(userId);
  const folder = kind === 'logo' ? FOLDERS.COMPANY_LOGO : FOLDERS.COMPANY_COVER;
  const field = kind === 'logo' ? 'logo' : 'coverImage';

  const previous = employer[field]?.publicId;

  const asset = await uploadService.uploadBuffer(buffer, {
    folder,
    originalName,
    publicId: `${kind}-${String(employer._id)}`,
  });

  employer[field] = asset;
  await employer.save();

  // Replaced, not orphaned. Cloudinary overwrite reuses the publicId, so this only fires
  // when the id genuinely changed.
  if (previous && previous !== asset.publicId) {
    await uploadService.destroyAsset(previous, { resourceType: 'image' });
  }

  if (kind === 'logo') {
    await jobRepository.refreshCompanySnapshot(
      String(employer._id),
      buildSnapshot(employer, employer.verificationStatus === VERIFICATION_STATUS.VERIFIED),
    );
  }

  return employer;
};

/**
 * @param {string} userId
 * @param {Array<{buffer: Buffer, originalname: string, size: number}>} files
 * @param {string[]} types
 */
export const addDocuments = async (userId, files, types = []) => {
  const employer = await getOwnProfile(userId);

  // Swapping documents mid-review would let a company show an admin one thing and store
  // another; the set is frozen until a decision is made.
  if (employer.verificationStatus === VERIFICATION_STATUS.PENDING) {
    throw new ConflictError(
      ERROR_CODES.VERIFICATION_IN_PROGRESS,
      MESSAGES.EMPLOYER.DOCUMENTS_LOCKED,
    );
  }

  if ((employer.documents?.length ?? 0) + files.length > 8) {
    throw new BadRequestError(ERROR_CODES.TOO_MANY_FILES, 'You can store at most 8 documents.');
  }

  const uploaded = await Promise.all(
    files.map((file, index) =>
      uploadService.uploadBuffer(file.buffer, {
        folder: FOLDERS.COMPANY_DOCS,
        originalName: file.originalname,
        publicId: `doc-${String(employer._id)}-${Date.now()}-${index}`,
      }),
    ),
  );

  uploaded.forEach((asset, index) => {
    employer.documents.push({
      type: types[index] ?? 'OTHER',
      publicId: asset.publicId,
      url: asset.url,
      originalName: asset.originalName,
      sizeBytes: asset.sizeBytes,
    });
  });

  await employer.save();
  return employer;
};

/**
 * @param {string} userId
 * @param {string} docId
 */
export const removeDocument = async (userId, docId) => {
  const employer = await getOwnProfile(userId);

  if (employer.verificationStatus === VERIFICATION_STATUS.PENDING) {
    throw new ConflictError(
      ERROR_CODES.VERIFICATION_IN_PROGRESS,
      MESSAGES.EMPLOYER.DOCUMENTS_LOCKED,
    );
  }

  const doc = employer.documents.id(docId);
  if (!doc) throw new NotFoundError(ERROR_CODES.NOT_FOUND, 'That document does not exist.');

  const { publicId } = doc;
  employer.documents.pull(docId);
  await employer.save();

  await uploadService.destroyAsset(publicId, { accessMode: 'authenticated' });
  return employer;
};

/** @param {string} slug */
export const getPublicBySlug = async (slug) => {
  const employer = await employerRepository.findPublicBySlug(slug);
  if (!employer) throw new NotFoundError(ERROR_CODES.NOT_FOUND, MESSAGES.EMPLOYER.NOT_FOUND);
  return employer;
};

/* -------------------------------------------------------------------- utils */

/** @param {Record<string, any>} obj @param {string} path */
const getNested = (obj, path) =>
  path.split('.').reduce((cursor, key) => cursor?.[key], obj);

/**
 * Applies a partial update, merging nested objects rather than replacing them.
 *
 * `Object.assign(employer, dto)` would wipe `contact.phone` when the caller sends only
 * `contact.email` — a PATCH that silently deletes data the user did not mention.
 *
 * @param {any} doc
 * @param {Record<string, any>} dto
 */
const applyUpdate = (doc, dto) => {
  for (const [key, value] of Object.entries(dto)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      doc[key] = { ...(doc[key]?.toObject?.() ?? doc[key] ?? {}), ...value };
    } else {
      doc[key] = value;
    }
  }
};

export default {
  createForOwner,
  getOwnProfile,
  updateProfile,
  updateBranding,
  addDocuments,
  removeDocument,
  getPublicBySlug,
};
