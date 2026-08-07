/**
 * Domain events.
 *
 * ★ ADR-008 — services emit, subscribers react. `job.service.js` publishes `job.approved`
 * and knows nothing about notifications, emails or the audit log. Adding "also post to
 * Slack on approval" is a new subscriber file, not an edit to the approval logic.
 */
export const EVENTS = Object.freeze({
  /* account */
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.loggedIn',
  USER_SUSPENDED: 'user.suspended',
  USER_RESTORED: 'user.restored',
  USER_DELETED: 'user.deleted',
  USER_PROMOTED: 'user.promoted',
  PASSWORD_CHANGED: 'password.changed',
  PASSWORD_RESET_REQUESTED: 'password.resetRequested',
  PASSWORD_RESET_COMPLETED: 'password.resetCompleted',

  /* employer verification — gate 1 */
  EMPLOYER_SUBMITTED: 'employer.submitted',
  EMPLOYER_VERIFIED: 'employer.verified',
  EMPLOYER_REJECTED: 'employer.rejected',
  EMPLOYER_SUSPENDED: 'employer.suspended',
  EMPLOYER_RESTORED: 'employer.restored',

  /* jobs — gate 2 */
  JOB_CREATED: 'job.created',
  JOB_SUBMITTED: 'job.submitted',
  JOB_APPROVED: 'job.approved',
  JOB_REJECTED: 'job.rejected',
  JOB_ARCHIVED: 'job.archived',
  JOB_EXPIRED: 'job.expired',
  JOB_EXPIRING_SOON: 'job.expiringSoon',

  /* applications */
  APPLICATION_CREATED: 'application.created',
  APPLICATION_VIEWED: 'application.viewed',
  APPLICATION_SHORTLISTED: 'application.shortlisted',
  APPLICATION_INTERVIEW: 'application.interview',
  APPLICATION_REJECTED: 'application.rejected',
  APPLICATION_HIRED: 'application.hired',
  APPLICATION_WITHDRAWN: 'application.withdrawn',

  /* resume */
  RESUME_UPLOADED: 'resume.uploaded',
  RESUME_PARSED: 'resume.parsed',
  RESUME_PARSE_FAILED: 'resume.parseFailed',

  /* moderation */
  REPORT_CREATED: 'report.created',
  REPORT_RESOLVED: 'report.resolved',
  RESUME_DOWNLOADED: 'resume.downloaded',
  DOCUMENT_VIEWED: 'document.viewed',

  /* security */
  SECURITY_TOKEN_REUSE: 'security.tokenReuse',
  SECURITY_LOGIN_FAILED: 'security.loginFailed',
  SECURITY_ACCOUNT_LOCKED: 'security.accountLocked',
});

export const EVENT_VALUES = Object.freeze(Object.values(EVENTS));

export default EVENTS;
