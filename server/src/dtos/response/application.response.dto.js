import {
  APPLICATION_PIPELINE,
  APPLICATION_STATUS,
  APPLICATION_STATUS_META,
  APPLICATION_STATUS_TRANSITIONS,
  APPLICATION_TERMINAL_STATUSES,
  formatExperience,
  formatLocation,
  formatSalaryRange,
  maskEmail,
  maskPhone,
} from '@verihire/shared';

/**
 * ★ Application projections — the sharpest data boundary in the product.
 *
 * `employerNotes`, `rating` and `tags` are the employer's private assessment of a person
 * ("weak communicator", "2/5"). The candidate must never receive them, and unlike most
 * over-exposure bugs this one is not a privacy nuisance — it is defamation risk and, in
 * several jurisdictions, a subject-access problem.
 *
 * So the candidate shape is built by **construction, not subtraction**: `toCandidateView`
 * lists the fields it emits rather than deleting the ones it must not. A field added to the
 * model next year is invisible to candidates by default, which is the safe direction.
 */

const base = (doc) => (doc?.toObject ? doc.toObject({ virtuals: true }) : doc);

/** @param {string} status */
const statusMeta = (status) => {
  const meta = APPLICATION_STATUS_META[status] ?? {};
  return {
    status,
    statusLabel: meta.label ?? status,
    statusTone: meta.tone ?? 'neutral',
    statusStep: meta.step ?? 0,
  };
};

/** The job the candidate applied to — always the snapshot, never the live listing. */
const jobBlock = (doc) => ({
  id: doc.job ? String(doc.job._id ?? doc.job) : null,
  title: doc.jobSnapshot?.title,
  slug: doc.jobSnapshot?.slug,
  company: {
    name: doc.jobSnapshot?.companyName,
    slug: doc.jobSnapshot?.companySlug ?? null,
    logo: doc.jobSnapshot?.companyLogo ?? null,
  },
  employmentType: doc.jobSnapshot?.employmentType ?? null,
  workMode: doc.jobSnapshot?.workMode ?? null,
  location: doc.jobSnapshot?.location ?? null,
  locationLabel: formatLocation(doc.jobSnapshot?.location, doc.jobSnapshot?.workMode),
  salaryLabel: doc.jobSnapshot?.salary ? formatSalaryRange(doc.jobSnapshot.salary) : null,
  deadline: doc.jobSnapshot?.deadline ?? null,
});

/* --------------------------------------------------------------- candidate */

/**
 * ★ What the applicant sees. Note what is absent: no `employerNotes`, no `rating`,
 * no `tags`, and no raw timeline — only the pipeline position and the employer's stated
 * rejection reason, which they are entitled to.
 */
export const toCandidateView = (application) => {
  const doc = base(application);
  if (!doc) return null;

  const meta = APPLICATION_STATUS_META[doc.status] ?? {};

  return {
    id: String(doc._id ?? doc.id),
    ...statusMeta(doc.status),
    statusMessage: meta.candidateMessage ?? null,
    job: jobBlock(doc),

    appliedAt: doc.createdAt,
    statusChangedAt: doc.statusChangedAt,
    daysSinceApplied: doc.daysSinceApplied ?? null,

    coverLetter: doc.coverLetter ?? null,
    expectedSalary: doc.expectedSalary ?? null,
    noticePeriodDays: doc.noticePeriodDays ?? null,
    answers: doc.answers ?? [],

    /** Genuinely useful signal, and it costs the employer nothing to reveal. */
    wasViewed: Boolean(doc.viewedAt),
    resumeWasDownloaded: Boolean(doc.resumeDownloadedAt),

    resume: {
      originalName: doc.resumeSnapshot?.originalName ?? null,
      uploadedAt: doc.resumeSnapshot?.uploadedAt ?? null,
    },

    interview: doc.interview?.scheduledAt
      ? {
          scheduledAt: doc.interview.scheduledAt,
          mode: doc.interview.mode,
          meetingLink: doc.interview.meetingLink ?? null,
          location: doc.interview.location ?? null,
          round: doc.interview.round ?? 1,
          // `interview.notes` is the employer's prep note — excluded on purpose.
        }
      : null,

    // The reason is shown; the internal category ("NOT_A_FIT") is not, because it reads as
    // a verdict on the person rather than on the match.
    rejectionReason: doc.rejection?.reason ?? null,
    rejectedAt: doc.rejection?.at ?? null,
    withdrawnAt: doc.withdrawal?.at ?? null,

    canWithdraw: !APPLICATION_TERMINAL_STATUSES.includes(doc.status),
    pipeline: APPLICATION_PIPELINE.map((stage) => ({
      status: stage,
      label: APPLICATION_STATUS_META[stage]?.label ?? stage,
      reached: (APPLICATION_STATUS_META[doc.status]?.step ?? 0) >= (APPLICATION_STATUS_META[stage]?.step ?? 0),
      isCurrent: stage === doc.status,
    })),
  };
};

