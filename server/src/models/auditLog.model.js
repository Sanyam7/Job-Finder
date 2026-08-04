import mongoose from 'mongoose';
import { ACTOR_ROLE, AUDIT_ACTION_VALUES, AUDIT_ENTITY_VALUES } from '@verihire/shared';
import { paginatePlugin } from './plugins/paginate.plugin.js';

/**
 * Immutable moderation record.
 *
 * This is a trust platform: every decision an admin makes must be reviewable months later,
 * including what the record looked like before and after. The model deliberately exposes no
 * update or delete path, and the schema is `strict` so a caller cannot smuggle extra fields
 * into the record.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: {
      type: String,
      enum: Object.values(ACTOR_ROLE),
      default: ACTOR_ROLE.SYSTEM,
    },
    actorEmail: { type: String, default: null },

    action: { type: String, enum: AUDIT_ACTION_VALUES, required: true, index: true },
    entityType: { type: String, enum: AUDIT_ENTITY_VALUES, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    entityLabel: { type: String, default: null },

    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, maxlength: 1000, default: null },

    ip: { type: String, default: null },
    userAgent: { type: String, maxlength: 500, default: null },
    requestId: { type: String, default: null },

    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false, strict: true },
);

auditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });
auditLogSchema.index({ actor: 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });

/**
 * Blocks mutation at the model level.
 *
 * An append-only intent enforced only by convention lasts until the first person who needs
 * to "fix" a record. These hooks make it a property of the model instead.
 */
/** @param {(err?: any) => void} next */
const blockMutation = function blockMutation(next) {
  next(new Error('Audit logs are append-only and cannot be modified or deleted'));
};

for (const hook of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  // The hook name is a runtime string, so TypeScript cannot select the matching `pre`
  // overload. The set is fixed and listed right here.
  auditLogSchema.pre(/** @type {any} */ (hook), blockMutation);
}

auditLogSchema.set('toJSON', {
  virtuals: true,
  /**
   * @param {any} _doc
   * @param {Record<string, any>} ret
   */
  transform(_doc, ret) {
    ret.id = ret._id?.toString?.();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

auditLogSchema.plugin(paginatePlugin);

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
