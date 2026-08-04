import {
  ERROR_CODES,
  FIELD_SOURCE,
  PARSE_STATUS,
} from '@verihire/shared';
import logger from '../config/logger.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { CandidateProfile } from '../models/candidateProfile.model.js';
import { BadRequestError, ConflictError, NotFoundError } from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';
import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../constants/events.js';
import * as uploadService from './upload.service.js';
import { FOLDERS } from '../config/cloudinary.js';

/**
 * The candidate profile.
 *
 * ★ ADR-006 runs through this whole file: anything a machine extracted lands in
 * `parsedDraft` and is applied only by an explicit, field-by-field request from the person
 * whose profile it is. The brief's "never force AI extracted values" is a storage boundary
 * here, not a UI convention.
 */

/** Sub-document arrays a candidate can edit item by item. */
const COLLECTIONS = Object.freeze([
  'experience',
  'education',
  'projects',
  'certifications',
  'languages',
]);

/**
 * @param {string} userId
 * @param {{lean?: boolean}} [opts]
 */
export const getOwnProfile = async (userId, { lean = false } = {}) => {
  const profile = await candidateRepository.findByUser(userId, { lean });
  if (!profile) {
    throw new NotFoundError(ERROR_CODES.CANDIDATE_PROFILE_MISSING, MESSAGES.CANDIDATE.NOT_FOUND);
  }
  return profile;
};

/**
 * Creates the profile on first access rather than at registration.
 *
 * Registration stays a single write that cannot half-fail; the profile appears the first
 * time the candidate actually opens their dashboard. `upsert` makes it idempotent, which
 * matters because a React double-render will call this twice.
 *
 * @param {string} userId
 */
export const ensureProfile = async (userId) => {
  const existing = await candidateRepository.findByUser(userId, { lean: false });
  if (existing) return existing;

  const profile = await CandidateProfile.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  logger.info('Candidate profile created on first access', { userId });
  return profile;
};

/**
 * ★ Updates scalar profile fields and marks every touched path as USER-authored.
 *
 * The provenance write is the point. Once a path is USER, a later resume parse cannot
 * silently replace it — the review screen has to surface a conflict instead of pre-ticking
 * the machine's version.
 *
 * @param {string} userId
 * @param {Record<string, any>} dto
 */
export const updateProfile = async (userId, dto) => {
  const profile = await ensureProfile(userId);

  const touched = [];
  for (const [key, value] of Object.entries(dto)) {
    if (value === undefined) continue;
    profile.set(key, value);
    touched.push(key);
  }

  profile.markUserEdited(touched);
  await profile.save();

  return { profile, touched };
};

/**
 * @param {string} userId
 * @param {Record<string, any>} preferences
 */
export const updatePreferences = async (userId, preferences) => {
  const profile = await ensureProfile(userId);

  for (const [key, value] of Object.entries(preferences)) {
    if (value !== undefined) profile.set(`preferences.${key}`, value);
  }

  profile.markUserEdited(Object.keys(preferences).map((k) => `preferences.${k}`));
  await profile.save();
  return profile;
};

/**
 * ★ Discoverability, which is the candidate's own switch.
 *
 * Mirrors the employer gate from the other side: employers are visible only after a human
 * approves them, and candidates are searchable only after they opt in. Neither happens by
 * default.
 *
 * @param {string} userId
 * @param {{openToWork?: boolean, profileVisibility?: string}} dto
 */
export const updateVisibility = async (userId, dto) => {
  const profile = await ensureProfile(userId);
  if (dto.openToWork !== undefined) profile.openToWork = dto.openToWork;
  if (dto.profileVisibility !== undefined) profile.profileVisibility = dto.profileVisibility;
  await profile.save();

  logger.info('Candidate visibility changed', {
    userId,
    openToWork: profile.openToWork,
    profileVisibility: profile.profileVisibility,
  });
  return profile;
};

/* ----------------------------------------------------------- sub-documents */

/** @param {string} collection */
const assertCollection = (collection) => {
  if (!COLLECTIONS.includes(collection)) {
    throw new BadRequestError(ERROR_CODES.BAD_REQUEST, `Unknown profile section: ${collection}`);
  }
};

/**
 * @param {string} userId
 * @param {string} collection
 * @param {Record<string, any>} item
 */
