import { BOOKMARK_ENTITY } from '@verihire/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { MESSAGES } from '../constants/messages.js';
import * as bookmarkService from '../services/bookmark.service.js';
import { toJobCard } from '../dtos/response/job.response.dto.js';
import { toCandidateCard } from '../dtos/response/candidate.response.dto.js';

const actorOf = (req) => ({ id: req.user.id, role: req.user.role, email: req.user.email });

/**
 * ★ One idempotent toggle rather than save/unsave routes.
 *
 * The UI is a single button whose state can be stale — two tabs, a slow network, an
 * optimistic update that lost. A client that thinks something is unsaved when it is saved
 * would get a 409 for pressing exactly the button it was showing.
 */
export const toggle = asyncHandler(async (req, res) => {
  const result = await bookmarkService.toggle(req.validated, actorOf(req));

  return ApiResponse.ok(
    res,
    { saved: result.saved, entityId: req.validated.entityId },
    result.saved ? MESSAGES.BOOKMARK.CREATED : MESSAGES.BOOKMARK.REMOVED,
  );
});

export const list = asyncHandler(async (req, res) => {
  const entityType = req.validated.entityType ?? BOOKMARK_ENTITY.JOB;
  const result = await bookmarkService.list(req.user.id, { ...req.validated, entityType });

  const project = entityType === BOOKMARK_ENTITY.JOB ? toJobCard : toCandidateCard;

  return ApiResponse.paginated(
    res,
    {
      ...result,
      items: result.items.map((row) => ({
        id: row.id,
        savedAt: row.savedAt,
        note: row.note,
        collectionName: row.collectionName,
        entityId: row.entityId,
        // Tombstoned rather than dropped: a saved listing that was pulled should say so,
        // not vanish and leave the user wondering whether they imagined saving it.
        isAvailable: row.isAvailable,
        entity: row.entity ? project(row.entity) : null,
      })),
    },
    MESSAGES.BOOKMARK.LIST_FETCHED,
  );
});

export const update = asyncHandler(async (req, res) => {
  const { id, ...patch } = req.validated;
  const bookmark = await bookmarkService.update(req.user.id, id, patch);
  return ApiResponse.ok(
    res,
    { id: String(bookmark._id), note: bookmark.note, collectionName: bookmark.collectionName },
    MESSAGES.BOOKMARK.CREATED,
  );
});

export const collections = asyncHandler(async (req, res) => {
  const entityType = req.validated?.entityType ?? BOOKMARK_ENTITY.JOB;
  const names = await bookmarkService.collections(req.user.id, entityType);
  return ApiResponse.ok(res, names, MESSAGES.BOOKMARK.LIST_FETCHED);
});
