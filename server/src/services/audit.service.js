import { ACTOR_ROLE } from '@verihire/shared';
import { AuditLog } from '../models/auditLog.model.js';
import logger from '../config/logger.js';

/**
 * Writes an audit entry.
 *
 * Never throws: an audit failure must not roll back the action it was recording. If the
 * write fails we log loudly — a gap in the audit trail is a serious operational signal,
 * but it is still better than a half-applied moderation decision.
 *
 * @param {{actor?: {id: string, role: string, email?: string}|null, action: string,
 *          entityType: string, entityId?: string|null, entityLabel?: string|null,
 *          before?: unknown, after?: unknown, reason?: string|null,
 *          ip?: string|null, userAgent?: string|null, requestId?: string|null}} entry
 */
export const record = async (entry) => {
  try {
    await AuditLog.create({
      actor: entry.actor?.id ?? null,
      actorRole: entry.actor?.role ?? ACTOR_ROLE.SYSTEM,
      actorEmail: entry.actor?.email ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      entityLabel: entry.entityLabel ?? null,
      before: sanitise(entry.before),
      after: sanitise(entry.after),
      reason: entry.reason ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent?.slice(0, 500) ?? null,
      requestId: entry.requestId ?? null,
      at: new Date(),
    });
  } catch (error) {
    logger.error('Audit log write failed', {
      action: entry.action,
      entityId: entry.entityId,
      message: /** @type {Error} */ (error).message,
    });
  }
};

/**
 * Trims a document down to something worth storing.
 *
 * Snapshotting whole documents would put resumes, cover letters and password hashes into a
 * collection that is never deleted. We keep scalars and drop anything large or sensitive.
 *
 * @param {unknown} value
 */
const sanitise = (value) => {
  if (value == null) return null;
  if (typeof value !== 'object') return value;

  const source = /** @type {any} */ (value);
  const plain = source.toObject ? source.toObject() : source;
  const out = {};

  const SKIP = new Set([
    'passwordHash',
    'tokenHash',
    'resume',
    'parsedDraft',
    'coverLetter',
    'documents',
    '__v',
  ]);

  for (const [key, val] of Object.entries(plain)) {
    if (SKIP.has(key)) continue;
    if (val == null) {
      out[key] = null;
    } else if (val instanceof Date) {
      out[key] = val.toISOString();
    } else if (typeof val === 'object') {
      const str = JSON.stringify(val);
      if (str && str.length <= 500) out[key] = val;
    } else if (typeof val === 'string' && val.length > 500) {
      out[key] = `${val.slice(0, 500)}…`;
    } else {
      out[key] = val;
    }
  }

  return out;
};

/**
 * Builds a `{field: {from, to}}` diff for the audit explorer.
 * @param {Record<string, any>} before
 * @param {Record<string, any>} after
 * @param {string[]} [fields]
 */
export const diff = (before = {}, after = {}, fields) => {
  const keys = fields ?? [...new Set([...Object.keys(before), ...Object.keys(after)])];
  /** @type {Record<string, {from: unknown, to: unknown}>} */
  const changes = {};

  for (const key of keys) {
    const from = before?.[key];
    const to = after?.[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  return changes;
};

/**
 * @param {{entityType?: string, entityId?: string, actor?: string, action?: string,
 *          from?: Date, to?: Date, page?: number, limit?: number}} criteria
 */
export const query = (criteria = {}) => {
  const filter = {};
  if (criteria.entityType) filter.entityType = criteria.entityType;
  if (criteria.entityId) filter.entityId = criteria.entityId;
  if (criteria.actor) filter.actor = criteria.actor;
  if (criteria.action) filter.action = criteria.action;
  if (criteria.from || criteria.to) {
    filter.at = {};
    if (criteria.from) filter.at.$gte = criteria.from;
    if (criteria.to) filter.at.$lte = criteria.to;
  }

  return AuditLog.paginate(filter, {
    page: criteria.page,
    limit: criteria.limit,
    sort: '-at',
    populate: { path: 'actor', select: 'firstName lastName email role' },
  });
};

/** @param {number} limit */
export const recentActivity = (limit = 20) =>
  AuditLog.find({})
    .sort('-at')
    .limit(limit)
    .populate('actor', 'firstName lastName role')
    .lean();

export default { record, diff, query, recentActivity };
