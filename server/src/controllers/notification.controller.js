import { NOTIFICATION_CONFIG } from '@verihire/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { MESSAGES } from '../constants/messages.js';
import * as notificationService from '../services/notification.service.js';

/** Presentation shape. Kept small — the bell renders twenty of these. */
const toRow = (n) => ({
  id: String(n._id ?? n.id),
  type: n.type,
  title: n.title,
  body: n.body ?? null,
  link: n.link ?? null,
  icon: n.icon ?? NOTIFICATION_CONFIG[n.type]?.icon ?? 'bell',
  priority: n.priority,
  entity: n.entity?.id
    ? { type: n.entity.type, id: String(n.entity.id), label: n.entity.label ?? null }
    : null,
  isRead: n.isRead,
  readAt: n.readAt ?? null,
  createdAt: n.createdAt,
});

export const list = asyncHandler(async (req, res) => {
  const result = await notificationService.list(req.user.id, req.validated ?? {});
  return ApiResponse.paginated(
    res,
    { ...result, items: result.items.map(toRow) },
    MESSAGES.NOTIFICATION.LIST_FETCHED,
  );
});

/**
 * The bell badge.
 *
 * Its own endpoint rather than a field on the list: the client polls this every 60 seconds,
 * and paying for a full page of documents to render a number would be twenty times the
 * payload for none of the information.
 */
export const summary = asyncHandler(async (req, res) => {
  const counts = await notificationService.summary(req.user.id);
  return ApiResponse.ok(res, counts, MESSAGES.NOTIFICATION.COUNT_FETCHED);
});

export const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.user.id, req.validated.id);
  return ApiResponse.ok(res, toRow(notification), MESSAGES.NOTIFICATION.MARKED_READ);
});

export const markAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.user.id);
  return ApiResponse.ok(res, result, MESSAGES.NOTIFICATION.ALL_MARKED_READ);
});

export const remove = asyncHandler(async (req, res) => {
  await notificationService.remove(req.user.id, req.validated.id);
  return ApiResponse.ok(res, null, MESSAGES.NOTIFICATION.DELETED);
});

/** Clears read notifications only — an unread one is still owed to the user. */
export const clearRead = asyncHandler(async (req, res) => {
  const result = await notificationService.clearRead(req.user.id);
  return ApiResponse.ok(res, result, MESSAGES.NOTIFICATION.CLEARED);
});

/** Lets the preferences screen render from the same table the server delivers from. */
export const config = asyncHandler(async (_req, res) =>
  ApiResponse.ok(res, notificationService.deliveryConfig(), MESSAGES.NOTIFICATION.LIST_FETCHED),
);
