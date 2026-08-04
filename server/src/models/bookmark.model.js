import mongoose from 'mongoose';
import { BOOKMARK_ENTITY, BOOKMARK_ENTITY_VALUES } from '@verihire/shared';
import { toJSONPlugin } from './plugins/toJSON.plugin.js';
import { paginatePlugin } from './plugins/paginate.plugin.js';

/**
 * Saved jobs and saved candidates, in one polymorphic collection.
 *
 * One collection rather than two because the shape and every access pattern are identical —
 * "what has this user saved, newest first" — and a second collection would duplicate the
 * uniqueness constraint, the toggle logic and the cleanup. `entityType` keeps the two
 * populated separately, which is the only place they differ.
 */
const bookmarkSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    entityType: { type: String, enum: BOOKMARK_ENTITY_VALUES, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },

    /**
     * A private note on why they saved it.
     *
     * Never leaves the owner's own projections — an employer's "strong, but ask about the
     * gap in 2022" is exactly as sensitive as `Application.employerNotes`.
     */
    note: { type: String, trim: true, maxlength: 500, default: null },

    /** Folder-style grouping, e.g. "Frontend shortlist". */
    collectionName: { type: String, trim: true, maxlength: 60, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

/**
 * ★ Saving twice is not an error and not a duplicate row.
 *
 * The unique index makes the toggle idempotent at the database level: a double-clicked
 * bookmark button, or the same page open in two tabs, cannot produce two rows. The service
 * translates the resulting E11000 into "already saved" rather than a 500.
 */
bookmarkSchema.index(
  { user: 1, entityType: 1, entityId: 1 },
  { unique: true, name: 'one_bookmark_per_entity' },
);

bookmarkSchema.index({ user: 1, entityType: 1, createdAt: -1 });

/**
 * Which of these entities has this user saved?
 *
 * One query for a whole page of cards. The alternative — a lookup per card to decide whether
 * the bookmark icon is filled — is twenty round trips for a twenty-row list.
 *
 * @this {import('mongoose').Model<any>}
 * @param {string} userId
 * @param {string} entityType
 * @param {(string|import('mongoose').Types.ObjectId)[]} entityIds
 * @returns {Promise<Set<string>>}
 */
bookmarkSchema.statics.findSavedIds = async function findSavedIds(userId, entityType, entityIds) {
  if (!entityIds?.length) return new Set();
  const rows = await this.find({ user: userId, entityType, entityId: { $in: entityIds } })
    .select('entityId')
    .lean();
  return new Set(rows.map((r) => String(r.entityId)));
};

bookmarkSchema.plugin(toJSONPlugin);
bookmarkSchema.plugin(paginatePlugin);

export { BOOKMARK_ENTITY };

/**
 * `findSavedIds` is a static on this model only, so it is asserted here rather than added to
 * the global Mongoose augmentation. See the note in `notification.model.js`.
 *
 * @type {import('mongoose').Model<any> & {
 *   findSavedIds(userId: string,
 *     entityType: string,
 *     entityIds: (string|import('mongoose').Types.ObjectId)[]): Promise<Set<string>>
 * }}
 */
export const Bookmark = /** @type {any} */ (mongoose.model('Bookmark', bookmarkSchema));
export default Bookmark;
