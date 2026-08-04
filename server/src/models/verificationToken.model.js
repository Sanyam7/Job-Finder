import mongoose from 'mongoose';

export const TOKEN_TYPE = Object.freeze({
  EMAIL_VERIFY: 'EMAIL_VERIFY',
  PASSWORD_RESET: 'PASSWORD_RESET',
});

/**
 * Single-use, hashed, expiring tokens for email verification and password reset.
 *
 * Only the hash is stored. Someone who dumps this collection gets a list of SHA-256 digests
 * they cannot reverse into working links — the raw token exists only in the email that was
 * sent. `usedAt` makes each link single-use, so a forwarded or archived reset email cannot
 * be replayed months later.
 */
const verificationTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      private: true,
    },
    type: {
      type: String,
      enum: Object.values(TOKEN_TYPE),
      required: true,
    },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true },
);

verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
verificationTokenSchema.index({ user: 1, type: 1, usedAt: 1 });

verificationTokenSchema.virtual('isUsable').get(function isUsable() {
  return !this.usedAt && this.expiresAt.getTime() > Date.now();
});

verificationTokenSchema.set('toJSON', {
  virtuals: true,
  /**
   * @param {any} _doc
   * @param {Record<string, any>} ret
   */
  transform(_doc, ret) {
    delete ret.tokenHash;
    delete ret.__v;
    ret.id = ret._id?.toString?.();
    delete ret._id;
    return ret;
  },
});

export const VerificationToken = mongoose.model('VerificationToken', verificationTokenSchema);
export default VerificationToken;
