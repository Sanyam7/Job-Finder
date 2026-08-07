import {
  AVAILABILITY_META,
  FIELD_SOURCE,
  PARSE_STATUS,
  formatExperience,
  formatLocation,
  formatSalaryRange,
  getInitials,
  maskEmail,
  maskPhone,
} from '@verihire/shared';

/**
 * Candidate projections.
 *
 * Three audiences with genuinely different rights:
 *
 *  - **the candidate** — everything, including their own resume metadata and provenance
 *  - **an employer** — the professional record, with contact details masked until there is a
 *    relationship, and `preferences.currentSalary` never included at all
 *  - **the public** — only when the candidate chose PUBLIC visibility
 *
 * Current pay is excluded from every employer shape unconditionally. It is the field most
 * likely to be used to anchor an offer below what the role is worth, and the candidate gave
 * it to us to match roles, not to hand to the person negotiating against them.
 */

const base = (doc) => (doc?.toObject ? doc.toObject({ virtuals: true }) : doc);

/** @param {any} doc */
const identity = (doc) => {
  const user = doc.user && typeof doc.user === 'object' ? doc.user : null;
  return {
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    initials: getInitials(user?.firstName, user?.lastName),
    avatar: doc.profilePicture?.url ?? user?.avatar ?? null,
  };
};

/** Shared professional record — identical for every audience. */
const professional = (doc) => ({
  headline: doc.headline ?? null,
  bio: doc.bio ?? null,
  currentCompany: doc.currentCompany ?? null,
  currentDesignation: doc.currentDesignation ?? null,
  totalExperienceMonths: doc.totalExperienceMonths ?? 0,
  experienceLabel: formatExperience(doc.totalExperienceMonths),
  location: doc.location ?? null,
  locationLabel: formatLocation(doc.location),
  skills: doc.skills ?? [],
  experience: doc.experience ?? [],
  education: doc.education ?? [],
  projects: doc.projects ?? [],
  certifications: doc.certifications ?? [],
  achievements: doc.achievements ?? [],
  languages: doc.languages ?? [],
  links: doc.links ?? {},
});

/* --------------------------------------------------------------- candidate */

/** The candidate's own view — everything they gave us, plus the provenance map. */
export const toOwnProfile = (profile) => {
  const doc = base(profile);
  if (!doc) return null;

  // Provenance keys are stored encoded (Mongoose maps forbid dots); the API always speaks
  // dot-paths, so decode through the model method when we have a hydrated document.
  const fieldSources =
    typeof profile?.fieldSourcePaths === 'function' ? profile.fieldSourcePaths() : {};

  return {
    id: String(doc._id ?? doc.id),
    ...identity(doc),
    ...professional(doc),

    preferences: doc.preferences ?? {},
    openToWork: doc.openToWork ?? false,
    profileVisibility: doc.profileVisibility,
    profileCompleteness: doc.profileCompleteness ?? 0,

    resume: {
      hasResume: Boolean(doc.resume?.publicId),
      originalName: doc.resume?.originalName ?? null,
      sizeBytes: doc.resume?.sizeBytes ?? null,
      version: doc.resume?.version ?? 0,
      uploadedAt: doc.resume?.uploadedAt ?? null,
      parseStatus: doc.resume?.parseStatus ?? PARSE_STATUS.NONE,
      parseError: doc.resume?.parseError ?? null,
      // No URL: even the owner gets one from the signing endpoint, so the link is
      // short-lived and cannot be pasted out of a cached JSON response.
    },

    /**
     * ★ The provenance map, surfaced so the UI can label each field ("you edited this" /
     * "read from your resume") and warn before a re-parse touches something they wrote.
     */
    fieldSources,

    /**
     * ★ "Pending" means a decision is still owed, not merely that a draft exists.
     *
     * Autofill writes every parsed path the candidate has not typed, so after an ordinary
     * upload the draft is already reflected in the profile and there is nothing left to
     * review. What remains is the set autofill deliberately skipped: paths marked USER,
     * where the parser disagrees with something they wrote themselves. Only those need a
     * side-by-side choice, and only those should raise a banner — a prompt to "review what
     * we found" over values already sitting in the form is just noise the candidate learns
     * to dismiss.
     */
    hasPendingDraft: Object.keys(doc.parsedDraft?.fields ?? {}).some(
      (path) => fieldSources[path] === FIELD_SOURCE.USER,
    ),
    stats: doc.stats ?? {},
    updatedAt: doc.updatedAt,
  };
};

/* ---------------------------------------------------------------- employer */

/**
 * @param {any} profile
 * @param {{contactUnlocked?: boolean, via?: string}} [opts]
 */
export const toEmployerProfile = (profile, { contactUnlocked = false, via = null } = {}) => {
  const doc = base(profile);
  if (!doc) return null;

  const user = doc.user && typeof doc.user === 'object' ? doc.user : null;
  const prefs = doc.preferences ?? {};

  return {
    id: String(doc._id ?? doc.id),
    ...identity(doc),
    ...professional(doc),

    email: contactUnlocked ? user?.email ?? null : maskEmail(user?.email),
    phone: contactUnlocked ? user?.phone ?? null : maskPhone(user?.phone),
    contactUnlocked,

    preferences: {
      jobTypes: prefs.jobTypes ?? [],
      workModes: prefs.workModes ?? [],
      preferredLocations: prefs.preferredLocations ?? [],
      expectedSalary: prefs.expectedSalary ?? null,
      expectedSalaryLabel: prefs.expectedSalary ? formatSalaryRange(prefs.expectedSalary) : null,
      noticePeriodDays: prefs.noticePeriodDays ?? null,
      availability: prefs.availability ?? null,
      availabilityLabel: AVAILABILITY_META[prefs.availability]?.label ?? null,
      willingToRelocate: prefs.willingToRelocate ?? false,
      // `currentSalary` is deliberately absent — see the note at the top of this file.
    },

    openToWork: doc.openToWork ?? false,
    profileCompleteness: doc.profileCompleteness ?? 0,
    hasResume: Boolean(doc.resume?.publicId),
    visibleVia: via,
    updatedAt: doc.updatedAt,
  };
};

/** Row in an employer's candidate-search results. */
export const toCandidateCard = (profile) => {
  const doc = base(profile);
  if (!doc) return null;

  const prefs = doc.preferences ?? {};

  return {
    id: String(doc._id ?? doc.id),
    ...identity(doc),
    headline: doc.headline ?? null,
    currentCompany: doc.currentCompany ?? null,
    currentDesignation: doc.currentDesignation ?? null,
    totalExperienceMonths: doc.totalExperienceMonths ?? 0,
    experienceLabel: formatExperience(doc.totalExperienceMonths),
    locationLabel: formatLocation(doc.location),
    skills: (doc.skills ?? []).slice(0, 8).map((s) => s.name),
    skillCount: doc.skills?.length ?? 0,
    availability: prefs.availability ?? null,
    availabilityLabel: AVAILABILITY_META[prefs.availability]?.label ?? null,
    noticePeriodDays: prefs.noticePeriodDays ?? null,
    expectedSalaryLabel: prefs.expectedSalary ? formatSalaryRange(prefs.expectedSalary) : null,
    profileCompleteness: doc.profileCompleteness ?? 0,
    updatedAt: doc.updatedAt,
  };
};

export default { toOwnProfile, toEmployerProfile, toCandidateCard };
