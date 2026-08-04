import {
  JOB_STATUS_META,
  formatSalaryRange,
  formatExperienceRange,
  formatLocation,
} from '@verihire/shared';

/**
 * Job projections.
 *
 * The public shape carries no moderation state at all — not the rejection reason, not the
 * reviewer, not the revision count. Exposing "this job was rejected twice for misleading
 * content" on a public endpoint would leak the moderation process to the very people it
 * exists to police.
 */

const base = (job) => (job?.toObject ? job.toObject({ virtuals: true }) : job);

/** Shared presentation fields, pre-formatted so every client renders them identically. */
const presentation = (doc) => ({
  salaryLabel: formatSalaryRange(doc.salary),
  experienceLabel: formatExperienceRange(doc.experience),
  locationLabel: formatLocation(doc.location, doc.workMode),
});

/** Card in a list — deliberately small; the browse page renders 20 of these. */
export const toJobCard = (job) => {
  const doc = base(job);
  if (!doc) return null;

  return {
    id: String(doc._id ?? doc.id),
    title: doc.title,
    slug: doc.slug,
    company: {
      name: doc.companySnapshot?.name,
      slug: doc.companySnapshot?.slug,
      logo: doc.companySnapshot?.logo ?? null,
      isVerified: doc.companySnapshot?.isVerified ?? false,
    },
    employmentType: doc.employmentType,
    workMode: doc.workMode,
    location: doc.location,
    salary: doc.salary?.isDisclosed === false ? null : doc.salary,
    experience: doc.experience,
    skills: (doc.skillsRequired ?? []).slice(0, 6).map((s) => s.name),
    skillCount: doc.skillsRequired?.length ?? 0,
    publishedAt: doc.publishedAt,
    deadline: doc.deadline,
    applicantCount: doc.stats?.applications ?? 0,
    ...presentation(doc),
  };
};

/** Full public detail page. */
export const toPublicJob = (job) => {
  const doc = base(job);
  if (!doc) return null;

  return {
    ...toJobCard(doc),
    description: doc.description,
    responsibilities: doc.responsibilities ?? [],
    requirements: doc.requirements ?? [],
    niceToHave: doc.niceToHave ?? [],
    benefits: doc.benefits ?? [],
    skillsRequired: doc.skillsRequired ?? [],
    education: doc.education ?? null,
    openings: doc.openings,
    industry: doc.industry ?? null,
    department: doc.department ?? null,
    companySize: doc.companySnapshot?.companySize ?? null,
    stats: { views: doc.stats?.views ?? 0, applications: doc.stats?.applications ?? 0 },
    createdAt: doc.createdAt,
  };
};

/**
 * The owner's view — adds status and the rejection feedback they need to act on.
 * Still excludes the reviewer's identity: the decision is the platform's, not one
 * individual admin's, and naming them invites retaliation.
 */
export const toOwnerJob = (job) => {
  const doc = base(job);
  if (!doc) return null;

  const meta = JOB_STATUS_META[doc.status] ?? {};

  return {
    ...toPublicJob(doc),
    status: doc.status,
    statusLabel: meta.label ?? doc.status,
    statusTone: meta.tone ?? 'neutral',
    isPubliclyVisible: doc.isPubliclyVisible,
    moderation: {
      submittedAt: doc.moderation?.submittedAt ?? null,
      reviewedAt: doc.moderation?.reviewedAt ?? null,
      rejectionReason: doc.moderation?.rejectionReason ?? null,
      rejectionCategory: doc.moderation?.rejectionCategory ?? null,
      revisionCount: doc.moderation?.revisionCount ?? 0,
    },
    stats: doc.stats ?? {},
    archivedAt: doc.archivedAt ?? null,
    updatedAt: doc.updatedAt,
  };
};

/** The admin review view — everything. */
export const toAdminJob = (job) => {
  const doc = base(job);
  if (!doc) return null;

  return {
    ...toOwnerJob(doc),
    employerId: String(doc.employer),
    postedBy: doc.postedBy ? String(doc.postedBy) : null,
    moderation: {
      ...toOwnerJob(doc).moderation,
      reviewedBy: doc.moderation?.reviewedBy ? String(doc.moderation.reviewedBy) : null,
      previousStatus: doc.moderation?.previousStatus ?? null,
    },
    deletedAt: doc.deletedAt ?? null,
  };
};

/** Compact row for the approval queue table. */
export const toJobQueueRow = (job) => {
  const doc = base(job);
  if (!doc) return null;

  const submittedAt = doc.moderation?.submittedAt ?? null;

  return {
    id: String(doc._id ?? doc.id),
    title: doc.title,
    slug: doc.slug,
    company: {
      name: doc.companySnapshot?.name,
      logo: doc.companySnapshot?.logo ?? null,
      isVerified: doc.companySnapshot?.isVerified ?? false,
    },
    status: doc.status,
    employmentType: doc.employmentType,
    workMode: doc.workMode,
    locationLabel: formatLocation(doc.location, doc.workMode),
    salaryLabel: formatSalaryRange(doc.salary),
    submittedAt,
    waitingHours: submittedAt
      ? Math.floor((Date.now() - new Date(submittedAt).getTime()) / 3_600_000)
      : null,
    // A revision is a job that was already approved once and then materially edited —
    // worth flagging, because that is the fraud vector the rule exists to close.
    revisionCount: doc.moderation?.revisionCount ?? 0,
    isRevision: (doc.moderation?.revisionCount ?? 0) > 0,
    deadline: doc.deadline,
  };
};

export default { toJobCard, toPublicJob, toOwnerJob, toAdminJob, toJobQueueRow };
