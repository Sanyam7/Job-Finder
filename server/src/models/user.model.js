import mongoose from 'mongoose';
import { ACCOUNT_ROLES, ACCOUNT_STATUS, ACCOUNT_STATUS_VALUES, LIMITS, PATTERNS } from '@verihire/shared';
import { hashPassword, comparePassword } from '../utils/password.util.js';
import { documentSchema } from './schemas/document.schema.js';
import { toJSONPlugin } from './plugins/toJSON.plugin.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { paginatePlugin } from './plugins/paginate.plugin.js';

/**
 * The authentication identity — and nothing else.
 *
 * Profile data lives in candidateProfiles / employerProfiles. Keeping this document small
 * matters because it is read on essentially every authenticated request; a fat user document
 * would make that lookup the slowest thing in the stack.
 */
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: [LIMITS.MIN_NAME_LENGTH, `At least ${LIMITS.MIN_NAME_LENGTH} characters`],
      maxlength: [LIMITS.MAX_NAME_LENGTH, `At most ${LIMITS.MAX_NAME_LENGTH} characters`],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: [LIMITS.MIN_NAME_LENGTH, `At least ${LIMITS.MIN_NAME_LENGTH} characters`],
      maxlength: [LIMITS.MAX_NAME_LENGTH, `At most ${LIMITS.MAX_NAME_LENGTH} characters`],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [PATTERNS.EMAIL, 'Enter a valid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never loaded unless a query explicitly asks
      private: true, // and never serialised, even if it is loaded
    },
    role: {
      type: String,
      enum: { values: ACCOUNT_ROLES, message: '{VALUE} is not a valid role' },
      required: true,
      immutable: true, // ★ privilege escalation is impossible through an update
      index: true,
    },
    status: {
      type: String,
      enum: ACCOUNT_STATUS_VALUES,
      default: ACCOUNT_STATUS.ACTIVE,
      index: true,
    },

    isEmailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },

    avatar: { type: documentSchema, default: null },
    phone: {
      type: String,
      trim: true,
      sparse: true,
      match: [PATTERNS.PHONE, 'Enter a valid phone number'],
    },

    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null, private: true },

    failedLoginAttempts: { type: Number, default: 0, private: true },
    lockedUntil: { type: Date, default: null, private: true },

    /**
     * ★ Stamped on every password change.
     * The auth middleware compares it against the JWT `iat`, which is what makes
     * "changing your password signs out your other devices" actually true for access
     * tokens that have already been issued and cannot be recalled.
     */
    passwordChangedAt: { type: Date, default: null, private: true },

    suspendedReason: { type: String, default: null, maxlength: LIMITS.MAX_ADMIN_NOTE_LENGTH },
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    suspendedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/* ------------------------------------------------------------------- indexes */

// `email` already has a unique index from `unique: true`.
userSchema.index({ role: 1, status: 1, createdAt: -1 });
userSchema.index({ createdAt: -1 });

/* ------------------------------------------------------------------ virtuals */

userSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

userSchema.virtual('isActive').get(function isActive() {
  return this.status === ACCOUNT_STATUS.ACTIVE && !this.deletedAt;
});

userSchema.virtual('candidateProfile', {
  ref: 'CandidateProfile',
  localField: '_id',
  foreignField: 'user',
  justOne: true,
});

userSchema.virtual('employerProfile', {
  ref: 'EmployerProfile',
  localField: '_id',
  foreignField: 'owner',
  justOne: true,
});

/* --------------------------------------------------------------------- hooks */

userSchema.pre('save', async function hashPasswordOnChange(next) {
  if (!this.isModified('passwordHash')) return next();

  // The service assigns a plaintext value to `passwordHash`; this hook is the single
  // place it becomes a hash, so no code path can persist a plaintext password.
  this.passwordHash = await hashPassword(this.passwordHash);

  // Backdate by a second: JWT `iat` has one-second resolution, and a token minted in the
  // same second as the change would otherwise be invalidated immediately.
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000);

  return next();
});

