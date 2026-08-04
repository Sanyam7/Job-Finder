import { BOOKMARK_ENTITY, ERROR_CODES, ROLES } from '@verihire/shared';
import { Bookmark } from '../models/bookmark.model.js';
import { jobRepository, buildPublicJobFilter } from '../repositories/job.repository.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';

/**
 * Saved jobs and saved candidates.
 *
 * ★ Saving is subject to the same gates as viewing. A candidate cannot bookmark a job that
 * is not publicly visible, and an employer cannot bookmark a candidate who has not opted
 * into search — otherwise "save" becomes a way to build a private index of things you were
 * never allowed to see, and to keep a pointer to a listing after an admin pulled it.
 */

/**
 * @param {string} entityType
 * @param {string} entityId
 * @param {{id: string, role: string}} actor
 */
const assertMayBookmark = async (entityType, entityId, actor) => {
  if (entityType === BOOKMARK_ENTITY.JOB) {
    if (actor.role !== ROLES.CANDIDATE) {
      throw new ForbiddenError(ERROR_CODES.INSUFFICIENT_PERMISSIONS, 'Only candidates save jobs.');
    }

    // The public filter, not a bare id lookup.
    const job = await jobRepository.findOne(buildPublicJobFilter({ _id: entityId }), {
      select: '_id title',
    });
    if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);
    return { label: job.title };
  }

  if (entityType === BOOKMARK_ENTITY.CANDIDATE) {
    if (actor.role !== ROLES.EMPLOYER && actor.role !== ROLES.ADMIN) {
      throw new ForbiddenError(
        ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        'Only employers save candidates.',
      );
    }

    const candidate = await candidateRepository.findDiscoverableById(entityId);
    if (!candidate) {
      // 404 rather than 403 — a private profile must not be confirmable by its id.
      throw new NotFoundError(ERROR_CODES.PROFILE_NOT_FOUND, MESSAGES.CANDIDATE.NOT_VISIBLE);
    }
    return { label: candidate.headline ?? 'Candidate' };
  }

  throw new NotFoundError(ERROR_CODES.NOT_FOUND, MESSAGES.ERROR.NOT_FOUND);
};

/**
 * ★ Toggles a bookmark, and reports which way it went.
 *
 * A single idempotent endpoint rather than separate save/unsave routes: the UI is one button
 * whose state can be stale, and a client that thinks something is unsaved when it is saved
 * would otherwise get a 409 for pressing the button it was showing.
 *
 * @param {{entityType: string, entityId: string, note?: string, collectionName?: string}} dto
 * @param {{id: string, role: string}} actor
 */
export const toggle = async (dto, actor) => {
  const { label } = await assertMayBookmark(dto.entityType, dto.entityId, actor);

  const existing = await Bookmark.findOne({
    user: actor.id,
    entityType: dto.entityType,
    entityId: dto.entityId,
  });

  if (existing) {
    await existing.deleteOne();
    await bumpSaveCount(dto, -1);
    return { saved: false, bookmark: null, label };
  }

  const bookmark = await Bookmark.create({
    user: actor.id,
    entityType: dto.entityType,
    entityId: dto.entityId,
    note: dto.note ?? null,
    collectionName: dto.collectionName ?? null,
  }).catch((error) => {
    // Lost the race with a concurrent save — the row exists, which is what was wanted.
    if (/** @type {any} */ (error)?.code === 11000) return null;
    throw error;
  });

  if (bookmark) await bumpSaveCount(dto, 1);
  return { saved: true, bookmark, label };
};

/**
 * Keeps the job's `stats.saves` counter in step.
 *
 * Fire-and-forget: a counter drifting by one is not worth failing a bookmark over, and the
 * authoritative number is always a `countDocuments` away.
 *
 * @param {{entityType: string, entityId: string}} dto
 * @param {number} delta
 */
const bumpSaveCount = async (dto, delta) => {
  if (dto.entityType !== BOOKMARK_ENTITY.JOB) return;
  await jobRepository
    .updateById(dto.entityId, { $inc: { 'stats.saves': delta } }, { runValidators: false })
    .catch(() => {});
};

/**
 * @param {string} userId
 * @param {{entityType: string, collectionName?: string, page?: number, limit?: number}} criteria
 */
export const list = async (userId, criteria) => {
  const filter = { user: userId, entityType: criteria.entityType };
  if (criteria.collectionName) filter.collectionName = criteria.collectionName;

  const page = await Bookmark.paginate(filter, {
    page: criteria.page,
    limit: criteria.limit,
    sort: '-createdAt',
  });

  /**
   * ★ Saved jobs are re-filtered through the public gate on read.
   *
   * A job saved last week may since have been rejected, archived, or belonged to a company
   * that has been suspended. The bookmark row survives; the listing must not reappear.
   * Rows whose target is no longer visible come back as tombstones so the UI can say "this
   * listing is no longer available" instead of rendering a blank card.
   */
  const items = await hydrate(page.items, criteria.entityType);
  return { ...page, items };
};

/**
 * @param {any[]} bookmarks
 * @param {string} entityType
 */
const hydrate = async (bookmarks, entityType) => {
  if (!bookmarks.length) return [];
  const ids = bookmarks.map((b) => b.entityId);

  if (entityType === BOOKMARK_ENTITY.JOB) {
    const jobs = await jobRepository.find(buildPublicJobFilter({ _id: { $in: ids } }));
    const byId = new Map(jobs.map((j) => [String(j._id), j]));

    return bookmarks.map((b) => ({
      id: String(b._id),
      savedAt: b.createdAt,
      note: b.note,
      collectionName: b.collectionName,
      entityId: String(b.entityId),
      entity: byId.get(String(b.entityId)) ?? null,
      isAvailable: byId.has(String(b.entityId)),
    }));
  }

  const candidates = await candidateRepository.find(
    { _id: { $in: ids }, openToWork: true, deletedAt: null },
    { populate: { path: 'user', select: 'firstName lastName avatar' } },
  );
  const byId = new Map(candidates.map((c) => [String(c._id), c]));

  return bookmarks.map((b) => ({
    id: String(b._id),
    savedAt: b.createdAt,
    note: b.note,
    collectionName: b.collectionName,
    entityId: String(b.entityId),
    entity: byId.get(String(b.entityId)) ?? null,
    isAvailable: byId.has(String(b.entityId)),
  }));
};

/**
 * @param {string} userId
 * @param {string} bookmarkId
 * @param {{note?: string, collectionName?: string}} patch
 */
export const update = async (userId, bookmarkId, patch) => {
  const bookmark = await Bookmark.findOneAndUpdate(
    { _id: bookmarkId, user: userId },
    { $set: patch },
    { new: true, runValidators: true },
  );
  if (!bookmark) throw new NotFoundError(ERROR_CODES.NOT_FOUND, MESSAGES.ERROR.NOT_FOUND);
  return bookmark;
};

/** The distinct folder names this user has created, for the sidebar. */
export const collections = (userId, entityType) =>
  Bookmark.distinct('collectionName', {
    user: userId,
    entityType,
    collectionName: { $ne: null },
  });

/**
 * @param {string} userId
 * @param {string} entityType
 * @param {(string|import('mongoose').Types.ObjectId)[]} entityIds
 */
export const findSavedIds = (userId, entityType, entityIds) =>
  Bookmark.findSavedIds(userId, entityType, entityIds);

export default { toggle, list, update, collections, findSavedIds };
