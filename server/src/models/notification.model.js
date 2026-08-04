import mongoose from 'mongoose';
import {
  NOTIFICATION_CONFIG,
  NOTIFICATION_PRIORITY,
  NOTIFICATION_TYPE_VALUES,
} from '@verihire/shared';
import { toJSONPlugin } from './plugins/toJSON.plugin.js';
import { paginatePlugin } from './plugins/paginate.plugin.js';

/**
 * In-app notifications.
 *
 * ★ Deliberately **not** soft-deleted, unlike every other collection here. A notification is
 * a transient pointer at something that already has a durable record — the job, the
 * application, the audit log. Keeping "your application was viewed" for ninety days after
 * the user dismissed it serves nobody and grows without bound: this is the highest-volume
 * collection in the product by an order of magnitude.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    type: { type: String, enum: NOTIFICATION_TYPE_VALUES, required: true },

    title: { type: String, required: true, trim: true, maxlength: 150 },
    body: { type: String, trim: true, maxlength: 500, default: null },

    /**
     * Where clicking it goes. Stored as a client-relative path, not a full URL: the same
     * row must resolve correctly from localhost, a preview deploy and production.
     */
    link: { type: String, default: null },

    /** What it is about, so the UI can render an icon and the row can be deep-linked. */
    entity: {
      type: { type: String, default: null },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      label: { type: String, default: null },
    },

    priority: {
      type: String,
      enum: Object.values(NOTIFICATION_PRIORITY),
      default: NOTIFICATION_PRIORITY.NORMAL,
    },
    icon: { type: String, default: 'bell' },

    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },

    /**
     * ★ Idempotency key for notifications that can legitimately fire twice.
     *
     * "Your job expires in 3 days" runs from a cron; a retry, a redeploy mid-run, or two
     * worker replicas would otherwise post it repeatedly. Rows that carry a key are upserted
     * on it. Rows without one — two people applying to the same job — are distinct events
     * and must never be collapsed.
     *
     * No `default: null`. The field is absent unless set, which is what keeps those rows out
     * of the partial index below.
     */
    dedupeKey: { type: String },

    /**
     * TTL anchor. Read notifications are swept sooner by the cleanup cron; this index is the
     * backstop that guarantees the collection cannot grow forever even if the cron stops.
     */
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 86_400_000),
    },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

/* ------------------------------------------------------------------ indexes */

// The bell: unread first, newest first, for one user.
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

/**
 * ★ PARTIAL, not sparse.
 *
 * `sparse` on a *compound* index only skips a document when every indexed field is missing.
 * `recipient` is always present, so a sparse index here would still index every row and the
 * second notification without a `dedupeKey` would collide on `{recipient, dedupeKey: null}` —
 * meaning two people applying to the same job would produce one notification and a 500.
 *
 * A partial index restricted to string keys is the correct tool: rows without a key are not
 * in the index at all, so they are unconstrained.
 */
notificationSchema.index(
  { recipient: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string' } },
    name: 'notification_dedupe',
  },
);

// Mongo's TTL monitor deletes on this automatically.
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/* ------------------------------------------------------------------ statics */

/**
 * Creates a notification from its type's configuration.
 *
 * Returns `null` — rather than throwing or silently writing — when the type is configured
 * `inApp: false`. That table in `shared/constants/notifications.js` is the single place
 * delivery is decided, so muting a type in-app is a data change, not a code change.
 *
 * @this {import('mongoose').Model<any>}
 * @param {{recipient: string, type: string, title: string, body?: string, link?: string,
 *          entity?: {type?: string, id?: string, label?: string},
 *          dedupeKey?: string}} input
 */
notificationSchema.statics.push = async function push(input) {
  const config = NOTIFICATION_CONFIG[input.type];
  if (!config?.inApp) return null;

  const doc = {
    recipient: input.recipient,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    entity: input.entity ?? {},
    priority: config.priority ?? NOTIFICATION_PRIORITY.NORMAL,
    icon: config.icon ?? 'bell',
    // Omitted, not nulled — see the partial index above.
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  };

  if (!input.dedupeKey) return this.create(doc);

  /**
   * Upsert on the key.
   *
   * `$setOnInsert` on the whole document means a repeat firing does NOT reset `isRead` — a
   * user who already dismissed "expires in 3 days" should not have it reappear unread
   * because the cron ran again.
   */
  return this.findOneAndUpdate(
    { recipient: input.recipient, dedupeKey: input.dedupeKey },
    { $setOnInsert: doc },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

notificationSchema.plugin(toJSONPlugin);
notificationSchema.plugin(paginatePlugin);

/**
 * @typedef {import('mongoose').Model<any> & {
 *   push(input: {recipient: string, type: string, title: string, body?: string|null,
 *     link?: string|null, entity?: {type?: string, id?: string, label?: string},
 *     dedupeKey?: string}): Promise<any>
 * }} NotificationModel
 */

/**
 * `push` is asserted here rather than declared in `types/mongoose.d.ts` because it belongs to
 * this model alone. That file augments *every* model, so a one-off static there would make
 * `Job.push(...)` typecheck and then fail at runtime.
 *
 * The double cast is the JSDoc way of saying "I know Mongoose cannot infer a runtime-attached
 * static, and I am asserting it exists" — the assertion is checked against the implementation
 * a few lines above, which carries the matching `@this` and `@param` tags.
 *
 * @type {NotificationModel}
 */
export const Notification = /** @type {any} */ (
  mongoose.model('Notification', notificationSchema)
);
export default Notification;
