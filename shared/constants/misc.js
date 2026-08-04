/** Brand, field provenance, bookmark kinds and audit actions. */

export const BRAND = Object.freeze({
  name: 'VeriHire',
  tagline: 'Find real jobs. From real companies.',
  description:
    'Every employer is manually verified and every job is manually reviewed before it goes live.',
  supportEmail: 'support@verihire.app',
  domain: 'verihire.app',
});

/**
 * ★ ADR-006 — field provenance.
 * A re-parse may overwrite PARSER/AI fields. It may NEVER overwrite a USER field.
 */
export const FIELD_SOURCE = Object.freeze({
  USER: 'USER',
  PARSER: 'PARSER',
  AI: 'AI',
});

export const FIELD_SOURCE_VALUES = Object.freeze(Object.values(FIELD_SOURCE));

export const FIELD_SOURCE_META = Object.freeze({
  USER: { label: 'You edited this', tone: 'info', protected: true },
  PARSER: { label: 'Read from your resume', tone: 'neutral', protected: false },
  AI: { label: 'AI suggested', tone: 'neutral', protected: false },
});

export const CONFIDENCE = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

/** @param {number} score 0..1 */
export const scoreToConfidence = (score) => {
  if (score >= 0.85) return CONFIDENCE.HIGH;
  if (score >= 0.6) return CONFIDENCE.MEDIUM;
  return CONFIDENCE.LOW;
};

export const BOOKMARK_ENTITY = Object.freeze({
  JOB: 'JOB',
  CANDIDATE: 'CANDIDATE',
});

export const BOOKMARK_ENTITY_VALUES = Object.freeze(Object.values(BOOKMARK_ENTITY));

export const REPORTABLE_ENTITY = Object.freeze({
  JOB: 'JOB',
  EMPLOYER: 'EMPLOYER',
  CANDIDATE: 'CANDIDATE',
});

export const REPORTABLE_ENTITY_VALUES = Object.freeze(Object.values(REPORTABLE_ENTITY));

/** Every admin/system action that lands in the immutable audit log. */
export const AUDIT_ACTION = Object.freeze({
  USER_REGISTERED: 'USER_REGISTERED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_RESTORED: 'USER_RESTORED',
  USER_DELETED: 'USER_DELETED',
  USER_PROMOTED: 'USER_PROMOTED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',

  EMPLOYER_SUBMITTED_VERIFICATION: 'EMPLOYER_SUBMITTED_VERIFICATION',
  EMPLOYER_VERIFIED: 'EMPLOYER_VERIFIED',
  EMPLOYER_REJECTED: 'EMPLOYER_REJECTED',
  EMPLOYER_SUSPENDED: 'EMPLOYER_SUSPENDED',
  EMPLOYER_RESTORED: 'EMPLOYER_RESTORED',
  EMPLOYER_DELETED: 'EMPLOYER_DELETED',

  JOB_CREATED: 'JOB_CREATED',
  JOB_SUBMITTED: 'JOB_SUBMITTED',
  JOB_APPROVED: 'JOB_APPROVED',
  JOB_REJECTED: 'JOB_REJECTED',
  JOB_ARCHIVED: 'JOB_ARCHIVED',
  JOB_DELETED: 'JOB_DELETED',
  JOB_VISIBILITY_RECONCILED: 'JOB_VISIBILITY_RECONCILED',

  APPLICATION_STATUS_CHANGED: 'APPLICATION_STATUS_CHANGED',
  RESUME_DOWNLOADED: 'RESUME_DOWNLOADED',
  DOCUMENT_VIEWED: 'DOCUMENT_VIEWED',

  REPORT_CREATED: 'REPORT_CREATED',
  REPORT_RESOLVED: 'REPORT_RESOLVED',

  SECURITY_TOKEN_REUSE: 'SECURITY_TOKEN_REUSE',
});

export const AUDIT_ACTION_VALUES = Object.freeze(Object.values(AUDIT_ACTION));

export const AUDIT_ENTITY = Object.freeze({
  USER: 'USER',
  CANDIDATE_PROFILE: 'CANDIDATE_PROFILE',
  EMPLOYER_PROFILE: 'EMPLOYER_PROFILE',
  JOB: 'JOB',
  APPLICATION: 'APPLICATION',
  REPORT: 'REPORT',
  VERIFICATION_REQUEST: 'VERIFICATION_REQUEST',
  SYSTEM: 'SYSTEM',
});

export const AUDIT_ENTITY_VALUES = Object.freeze(Object.values(AUDIT_ENTITY));

export const ACTOR_ROLE = Object.freeze({
  CANDIDATE: 'CANDIDATE',
  EMPLOYER: 'EMPLOYER',
  ADMIN: 'ADMIN',
  SYSTEM: 'SYSTEM',
});
