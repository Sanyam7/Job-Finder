/**
 * All lifecycle status enums.
 *
 * `tone` is the single source of truth for badge/chart colour across the whole UI —
 * see client/src/constants/statusMaps.js which consumes it.
 * Tones: neutral | info | success | warning | danger
 */

/* ------------------------------------------------------------------ account */

export const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
});

export const ACCOUNT_STATUS_VALUES = Object.freeze(Object.values(ACCOUNT_STATUS));

export const ACCOUNT_STATUS_META = Object.freeze({
  [ACCOUNT_STATUS.ACTIVE]: { label: 'Active', tone: 'success' },
  [ACCOUNT_STATUS.SUSPENDED]: { label: 'Suspended', tone: 'danger' },
  [ACCOUNT_STATUS.DELETED]: { label: 'Deleted', tone: 'neutral' },
});

/* ------------------------------------------------- employer verification (gate 1) */

export const VERIFICATION_STATUS = Object.freeze({
  UNSUBMITTED: 'UNSUBMITTED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
});

export const VERIFICATION_STATUS_VALUES = Object.freeze(Object.values(VERIFICATION_STATUS));

export const VERIFICATION_STATUS_META = Object.freeze({
  [VERIFICATION_STATUS.UNSUBMITTED]: {
    label: 'Not submitted',
    tone: 'neutral',
    description: 'Complete your company profile and submit it for review.',
  },
  [VERIFICATION_STATUS.PENDING]: {
    label: 'Under review',
    tone: 'warning',
    description: 'Our team is reviewing your company. This usually takes 24–48 hours.',
  },
  [VERIFICATION_STATUS.VERIFIED]: {
    label: 'Verified',
    tone: 'success',
    description: 'Your company is verified. You can post jobs.',
  },
  [VERIFICATION_STATUS.REJECTED]: {
    label: 'Not approved',
    tone: 'danger',
    description: 'Your submission was not approved. Review the reason and resubmit.',
  },
});

export const EMPLOYER_REJECTION_CATEGORY = Object.freeze({
  INVALID_DOCS: 'INVALID_DOCS',
  DOMAIN_MISMATCH: 'DOMAIN_MISMATCH',
  SUSPECTED_FRAUD: 'SUSPECTED_FRAUD',
  INCOMPLETE: 'INCOMPLETE',
  DUPLICATE: 'DUPLICATE',
  OTHER: 'OTHER',
});

export const EMPLOYER_REJECTION_CATEGORY_META = Object.freeze({
  INVALID_DOCS: { label: 'Invalid or unreadable documents' },
  DOMAIN_MISMATCH: { label: 'Email domain does not match website' },
  SUSPECTED_FRAUD: { label: 'Suspected fraudulent company' },
  INCOMPLETE: { label: 'Incomplete submission' },
  DUPLICATE: { label: 'Duplicate company account' },
  OTHER: { label: 'Other' },
});

/* ----------------------------------------------------------- job (gate 2) */

export const JOB_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
});

export const JOB_STATUS_VALUES = Object.freeze(Object.values(JOB_STATUS));

export const JOB_STATUS_META = Object.freeze({
  [JOB_STATUS.DRAFT]: { label: 'Draft', tone: 'neutral', isPublic: false },
  [JOB_STATUS.PENDING]: { label: 'Pending approval', tone: 'warning', isPublic: false },
  [JOB_STATUS.APPROVED]: { label: 'Live', tone: 'success', isPublic: true },
  [JOB_STATUS.REJECTED]: { label: 'Rejected', tone: 'danger', isPublic: false },
  [JOB_STATUS.ARCHIVED]: { label: 'Archived', tone: 'neutral', isPublic: false },
});