export const addItem = async (userId, collection, item) => {
  assertCollection(collection);
  const profile = await ensureProfile(userId);

  // Anything typed into the form is the candidate's, whatever suggested it.
  profile[collection].push({ ...item, source: FIELD_SOURCE.USER });
  await profile.save();

  return profile;
};

/**
 * @param {string} userId
 * @param {string} collection
 * @param {string} itemId
 * @param {Record<string, any>} patch
 */
export const updateItem = async (userId, collection, itemId, patch) => {
  assertCollection(collection);
  const profile = await ensureProfile(userId);

  const item = profile[collection].id(itemId);
  if (!item) throw new NotFoundError(ERROR_CODES.NOT_FOUND, 'That entry no longer exists.');

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) item.set(key, value);
  }
  // Editing a parsed entry makes it the candidate's; a re-parse must not undo their fix.
  item.source = FIELD_SOURCE.USER;

  await profile.save();
  return profile;
};

/**
 * @param {string} userId
 * @param {string} collection
 * @param {string} itemId
 */
export const removeItem = async (userId, collection, itemId) => {
  assertCollection(collection);
  const profile = await ensureProfile(userId);

  const item = profile[collection].id(itemId);
  if (!item) throw new NotFoundError(ERROR_CODES.NOT_FOUND, 'That entry no longer exists.');

  item.deleteOne();
  await profile.save();
  return profile;
};

/**
 * Replaces the whole skill list.
 *
 * Wholesale rather than item-by-item because the UI is a tag input: the user's mental model
 * is "these are my skills now", and diffing that into add/remove calls invents failure modes
 * (half-applied lists) that the user cannot see or recover from.
 *
 * @param {string} userId
 * @param {{name: string, level?: string, yearsOfExperience?: number}[]} skills
 */
