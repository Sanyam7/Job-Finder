import mongoose from 'mongoose';

/**
 * A refresh-token session.
 *
 * ★ ADR-004 — rotation with family-based reuse detection.
 *
 * Every login starts a *family* (a uuid). Each refresh revokes the presented token and issues
 * a successor in the same family. If a token that has already been revoked is presented again,
 * exactly one thing can be true: someone copied it. We cannot tell whether the attacker or the
 * legitimate user is holding the newer token, so we revoke the whole family and force a
 * re-login. That converts a stolen refresh token from "persistent access" into "one use, then
 * both parties are locked out and the user is alerted".
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /** SHA-256 of the raw token. The raw value exists only in the user's cookie. */
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      private: true,
    },

    /** Groups every token descended from one login. */
    family: {
      type: String,
      required: true,
      index: true,
    },

    expiresAt: { type: Date, required: true },

    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: ['ROTATED', 'LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'PASSWORD_CHANGED', 'ADMIN', null],
      default: null,
    },
    /** The token that superseded this one — makes the chain walkable during an incident. */
    replacedBy: { type: String, default: null, private: true },

    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 500 },
    device: { type: String, default: null },
  },
  { timestamps: true },
);

/**
 * TTL index — Mongo removes expired sessions on its own, so the collection cannot grow
 * without bound even if the purge cron stops running.
 */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ user: 1, revokedAt: 1 });
refreshTokenSchema.index({ family: 1, revokedAt: 1 });

refreshTokenSchema.virtual('isExpired').get(function isExpired() {
  return this.expiresAt.getTime() <= Date.now();
});

refreshTokenSchema.virtual('isActive').get(function isActive() {
  return !this.revokedAt && this.expiresAt.getTime() > Date.now();
});

refreshTokenSchema.set('toJSON', {
  virtuals: true,
  /**
   * `ret` is widened because the transform *rewrites* the shape — `_id` out, `id` in — so
   * the raw document type Mongoose infers is not what this function returns.
   *
   * @param {any} _doc
   * @param {Record<string, any>} ret
   */
  transform(_doc, ret) {
    delete ret.tokenHash;
    delete ret.replacedBy;
    delete ret.__v;
    ret.id = ret._id?.toString?.();
    delete ret._id;
    return ret;
  },
});

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
export default RefreshToken;