/**
 * Allowed job status transitions. The service layer refuses anything not listed here.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const JOB_STATUS_TRANSITIONS = Object.freeze({
  [JOB_STATUS.DRAFT]: [JOB_STATUS.PENDING, JOB_STATUS.ARCHIVED],
  [JOB_STATUS.PENDING]: [JOB_STATUS.APPROVED, JOB_STATUS.REJECTED, JOB_STATUS.DRAFT],
  [JOB_STATUS.APPROVED]: [JOB_STATUS.PENDING, JOB_STATUS.ARCHIVED],
  [JOB_STATUS.REJECTED]: [JOB_STATUS.PENDING, JOB_STATUS.DRAFT, JOB_STATUS.ARCHIVED],
  [JOB_STATUS.ARCHIVED]: [JOB_STATUS.PENDING, JOB_STATUS.DRAFT],
});

export const JOB_REJECTION_CATEGORY = Object.freeze({
  MISLEADING: 'MISLEADING',
  INCOMPLETE: 'INCOMPLETE',
  DUPLICATE: 'DUPLICATE',
  SPAM: 'SPAM',
  POLICY_VIOLATION: 'POLICY_VIOLATION',
  SALARY_UNREALISTIC: 'SALARY_UNREALISTIC',
  OTHER: 'OTHER',
});

export const JOB_REJECTION_CATEGORY_META = Object.freeze({
  MISLEADING: { label: 'Misleading or inaccurate content' },
  INCOMPLETE: { label: 'Incomplete job description' },
  DUPLICATE: { label: 'Duplicate posting' },
  SPAM: { label: 'Spam or promotional content' },
  POLICY_VIOLATION: { label: 'Violates posting policy' },
  SALARY_UNREALISTIC: { label: 'Unrealistic or missing compensation' },
  OTHER: { label: 'Other' },
});

/**
 * Editing any of these on an APPROVED job sends it back to PENDING re-review.
 * This closes the "get a clean job approved, then rewrite it into a scam" hole.
 */
export const JOB_MATERIAL_FIELDS = Object.freeze([
  'title',
  'description',
  'responsibilities',
  'requirements',
  'skillsRequired',
  'salary',
  'employmentType',
  'workMode',
  'location',
  'experience',
  'openings',
]);

/* --------------------------------------------------------------- application */

export const APPLICATION_STATUS = Object.freeze({
  APPLIED: 'APPLIED',
  VIEWED: 'VIEWED',
  SHORTLISTED: 'SHORTLISTED',
  INTERVIEW: 'INTERVIEW',
  REJECTED: 'REJECTED',
  HIRED: 'HIRED',
  WITHDRAWN: 'WITHDRAWN',
});

export const APPLICATION_STATUS_VALUES = Object.freeze(Object.values(APPLICATION_STATUS));

export const APPLICATION_STATUS_META = Object.freeze({
  [APPLICATION_STATUS.APPLIED]: {
    label: 'Applied',
    tone: 'info',
    step: 1,
    candidateMessage: 'Your application has been submitted.',
  },
  [APPLICATION_STATUS.VIEWED]: {
    label: 'Viewed',
    tone: 'info',
    step: 2,
    candidateMessage: 'The employer has viewed your application.',
  },
  [APPLICATION_STATUS.SHORTLISTED]: {
    label: 'Shortlisted',
    tone: 'success',
    step: 3,
    candidateMessage: "You've been shortlisted.",
  },
  [APPLICATION_STATUS.INTERVIEW]: {
    label: 'Interview',
    tone: 'success',
    step: 4,
    candidateMessage: 'An interview has been scheduled.',
  },
  [APPLICATION_STATUS.HIRED]: {
    label: 'Hired',
    tone: 'success',
    step: 5,
    candidateMessage: 'Congratulations — you got the role.',
  },
  [APPLICATION_STATUS.REJECTED]: {
    label: 'Not selected',
    tone: 'danger',
    step: 0,
    candidateMessage: 'The employer has moved forward with other candidates.',
  },
  [APPLICATION_STATUS.WITHDRAWN]: {
    label: 'Withdrawn',
    tone: 'neutral',
    step: 0,
    candidateMessage: 'You withdrew this application.',
  },
});