export const setSkills = async (userId, skills) => {
  const profile = await ensureProfile(userId);

  // Case-insensitive de-duplication: "React" and "react" are one skill to a human reader.
  const seen = new Set();
  profile.skills = skills.filter((skill) => {
    const key = skill.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((skill) => ({ ...skill, name: skill.name.trim(), source: FIELD_SOURCE.USER }));

  profile.markUserEdited(['skills']);
  await profile.save();
  return profile;
};

/* ---------------------------------------------------------------- avatar */

/**
 * @param {string} userId
 * @param {Buffer} buffer
 * @param {string} originalName
 */
export const updateAvatar = async (userId, buffer, originalName) => {
  const profile = await ensureProfile(userId);

  const asset = await uploadService.uploadBuffer(buffer, {
    folder: FOLDERS.AVATAR,
    originalName,
    publicId: `user-${userId}`,
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto:good' },
    ],
  });

  profile.profilePicture = {
    publicId: asset.publicId,
    url: asset.url,
    originalName: asset.originalName,
    format: asset.format,
    sizeBytes: asset.sizeBytes,
    uploadedAt: new Date(),
  };
  await profile.save();

  // Denormalised onto the user so headers and comment rows do not join the profile.
  await userRepository.updateById(userId, { avatar: asset.url });

  return profile;
};

export const removeAvatar = async (userId) => {
  const profile = await ensureProfile(userId);

  if (profile.profilePicture?.publicId) {
    await uploadService.destroyAsset(profile.profilePicture.publicId, {
      resourceType: 'image',
      accessMode: 'public',
    });
  }

  profile.profilePicture = null;
  await profile.save();
  await userRepository.updateById(userId, { avatar: null });

  return profile;
};

/* ---------------------------------------------------------------- resume */

/**
 * ★ Stores a resume and queues it for parsing.
 *
 * The upload succeeds and the response returns before any parsing happens — parsing is a
 * multi-second CPU-bound job and blocking the request on it makes a 5MB PDF look like a
 * broken button. The profile is usable immediately either way, because parsing only ever
 * produces a *draft*.
 *
 * @param {string} userId
 * @param {Buffer} buffer
 * @param {{originalName: string, sizeBytes: number}} meta
 */
export const uploadResume = async (userId, buffer, meta) => {
  const profile = await ensureProfile(userId);
  const previousPublicId = profile.resume?.publicId ?? null;

  const asset = await uploadService.uploadBuffer(buffer, {
    folder: FOLDERS.RESUME,
    originalName: meta.originalName,
    // Versioned rather than overwritten: an application already made must keep pointing at
    // the exact document the employer received (see `resumeSnapshot`).
    publicId: `user-${userId}-v${(profile.resume?.version ?? 0) + 1}`,
  });

  profile.resume = {
    publicId: asset.publicId,
    url: asset.url,
    originalName: asset.originalName,
    format: asset.format,
    sizeBytes: asset.sizeBytes ?? meta.sizeBytes,
    version: (profile.resume?.version ?? 0) + 1,
    uploadedAt: new Date(),
    parseStatus: PARSE_STATUS.PARSING,
    parseError: null,
  };
  await profile.save();

  /**
   * The old file is deleted only after the new one is safely recorded.
   *
   * Two versions back is not kept: a resume is personal data, and storing every revision
   * forever is a liability nobody asked us to take on. The *snapshot* on an existing
   * application keeps its own reference, which is what actually needs to survive.
   */
  if (previousPublicId && previousPublicId !== asset.publicId) {
    await uploadService.destroyAsset(previousPublicId, { accessMode: 'authenticated' });
  }

  eventBus.emit(EVENTS.RESUME_UPLOADED, {
    userId,
    profileId: String(profile._id),
    publicId: asset.publicId,
    originalName: asset.originalName,
  });

  await scheduleParse(profile, asset, userId);
  return profile;
};

/**
 * Hands the resume to the parse queue, or parses it inline when there is no queue.
 *
 * The inline path is fire-and-forget on purpose: the HTTP response has conceptually already
 * been decided (202 Accepted), and making the candidate wait several seconds for a parse
 * they never asked to block on would turn a working upload into a hung button. Failures land
 * on `resume.parseStatus`, which is what the UI polls.
 *
 * @param {any} profile
 * @param {{publicId: string, format: string}} asset
 * @param {string} userId
 */
const scheduleParse = async (profile, asset, userId) => {
  const { enqueue, QUEUE_NAMES } = await import('../queues/index.js');

  const payload = {
    profileId: String(profile._id),
    publicId: asset.publicId,
    format: asset.format,
    userId,
  };

  const { queued } = await enqueue(QUEUE_NAMES.RESUME_PARSE, 'parse', payload, {
    // Version-scoped, so re-uploading queues a new parse but a retried request does not.
    jobId: `parse:${profile._id}:v${profile.resume.version}`,
  });

  if (queued) return;

  const { runResumeParse } = await import('../queues/resumeParse.job.js');
  runResumeParse(payload).catch((error) => {
    logger.error('Inline resume parse failed', {
      profileId: String(profile._id),
      message: /** @type {Error} */ (error).message,
    });
  });
};

export const removeResume = async (userId) => {
  const profile = await ensureProfile(userId);
  if (!profile.resume?.publicId) {
    throw new NotFoundError(ERROR_CODES.NOT_FOUND, MESSAGES.RESUME.NONE);
  }

  await uploadService.destroyAsset(profile.resume.publicId, { accessMode: 'authenticated' });

  profile.resume = { version: profile.resume.version, parseStatus: PARSE_STATUS.NONE };
  profile.parsedDraft = { extractedAt: null, engine: null, llmUsed: false, fields: null };
  await profile.save();

  return profile;
};

/**
 * A short-lived signed URL for the candidate's own resume.
 * @param {string} userId
 */
export const getOwnResumeUrl = async (userId) => {
  const profile = await getOwnProfile(userId, { lean: true });
  if (!profile.resume?.publicId) {
    throw new NotFoundError(ERROR_CODES.NOT_FOUND, MESSAGES.RESUME.NONE);
  }

  return {
    url: uploadService.getSignedUrl(profile.resume.publicId, {
      download: true,
      filename: profile.resume.originalName,
    }),
    originalName: profile.resume.originalName,
    uploadedAt: profile.resume.uploadedAt,
  };
};

/* ------------------------------------------------------- ★ the parsed draft */

/**
 * Returns the extracted draft alongside the live value for each field.
 *
 * Shaped for a side-by-side review: the candidate sees what they have, what we read, and
 * whether accepting would overwrite something they wrote themselves. Nothing is pre-selected
 * — `selected` is absent by design, because a pre-ticked checkbox is not consent.
 *
 * @param {string} userId
 */
export const getParsedDraft = async (userId) => {
  const profile = await getOwnProfile(userId, { lean: false });
  const draft = profile.parsedDraft;

  if (!draft?.fields) {
    return {
      hasDraft: false,
      parseStatus: profile.resume?.parseStatus ?? PARSE_STATUS.NONE,
      parseError: profile.resume?.parseError ?? null,
      fields: [],
    };
  }

  const fields = Object.entries(draft.fields).map(([path, extracted]) => ({
    path,
    extracted,
    current: profile.get(path) ?? null,
    // ★ The warning that makes this honest.
    conflictsWithUserEdit: profile.isUserEdited(path),
    isEmpty: isBlank(profile.get(path)),
  }));

  return {
    hasDraft: true,
    parseStatus: profile.resume?.parseStatus ?? PARSE_STATUS.NONE,
    extractedAt: draft.extractedAt,
    engine: draft.engine,
    llmUsed: draft.llmUsed,
    appliedAt: draft.appliedAt,
    fields,
  };
};

/** @param {unknown} value */
const isBlank = (value) =>
  value == null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

/**
 * ★ Applies ONLY the paths the candidate explicitly selected.
 *
 * Every other path in the draft is left untouched. There is no "apply all" shortcut on the
 * server: the endpoint takes a list, and an empty list is a no-op. If the UI ever grows an
 * "accept everything" button, it still has to enumerate what it is accepting.
 *
 * @param {string} userId
 * @param {string[]} paths
 */
export const applyParsedDraft = async (userId, paths) => {
  const profile = await getOwnProfile(userId, { lean: false });
  const draft = profile.parsedDraft;

  if (!draft?.fields) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'There is nothing to apply.');
  }

  const applied = [];
  const skipped = [];

  for (const path of paths) {
    if (!(path in draft.fields)) {
      skipped.push({ path, reason: 'NOT_IN_DRAFT' });
      continue;
    }

    profile.set(path, draft.fields[path]);
    // Marked PARSER, not USER: the candidate accepted a machine's reading, they did not
    // write it. A future re-parse may improve it; only their own typing locks a field.
    profile.setFieldSource(path, FIELD_SOURCE.PARSER);
    applied.push(path);
  }

  profile.parsedDraft.appliedAt = new Date();
  await profile.save();

  logger.info('Parsed resume draft applied', { userId, applied: applied.length });
  return { profile, applied, skipped };
};