userSchema.pre('save', function normaliseEmail(next) {
  if (this.isModified('email')) this.email = this.email.toLowerCase().trim();
  return next();
});

/* ------------------------------------------------------------------- methods */

/**
 * @param {string} candidate
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = function compare(candidate) {
  return comparePassword(candidate, this.passwordHash);
};

/**
 * @param {number} jwtIssuedAtSeconds
 * @returns {boolean} true when the token predates the last password change
 */
userSchema.methods.isPasswordChangedAfter = function isChangedAfter(jwtIssuedAtSeconds) {
  if (!this.passwordChangedAt) return false;
  const changedAtSeconds = Math.floor(this.passwordChangedAt.getTime() / 1000);
  return jwtIssuedAtSeconds < changedAtSeconds;
};

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
};

/**
 * Records a failed sign-in and locks the account once the threshold is crossed.
 * @this {import('mongoose').Document & Record<string, any>}
 * @returns {Promise<{locked: boolean, remainingAttempts: number}>}
 */
userSchema.methods.registerFailedLogin = async function registerFailedLogin() {
  this.failedLoginAttempts = (this.failedLoginAttempts ?? 0) + 1;

  const locked = this.failedLoginAttempts >= LIMITS.MAX_LOGIN_ATTEMPTS;
  if (locked) {
    this.lockedUntil = new Date(Date.now() + LIMITS.ACCOUNT_LOCK_MINUTES * 60 * 1000);
    this.failedLoginAttempts = 0; // reset the counter with the lock
  }

  await this.save({ validateBeforeSave: false });
  return {
    locked,
    remainingAttempts: Math.max(LIMITS.MAX_LOGIN_ATTEMPTS - this.failedLoginAttempts, 0),
  };
};

/**
 * @this {import('mongoose').Document & Record<string, any>}
 * @param {string} [ip]
 */
userSchema.methods.registerSuccessfulLogin = async function registerSuccessfulLogin(ip) {
  this.failedLoginAttempts = 0;
  this.lockedUntil = null;
  this.lastLoginAt = new Date();
  if (ip) this.lastLoginIp = ip;
  await this.save({ validateBeforeSave: false });
};

/* ------------------------------------------------------------------- statics */

/**
 * @this {import('mongoose').Model<any>}
 * @param {string} email
 * @param {{withPassword?: boolean}} [opts]
 */
userSchema.statics.findByEmail = function findByEmail(email, { withPassword = false } = {}) {
  const query = this.findOne({ email: String(email ?? '').toLowerCase().trim() });
  return withPassword ? query.select('+passwordHash') : query;
};

/* ------------------------------------------------------------------- plugins */

userSchema.plugin(toJSONPlugin);
userSchema.plugin(softDeletePlugin);
userSchema.plugin(paginatePlugin);

/**
 * Instance methods, declared so a hydrated document carries them.
 *
 * Mongoose types a document from the schema's *paths*; methods attached at runtime are
 * invisible to it, so `user.isPasswordChangedAfter(...)` in the auth middleware is otherwise
 * an error. Declaring them on the model generic fixes every call site at once and keeps the
 * signatures checked.
 *
 * @typedef {object} UserMethods
 * @property {(candidate: string) => Promise<boolean>} comparePassword
 * @property {(jwtIssuedAtSeconds: number) => boolean} isPasswordChangedAfter
 * @property {() => boolean} isLocked
 * @property {() => Promise<{locked: boolean, remainingAttempts: number}>} registerFailedLogin
 * @property {(ip?: string) => Promise<void>} registerSuccessfulLogin
 */

/**
 * @type {import('mongoose').Model<any, {}, UserMethods> & {
 *   findByEmail(email: string, opts?: {withPassword?: boolean}): any
 * }}
 */
export const User = /** @type {any} */ (mongoose.model('User', userSchema));
export default User;
