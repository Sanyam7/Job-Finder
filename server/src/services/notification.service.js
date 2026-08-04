import mongoose from 'mongoose';
import { ERROR_CODES, NOTIFICATION_CONFIG } from '@verihire/shared';
import logger from '../config/logger.js';
import { Notification } from '../models/notification.model.js';
import { NotFoundError } from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';

/**
 * In-app notifications.
 *
 * ★ Nothing here may throw into a caller. Notifications are a side effect of a business
 * action, never part of it: a job must be approved even if the notification write fails.
 * `push()` swallows and logs, exactly like `audit.service.record`.
 */

/**
 * @param {{recipient: string, type: string, title: string, body?: string, link?: string,
 *          entity?: {type?: string, id?: string, label?: string}, dedupeKey?: string}} input
 */
export const push = async (input) => {
  try {
    if (!input.recipient) return null;
    return await Notification.push(input);
  } catch (error) {
    // A duplicate is the dedupe index working as designed, not a failure worth logging loudly.
    if (/** @type {any} */ (error)?.code === 11000) return null;

    logger.error('Notification write failed', {
      type: input.type,
      recipient: String(input.recipient),
      message: /** @type {Error} */ (error).message,
    });
    return null;
  }
};

/**
 * Fans one notification out to several recipients.
 *
 * Used for the admin queue alerts, where every admin should see that a company is waiting.
 *
 * @param {string[]} recipients
 * @param {Omit<Parameters<typeof push>[0], 'recipient'>} input
 */
export const pushMany = async (recipients, input) => {
  const results = await Promise.allSettled(
    recipients.map((recipient) => push({ ...input, recipient })),
  );
  return results.filter((r) => r.status === 'fulfilled' && r.value).length;
};

/**
 * @param {string} userId
 * @param {{unreadOnly?: boolean, type?: string, page?: number, limit?: number}} criteria
 */
export const list = (userId, criteria = {}) => {
  const filter = { recipient: userId };
  if (criteria.unreadOnly) filter.isRead = false;
  if (criteria.type) filter.type = criteria.type;

  return Notification.paginate(filter, {
    page: criteria.page,
    limit: criteria.limit,
    sort: '-createdAt',
  });
};

/** @param {string} userId */
export const unreadCount = (userId) =>
  Notification.countDocuments({ recipient: userId, isRead: false });

/**
 * Counts for the bell and its filter tabs, in one round trip.
 * @param {string} userId
 */
export const summary = async (userId) => {
  const [rows] = await Notification.aggregate([
    { $match: { recipient: toObjectId(userId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: { $sum: { $cond: ['$isRead', 0, 1] } },
        highPriorityUnread: {
          $sum: { $cond: [{ $and: [{ $eq: ['$isRead', false] }, { $eq: ['$priority', 'HIGH'] }] }, 1, 0] },
        },
      },
    },
  ]);

  return {
    total: rows?.total ?? 0,
    unread: rows?.unread ?? 0,
    highPriorityUnread: rows?.highPriorityUnread ?? 0,
  };
};

/** Aggregations do not cast ids — see the note in application.repository.js. */
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Marks one notification read.
 *
 * Scoped by `recipient` in the *filter*, not checked after loading: a query that cannot
 * match another user's row is a stronger guarantee than an `if` that could be removed.
 *
 * @param {string} userId
 * @param {string} notificationId
 */
export const markRead = async (userId, notificationId) => {
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  );

  if (!updated) throw new NotFoundError(ERROR_CODES.NOT_FOUND, 'That notification no longer exists.');
  return updated;
};

/** @param {string} userId */
export const markAllRead = async (userId) => {
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  return { updated: result.modifiedCount ?? 0 };
};

/** @param {string} userId @param {string} notificationId */
export const remove = async (userId, notificationId) => {
  const deleted = await Notification.findOneAndDelete({
    _id: notificationId,
    recipient: userId,
  });
  if (!deleted) throw new NotFoundError(ERROR_CODES.NOT_FOUND, MESSAGES.ERROR.NOT_FOUND);
  return true;
};

/** Clears the read ones only — an unread notification is still owed to the user. */
export const clearRead = async (userId) => {
  const result = await Notification.deleteMany({ recipient: userId, isRead: true });
  return { deleted: result.deletedCount ?? 0 };
};

/**
 * Retention sweep, run nightly.
 *
 * The TTL index is the backstop; this is the policy. Read notifications go after 30 days,
 * unread ones are left to the 90-day TTL — a user who has not opened the app in a month
 * should still find out their company was verified.
 *
 * @param {{readAfterDays?: number}} [opts]
 */
export const purgeOld = async ({ readAfterDays = 30 } = {}) => {
  const cutoff = new Date(Date.now() - readAfterDays * 86_400_000);
  const result = await Notification.deleteMany({ isRead: true, readAt: { $lt: cutoff } });

  if (result.deletedCount) {
    logger.info('Purged old notifications', { deleted: result.deletedCount, readAfterDays });
  }
  return { deleted: result.deletedCount ?? 0 };
};

/** Exposed so the client can render the preferences screen from one source of truth. */
export const deliveryConfig = () => NOTIFICATION_CONFIG;

export default {
  push,
  pushMany,
  list,
  unreadCount,
  summary,
  markRead,
  markAllRead,
  remove,
  clearRead,
  purgeOld,
  deliveryConfig,
};