/**
 * Throws the draft away. The profile is untouched — that is the whole point of the endpoint.
 * @param {string} userId
 */
export const discardParsedDraft = async (userId) => {
  const profile = await getOwnProfile(userId, { lean: false });
  profile.parsedDraft = { extractedAt: null, engine: null, llmUsed: false, fields: null };
  await profile.save();
  return profile;
};

/* ------------------------------------------------------------ employer view */

/**
 * ★ What an employer may see of a candidate.
 *
 * Two independent doors: the candidate opted into search, or they applied to one of this
 * employer's jobs. Neither implies the other, and there is no third door.
 *
 * @param {string} candidateProfileId
 * @param {{id: string, role: string}} actor
 */
export const getForEmployer = async (candidateProfileId, actor) => {
  const discoverable = await candidateRepository.findDiscoverableById(candidateProfileId);
  if (discoverable) {
    candidateRepository.incrementViews(candidateProfileId).catch(() => {});
    return { profile: discoverable, via: 'DISCOVERABLE' };
  }

  const { employerRepository } = await import('../repositories/employer.repository.js');
  const { applicationRepository } = await import('../repositories/application.repository.js');

  const employer = await employerRepository.findByOwner(actor.id, { select: '_id' });
  if (employer) {
    const applied = await applicationRepository.exists({
      candidateProfile: candidateProfileId,
      employer: employer._id,
      deletedAt: null,
    });

    if (applied) {
      const profile = await candidateRepository
        .findById(candidateProfileId, { lean: false })
        .populate('user', 'firstName lastName avatar');
      if (profile) return { profile, via: 'APPLICATION' };
    }
  }

  // 404, not 403 — a private profile must not be confirmable by its id.
  throw new NotFoundError(ERROR_CODES.PROFILE_NOT_FOUND, MESSAGES.CANDIDATE.NOT_VISIBLE);
};

export default {
  getOwnProfile,
  ensureProfile,
  updateProfile,
  updatePreferences,
  updateVisibility,
  addItem,
  updateItem,
  removeItem,
  setSkills,
  updateAvatar,
  removeAvatar,
  uploadResume,
  removeResume,
  getOwnResumeUrl,
  getParsedDraft,
  applyParsedDraft,
  discardParsedDraft,
  getForEmployer,
};