/** Ordered stages rendered by the candidate-facing timeline component. */
export const APPLICATION_PIPELINE = Object.freeze([
  APPLICATION_STATUS.APPLIED,
  APPLICATION_STATUS.VIEWED,
  APPLICATION_STATUS.SHORTLISTED,
  APPLICATION_STATUS.INTERVIEW,
  APPLICATION_STATUS.HIRED,
]);

/**
 * Statuses from which there is no further transition.
 *
 * Typed as `readonly string[]` rather than left to infer as a three-literal tuple: every use
 * is a membership test (`TERMINAL.includes(app.status)`) against a value typed as a wider
 * string, and a narrow tuple makes `.includes()` itself a type error.
 *
 * @type {readonly string[]}
 */
export const APPLICATION_TERMINAL_STATUSES = Object.freeze([
  APPLICATION_STATUS.HIRED,
  APPLICATION_STATUS.REJECTED,
  APPLICATION_STATUS.WITHDRAWN,
]);

/**
 * The application state machine. Backward moves are refused with 409.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const APPLICATION_STATUS_TRANSITIONS = Object.freeze({
  [APPLICATION_STATUS.APPLIED]: [
    APPLICATION_STATUS.VIEWED,
    APPLICATION_STATUS.SHORTLISTED,
    APPLICATION_STATUS.REJECTED,
    APPLICATION_STATUS.WITHDRAWN,
  ],
  [APPLICATION_STATUS.VIEWED]: [
    APPLICATION_STATUS.SHORTLISTED,
    APPLICATION_STATUS.REJECTED,
    APPLICATION_STATUS.WITHDRAWN,
  ],
  [APPLICATION_STATUS.SHORTLISTED]: [
    APPLICATION_STATUS.INTERVIEW,
    APPLICATION_STATUS.HIRED,
    APPLICATION_STATUS.REJECTED,
    APPLICATION_STATUS.WITHDRAWN,
  ],
  [APPLICATION_STATUS.INTERVIEW]: [
    APPLICATION_STATUS.HIRED,
    APPLICATION_STATUS.REJECTED,
    APPLICATION_STATUS.WITHDRAWN,
  ],
  [APPLICATION_STATUS.HIRED]: [],
  [APPLICATION_STATUS.REJECTED]: [],
  [APPLICATION_STATUS.WITHDRAWN]: [],
});

/* ------------------------------------------------------------------ resume */

export const PARSE_STATUS = Object.freeze({
  NONE: 'NONE',
  PARSING: 'PARSING',
  PARSED: 'PARSED',
  FAILED: 'FAILED',
});

export const PARSE_STATUS_VALUES = Object.freeze(Object.values(PARSE_STATUS));

/* ------------------------------------------------------------------ reports */

export const REPORT_STATUS = Object.freeze({
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
});

export const REPORT_STATUS_VALUES = Object.freeze(Object.values(REPORT_STATUS));

export const REPORT_REASON = Object.freeze({
  FAKE_JOB: 'FAKE_JOB',
  SCAM: 'SCAM',
  ASKS_FOR_MONEY: 'ASKS_FOR_MONEY',
  MISLEADING: 'MISLEADING',
  DISCRIMINATORY: 'DISCRIMINATORY',
  SPAM: 'SPAM',
  OFFENSIVE: 'OFFENSIVE',
  OTHER: 'OTHER',
});

export const REPORT_REASON_META = Object.freeze({
  FAKE_JOB: { label: 'This job does not exist' },
  SCAM: { label: 'Scam or fraudulent listing' },
  ASKS_FOR_MONEY: { label: 'Asks candidates for money' },
  MISLEADING: { label: 'Misleading information' },
  DISCRIMINATORY: { label: 'Discriminatory content' },
  SPAM: { label: 'Spam or duplicate' },
  OFFENSIVE: { label: 'Offensive content' },
  OTHER: { label: 'Something else' },
});
