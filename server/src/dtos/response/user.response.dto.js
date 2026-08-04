import { getInitials } from '@verihire/shared';

/**
 * Response projections for the User aggregate.
 *
 * Every consumer gets an explicit shape. The alternative — returning the model and trusting
 * `toJSON` — means one forgotten `select` leaks `lastLoginIp` or `failedLoginAttempts` into
 * a public payload, and nothing in the type system stops it.
 */

/**
 * The caller's own account.
 * @param {any} user
 */
export const toSelfUser = (user) => {
  if (!user) return null;
  const doc = user.toObject ? user.toObject({ virtuals: true }) : user;

  return {
    id: String(doc._id ?? doc.id),
    firstName: doc.firstName,
    lastName: doc.lastName,
    fullName: `${doc.firstName} ${doc.lastName}`.trim(),
    initials: getInitials(doc.firstName, doc.lastName),
    email: doc.email,
    phone: doc.phone ?? null,
    role: doc.role,
    status: doc.status,
    isEmailVerified: doc.isEmailVerified,
    emailVerifiedAt: doc.emailVerifiedAt ?? null,
    avatar: doc.avatar ? { url: doc.avatar.url, publicId: doc.avatar.publicId } : null,
    lastLoginAt: doc.lastLoginAt ?? null,
    createdAt: doc.createdAt,
  };
};

/**
 * A different user, seen by an employer or rendered on a public page.
 * Contact details are deliberately absent — those are released only through the
 * candidate DTO, and only once a relationship exists.
 * @param {any} user
 */
export const toPublicUser = (user) => {
  if (!user) return null;
  const doc = user.toObject ? user.toObject({ virtuals: true }) : user;

  return {
    id: String(doc._id ?? doc.id),
    firstName: doc.firstName,
    lastName: doc.lastName,
    fullName: `${doc.firstName} ${doc.lastName}`.trim(),
    initials: getInitials(doc.firstName, doc.lastName),
    avatar: doc.avatar ? { url: doc.avatar.url } : null,
  };
};

/**
 * The admin view — includes moderation state, still excludes credentials and the
 * brute-force counters.
 * @param {any} user
 */
export const toAdminUser = (user) => {
  if (!user) return null;
  const doc = user.toObject ? user.toObject({ virtuals: true }) : user;

  return {
    ...toSelfUser(doc),
    suspendedReason: doc.suspendedReason ?? null,
    suspendedAt: doc.suspendedAt ?? null,
    suspendedBy: doc.suspendedBy ? String(doc.suspendedBy) : null,
    deletedAt: doc.deletedAt ?? null,
    lastLoginIp: doc.lastLoginIp ?? null,
    updatedAt: doc.updatedAt,
  };
};

/**
 * The compact identity the SPA holds in Redux.
 * @param {any} user
 * @param {{employerId?: string|null, employerVerificationStatus?: string|null,
 *          employerStatus?: string|null, candidateId?: string|null,
 *          hasResume?: boolean, profileCompleteness?: number}} [context]
 */
export const toSessionUser = (user, context = {}) => {
  const base = toSelfUser(user);
  if (!base) return null;

  return {
    ...base,
    // The client mirrors the server-side gate to render the right shell; the server
    // remains the authority on every write.
    employerId: context.employerId ?? null,
    employerVerificationStatus: context.employerVerificationStatus ?? null,
    employerStatus: context.employerStatus ?? null,
    candidateId: context.candidateId ?? null,
    hasResume: context.hasResume ?? false,
    profileCompleteness: context.profileCompleteness ?? 0,
  };
};

/** @param {any} session */
export const toSession = (session) => ({
  id: String(session._id ?? session.id),
  device: session.device ?? 'Unknown device',
  ip: session.ip ?? null,
  userAgent: session.userAgent ?? null,
  createdAt: session.createdAt,
  expiresAt: session.expiresAt,
});

export default { toSelfUser, toPublicUser, toAdminUser, toSessionUser, toSession };