/** Compact row for the candidate's "My applications" table. */
export const toCandidateRow = (application) => {
  const doc = base(application);
  if (!doc) return null;

  return {
    id: String(doc._id ?? doc.id),
    ...statusMeta(doc.status),
    job: jobBlock(doc),
    appliedAt: doc.createdAt,
    statusChangedAt: doc.statusChangedAt,
    wasViewed: Boolean(doc.viewedAt),
    canWithdraw: !APPLICATION_TERMINAL_STATUSES.includes(doc.status),
    interviewAt: doc.interview?.scheduledAt ?? null,
  };
};

/* ---------------------------------------------------------------- employer */

/**
 * The employer's view of one applicant.
 *
 * Contact details are gated on `SHORTLISTED` and beyond. An employer with a live listing can
 * otherwise harvest a few hundred verified phone numbers a week without ever engaging with
 * anyone — which is a real pattern on job boards, and one this platform should not fund.
 */
export const toEmployerView = (application) => {
  const doc = base(application);
  if (!doc) return null;

  const step = APPLICATION_STATUS_META[doc.status]?.step ?? 0;
  const shortlistedStep = APPLICATION_STATUS_META[APPLICATION_STATUS.SHORTLISTED]?.step ?? 3;
  const contactUnlocked = step >= shortlistedStep || Boolean(doc.shortlistedAt);

  return {
    id: String(doc._id ?? doc.id),
    ...statusMeta(doc.status),
    job: jobBlock(doc),

    candidate: {
      id: doc.candidateProfile ? String(doc.candidateProfile) : null,
      userId: doc.applicant ? String(doc.applicant._id ?? doc.applicant) : null,
      firstName: doc.candidateSnapshot?.firstName,
      lastName: doc.candidateSnapshot?.lastName,
      headline: doc.candidateSnapshot?.headline ?? null,
      currentCompany: doc.candidateSnapshot?.currentCompany ?? null,
      currentDesignation: doc.candidateSnapshot?.currentDesignation ?? null,
      totalExperienceMonths: doc.candidateSnapshot?.totalExperienceMonths ?? 0,
      experienceLabel: formatExperience(doc.candidateSnapshot?.totalExperienceMonths),
      skills: doc.candidateSnapshot?.skills ?? [],
      location: doc.candidateSnapshot?.location ?? null,
      profileCompleteness: doc.candidateSnapshot?.profileCompleteness ?? 0,

      /**
       * ★ Gated — masked rather than absent.
       *
       * `r•••@gmail.com` tells the employer the address exists and is plausible, which is
       * all they need before deciding to shortlist. Omitting the field entirely just looks
       * like a broken profile and pushes them to shortlist everyone to find out.
       */
      email: contactUnlocked
        ? doc.candidateSnapshot?.email ?? null
        : maskEmail(doc.candidateSnapshot?.email),
      phone: contactUnlocked
        ? doc.candidateSnapshot?.phone ?? null
        : maskPhone(doc.candidateSnapshot?.phone),
      contactUnlocked,
      contactUnlocksAt: contactUnlocked ? null : APPLICATION_STATUS.SHORTLISTED,
    },

    coverLetter: doc.coverLetter ?? null,
    expectedSalary: doc.expectedSalary ?? null,
    expectedSalaryLabel: doc.expectedSalary ? formatSalaryRange(doc.expectedSalary) : null,
    noticePeriodDays: doc.noticePeriodDays ?? null,
    answers: doc.answers ?? [],

    resume: {
      hasResume: Boolean(doc.resumeSnapshot?.publicId),
      originalName: doc.resumeSnapshot?.originalName ?? null,
      sizeBytes: doc.resumeSnapshot?.sizeBytes ?? null,
      uploadedAt: doc.resumeSnapshot?.uploadedAt ?? null,
      // No URL here — resumes are private assets fetched from a separate, audited endpoint.
    },

    /* employer-private */
    employerNotes: doc.employerNotes ?? null,
    rating: doc.rating ?? null,
    tags: doc.tags ?? [],

    interview: doc.interview?.scheduledAt ? doc.interview : null,
    rejection: doc.rejection?.at ? doc.rejection : null,
    withdrawal: doc.withdrawal?.at ? doc.withdrawal : null,

    appliedAt: doc.createdAt,
    viewedAt: doc.viewedAt ?? null,
    shortlistedAt: doc.shortlistedAt ?? null,
    statusChangedAt: doc.statusChangedAt,
    resumeDownloadedAt: doc.resumeDownloadedAt ?? null,
    allowedTransitions: allowedNextStatuses(doc.status),
  };
};

