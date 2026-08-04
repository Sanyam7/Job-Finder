/**
 * The 17 notification events, plus the channel table.
 *
 * Muting email for a type is a data change here — not a code change in a service.
 */
export const NOTIFICATION_TYPE = Object.freeze({
  /* account */
  WELCOME: 'WELCOME',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  SECURITY_ALERT: 'SECURITY_ALERT',

  /* employer verification — gate 1 */
  EMPLOYER_SUBMITTED: 'EMPLOYER_SUBMITTED',
  EMPLOYER_APPROVED: 'EMPLOYER_APPROVED',
  EMPLOYER_REJECTED: 'EMPLOYER_REJECTED',
  EMPLOYER_SUSPENDED: 'EMPLOYER_SUSPENDED',

  /* jobs — gate 2 */
  JOB_SUBMITTED: 'JOB_SUBMITTED',
  JOB_APPROVED: 'JOB_APPROVED',
  JOB_REJECTED: 'JOB_REJECTED',
  JOB_EXPIRING_SOON: 'JOB_EXPIRING_SOON',
  JOB_EXPIRED: 'JOB_EXPIRED',

  /* applications */
  APPLICATION_RECEIVED: 'APPLICATION_RECEIVED',
  APPLICATION_VIEWED: 'APPLICATION_VIEWED',
  APPLICATION_SHORTLISTED: 'APPLICATION_SHORTLISTED',
  INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
  APPLICATION_REJECTED: 'APPLICATION_REJECTED',
  APPLICATION_HIRED: 'APPLICATION_HIRED',
  APPLICATION_WITHDRAWN: 'APPLICATION_WITHDRAWN',

  /* discovery */
  RESUME_PARSED: 'RESUME_PARSED',
  RESUME_PARSE_FAILED: 'RESUME_PARSE_FAILED',
  NEW_MATCHING_JOB: 'NEW_MATCHING_JOB',

  /* admin */
  ADMIN_NEW_EMPLOYER_PENDING: 'ADMIN_NEW_EMPLOYER_PENDING',
  ADMIN_NEW_JOB_PENDING: 'ADMIN_NEW_JOB_PENDING',
  ADMIN_NEW_REPORT: 'ADMIN_NEW_REPORT',
});

export const NOTIFICATION_TYPE_VALUES = Object.freeze(Object.values(NOTIFICATION_TYPE));

export const NOTIFICATION_PRIORITY = Object.freeze({
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
});

/**
 * Per-type delivery configuration.
 * @type {Readonly<Record<string, {inApp: boolean, email: boolean, priority: string, icon: string}>>}
 */
export const NOTIFICATION_CONFIG = Object.freeze({
  WELCOME: { inApp: true, email: true, priority: 'NORMAL', icon: 'sparkles' },
  EMAIL_VERIFIED: { inApp: true, email: false, priority: 'LOW', icon: 'check' },
  PASSWORD_CHANGED: { inApp: true, email: true, priority: 'HIGH', icon: 'lock' },
  SECURITY_ALERT: { inApp: true, email: true, priority: 'HIGH', icon: 'shield' },

  EMPLOYER_SUBMITTED: { inApp: true, email: true, priority: 'NORMAL', icon: 'clock' },
  EMPLOYER_APPROVED: { inApp: true, email: true, priority: 'HIGH', icon: 'badge-check' },
  EMPLOYER_REJECTED: { inApp: true, email: true, priority: 'HIGH', icon: 'x-circle' },
  EMPLOYER_SUSPENDED: { inApp: true, email: true, priority: 'HIGH', icon: 'pause' },

  JOB_SUBMITTED: { inApp: true, email: false, priority: 'LOW', icon: 'clock' },
  JOB_APPROVED: { inApp: true, email: true, priority: 'HIGH', icon: 'check-circle' },
  JOB_REJECTED: { inApp: true, email: true, priority: 'HIGH', icon: 'x-circle' },
  JOB_EXPIRING_SOON: { inApp: true, email: true, priority: 'NORMAL', icon: 'alarm' },
  JOB_EXPIRED: { inApp: true, email: false, priority: 'LOW', icon: 'archive' },

  APPLICATION_RECEIVED: { inApp: true, email: false, priority: 'NORMAL', icon: 'inbox' },
  APPLICATION_VIEWED: { inApp: true, email: false, priority: 'LOW', icon: 'eye' },
  APPLICATION_SHORTLISTED: { inApp: true, email: true, priority: 'HIGH', icon: 'star' },
  INTERVIEW_SCHEDULED: { inApp: true, email: true, priority: 'HIGH', icon: 'calendar' },
  APPLICATION_REJECTED: { inApp: true, email: true, priority: 'NORMAL', icon: 'x' },
  APPLICATION_HIRED: { inApp: true, email: true, priority: 'HIGH', icon: 'trophy' },
  APPLICATION_WITHDRAWN: { inApp: true, email: false, priority: 'LOW', icon: 'undo' },

  RESUME_PARSED: { inApp: true, email: false, priority: 'NORMAL', icon: 'file-text' },
  RESUME_PARSE_FAILED: { inApp: true, email: false, priority: 'NORMAL', icon: 'alert' },
  NEW_MATCHING_JOB: { inApp: true, email: true, priority: 'LOW', icon: 'target' },

  ADMIN_NEW_EMPLOYER_PENDING: { inApp: true, email: false, priority: 'NORMAL', icon: 'building' },
  ADMIN_NEW_JOB_PENDING: { inApp: true, email: false, priority: 'NORMAL', icon: 'briefcase' },
  ADMIN_NEW_REPORT: { inApp: true, email: true, priority: 'HIGH', icon: 'flag' },
});
