import { VERIFICATION_STATUS_META, ACCOUNT_STATUS } from '@verihire/shared';

/**
 * Employer projections.
 *
 * Three audiences, three shapes. The public shape must never carry verification internals
 * (admin notes, rejection categories, uploaded document URLs) — those are moderation
 * material, not company marketing.
 */

/** @param {any} employer */
const base = (employer) => {
  const doc = employer?.toObject ? employer.toObject({ virtuals: true }) : employer;
  return doc ?? null;
};

/** Anything an anonymous visitor may see on a company page. */
export const toPublicEmployer = (employer) => {
  const doc = base(employer);
  if (!doc) return null;

  return {
    id: String(doc._id ?? doc.id),
    companyName: doc.companyName,
    slug: doc.slug,
    logo: doc.logo?.url ?? null,
    coverImage: doc.coverImage?.url ?? null,
    tagline: doc.tagline ?? null,
    description: doc.description ?? null,
    industry: doc.industry ?? null,
    foundedYear: doc.foundedYear ?? null,
    companySize: doc.companySize ?? null,
    website: doc.website ?? null,
    linkedin: doc.linkedin ?? null,
    location: doc.address
      ? { city: doc.address.city, state: doc.address.state, country: doc.address.country }
      : null,
    // The badge candidates rely on. True only when both halves of gate 1 hold.
    isVerified: doc.verificationStatus === 'VERIFIED' && doc.status === ACCOUNT_STATUS.ACTIVE,
    stats: { activeJobs: doc.stats?.activeJobs ?? 0 },
    createdAt: doc.createdAt,
  };
};

/**
 * The owner's view — adds verification state and everything needed to render the
 * locked/pending/rejected dashboard without a second request.
 */
export const toOwnerEmployer = (employer) => {
  const doc = base(employer);
  if (!doc) return null;

  const meta = VERIFICATION_STATUS_META[doc.verificationStatus] ?? {};

  return {
    ...toPublicEmployer(doc),
    contact: doc.contact ?? {},
    address: doc.address ?? {},
    gstNumber: doc.gstNumber ?? null,

    verificationStatus: doc.verificationStatus,
    verificationLabel: meta.label ?? doc.verificationStatus,
    verificationDescription: meta.description ?? null,
    verification: {
      submittedAt: doc.verification?.submittedAt ?? null,
      reviewedAt: doc.verification?.reviewedAt ?? null,
      // The employer sees WHY they were rejected — that is the whole point of the field.
      rejectionReason: doc.verification?.rejectionReason ?? null,
      rejectionCategory: doc.verification?.rejectionCategory ?? null,
      attemptCount: doc.verification?.attemptCount ?? 0,
      // ...but never the reviewer's private notes or the internal checklist.
      canResubmit: ['REJECTED', 'UNSUBMITTED'].includes(doc.verificationStatus),
    },

    documents: (doc.documents ?? []).map((d) => ({
      id: String(d._id),
      type: d.type,
      originalName: d.originalName,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.uploadedAt,
      // No URL: documents are private and fetched through the authenticated proxy.
    })),

    status: doc.status,
    suspension: doc.suspension?.reason
      ? { reason: doc.suspension.reason, at: doc.suspension.at }
      : null,

    canPostJobs: doc.verificationStatus === 'VERIFIED' && doc.status === ACCOUNT_STATUS.ACTIVE,
    stats: doc.stats ?? {},
    updatedAt: doc.updatedAt,
  };
};

/**
 * The admin review view — everything, including the moderation trail.
 * @param {any} employer
 * @param {{signals?: Record<string, any>, owner?: any}} [extra]
 */
export const toAdminEmployer = (employer, extra = {}) => {
  const doc = base(employer);
  if (!doc) return null;

  return {
    ...toOwnerEmployer(doc),
    owner: extra.owner
      ? {
          id: String(extra.owner._id ?? extra.owner.id),
          firstName: extra.owner.firstName,
          lastName: extra.owner.lastName,
          email: extra.owner.email,
          createdAt: extra.owner.createdAt,
        }
      : (doc.owner ?? null),
    verification: {
      ...toOwnerEmployer(doc).verification,
      checks: doc.verification?.checks ?? {},
      adminNotes: doc.verification?.adminNotes ?? null,
      reviewedBy: doc.verification?.reviewedBy ? String(doc.verification.reviewedBy) : null,
    },
    documents: (doc.documents ?? []).map((d) => ({
      id: String(d._id),
      type: d.type,
      originalName: d.originalName,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.uploadedAt,
      // The admin gets a route to fetch a signed URL — still not the raw URL, and every
      // fetch is audit-logged.
      viewPath: `/admin/employers/${String(doc._id ?? doc.id)}/documents/${String(d._id)}`,
    })),
    signals: extra.signals ?? null,
    deletedAt: doc.deletedAt ?? null,
  };
};

/** Compact row for the verification queue table. */
export const toQueueRow = (employer) => {
  const doc = base(employer);
  if (!doc) return null;

  const submittedAt = doc.verification?.submittedAt ?? null;

  return {
    id: String(doc._id ?? doc.id),
    companyName: doc.companyName,
    slug: doc.slug,
    logo: doc.logo?.url ?? null,
    industry: doc.industry ?? null,
    companySize: doc.companySize ?? null,
    website: doc.website ?? null,
    verificationStatus: doc.verificationStatus,
    submittedAt,
    // Surfaced so an admin can see at a glance who has been waiting longest.
    waitingHours: submittedAt
      ? Math.floor((Date.now() - new Date(submittedAt).getTime()) / 3_600_000)
      : null,
    attemptCount: doc.verification?.attemptCount ?? 0,
    documentCount: doc.documents?.length ?? 0,
    owner: doc.owner
      ? {
          firstName: doc.owner.firstName,
          lastName: doc.owner.lastName,
          email: doc.owner.email,
        }
      : null,
  };
};

export default { toPublicEmployer, toOwnerEmployer, toAdminEmployer, toQueueRow };