/** Row in the employer's applicant table. */
export const toEmployerRow = (application) => {
  const doc = base(application);
  if (!doc) return null;

  const contactUnlocked = Boolean(doc.shortlistedAt);

  return {
    id: String(doc._id ?? doc.id),
    ...statusMeta(doc.status),
    candidate: {
      firstName: doc.candidateSnapshot?.firstName,
      lastName: doc.candidateSnapshot?.lastName,
      headline: doc.candidateSnapshot?.headline ?? null,
      currentCompany: doc.candidateSnapshot?.currentCompany ?? null,
      totalExperienceMonths: doc.candidateSnapshot?.totalExperienceMonths ?? 0,
      skills: (doc.candidateSnapshot?.skills ?? []).slice(0, 8),
      locationLabel: formatLocation(doc.candidateSnapshot?.location),
      email: contactUnlocked ? doc.candidateSnapshot?.email ?? null : null,
    },
    jobId: doc.job ? String(doc.job._id ?? doc.job) : null,
    jobTitle: doc.jobSnapshot?.title,
    hasResume: Boolean(doc.resumeSnapshot?.publicId),
    noticePeriodDays: doc.noticePeriodDays ?? null,
    rating: doc.rating ?? null,
    isNew: doc.status === APPLICATION_STATUS.APPLIED,
    appliedAt: doc.createdAt,
    interviewAt: doc.interview?.scheduledAt ?? null,
  };
};

/**
 * Legal next moves for an *employer*, so the UI renders exactly the buttons the API will
 * accept instead of offering an action that 409s.
 *
 * Derived from the same shared transition map the service enforces — a hand-written copy
 * here would drift the moment someone edits the state machine, and the symptom would be a
 * button that looks fine and fails on click.
 *
 * @param {string} status
 */
const allowedNextStatuses = (status) =>
  (APPLICATION_STATUS_TRANSITIONS[status] ?? [])
    // Only the candidate may withdraw, so it is never an employer-facing button.
    .filter((next) => next !== APPLICATION_STATUS.WITHDRAWN)
    .map((next) => ({
      status: next,
      label: APPLICATION_STATUS_META[next]?.label ?? next,
      tone: APPLICATION_STATUS_META[next]?.tone ?? 'neutral',
    }));

/**
 * Picks the right projection for the caller.
 * @param {any} application
 * @param {string} viewerRole CANDIDATE | EMPLOYER | ADMIN
 */
export const toViewerShape = (application, viewerRole) =>
  viewerRole === 'CANDIDATE' ? toCandidateView(application) : toEmployerView(application);

export default {
  toCandidateView,
  toCandidateRow,
  toEmployerView,
  toEmployerRow,
  toViewerShape,
};
