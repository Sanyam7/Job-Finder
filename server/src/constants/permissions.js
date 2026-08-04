import { ROLES } from '@verihire/shared';

/**
 * Fine-grained capabilities.
 *
 * `authorize(ROLES.EMPLOYER)` answers "what kind of user is this"; `can(PERMISSIONS.X)`
 * answers "is this user allowed to do this specific thing". Having both means a future
 * "recruiter" seat that can manage applications but not post jobs is a row in the table
 * below rather than a rewrite of every route.
 */
export const PERMISSIONS = Object.freeze({
  /* jobs */
  JOB_CREATE: 'job:create',
  JOB_READ_OWN: 'job:read:own',
  JOB_READ_ALL: 'job:read:all',
  JOB_UPDATE_OWN: 'job:update:own',
  JOB_DELETE_OWN: 'job:delete:own',
  JOB_SUBMIT: 'job:submit',
  JOB_APPROVE: 'job:approve',
  JOB_REJECT: 'job:reject',
  JOB_DELETE_ANY: 'job:delete:any',

  /* applications */
  APPLICATION_CREATE: 'application:create',
  APPLICATION_READ_OWN: 'application:read:own',
  APPLICATION_READ_RECEIVED: 'application:read:received',
  APPLICATION_UPDATE_STATUS: 'application:update:status',
  APPLICATION_WITHDRAW: 'application:withdraw',
  APPLICATION_NOTES: 'application:notes',

  /* candidates */
  CANDIDATE_SEARCH: 'candidate:search',
  CANDIDATE_READ_PROFILE: 'candidate:read:profile',
  RESUME_DOWNLOAD: 'resume:download',

  /* employers */
  EMPLOYER_SUBMIT_VERIFICATION: 'employer:submit:verification',
  EMPLOYER_VERIFY: 'employer:verify',
  EMPLOYER_REJECT: 'employer:reject',
  EMPLOYER_SUSPEND: 'employer:suspend',
  EMPLOYER_DELETE: 'employer:delete',

  /* users */
  USER_READ_ALL: 'user:read:all',
  USER_SUSPEND: 'user:suspend',
  USER_DELETE: 'user:delete',
  USER_PROMOTE: 'user:promote',

  /* platform */
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
  REPORT_READ: 'report:read',
  REPORT_RESOLVE: 'report:resolve',
  SKILL_MANAGE: 'skill:manage',

  /* shared */
  BOOKMARK_MANAGE: 'bookmark:manage',
  NOTIFICATION_MANAGE: 'notification:manage',
});

const CANDIDATE_PERMISSIONS = [
  PERMISSIONS.APPLICATION_CREATE,
  PERMISSIONS.APPLICATION_READ_OWN,
  PERMISSIONS.APPLICATION_WITHDRAW,
  PERMISSIONS.BOOKMARK_MANAGE,
  PERMISSIONS.NOTIFICATION_MANAGE,
];

const EMPLOYER_PERMISSIONS = [
  PERMISSIONS.JOB_CREATE,
  PERMISSIONS.JOB_READ_OWN,
  PERMISSIONS.JOB_UPDATE_OWN,
  PERMISSIONS.JOB_DELETE_OWN,
  PERMISSIONS.JOB_SUBMIT,
  PERMISSIONS.APPLICATION_READ_RECEIVED,
  PERMISSIONS.APPLICATION_UPDATE_STATUS,
  PERMISSIONS.APPLICATION_NOTES,
  PERMISSIONS.CANDIDATE_SEARCH,
  PERMISSIONS.CANDIDATE_READ_PROFILE,
  PERMISSIONS.RESUME_DOWNLOAD,
  PERMISSIONS.EMPLOYER_SUBMIT_VERIFICATION,
  PERMISSIONS.BOOKMARK_MANAGE,
  PERMISSIONS.NOTIFICATION_MANAGE,
];

/**
 * An admin moderates the platform; they do not act as a candidate or an employer.
 *
 * Annotated `string[]` so the membership test below compares against the full permission
 * union rather than the five literals in this list.
 *
 * @type {string[]}
 */
const NOT_FOR_ADMINS = [
  PERMISSIONS.APPLICATION_CREATE,
  PERMISSIONS.APPLICATION_WITHDRAW,
  PERMISSIONS.JOB_CREATE,
  PERMISSIONS.JOB_SUBMIT,
  PERMISSIONS.EMPLOYER_SUBMIT_VERIFICATION,
];

const ADMIN_PERMISSIONS = Object.values(PERMISSIONS).filter((p) => !NOT_FOR_ADMINS.includes(p));

/** @type {Readonly<Record<string, readonly string[]>>} */
export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.GUEST]: Object.freeze([]),
  [ROLES.CANDIDATE]: Object.freeze(CANDIDATE_PERMISSIONS),
  [ROLES.EMPLOYER]: Object.freeze(EMPLOYER_PERMISSIONS),
  [ROLES.ADMIN]: Object.freeze(ADMIN_PERMISSIONS),
});

/**
 * @param {string} role
 * @param {string} permission
 * @returns {boolean}
 */
export const roleHasPermission = (role, permission) =>
  (ROLE_PERMISSIONS[role] ?? []).includes(permission);

/**
 * Permissions that additionally require a VERIFIED, ACTIVE employer.
 *
 * ★ This list is the machine-readable form of the USP: an employer account exists from
 * sign-up, but none of these capabilities unlock until a human admin approves the company.
 */
export const VERIFIED_EMPLOYER_ONLY = Object.freeze([
  PERMISSIONS.JOB_SUBMIT,
  PERMISSIONS.CANDIDATE_SEARCH,
  PERMISSIONS.CANDIDATE_READ_PROFILE,
  PERMISSIONS.RESUME_DOWNLOAD,
  PERMISSIONS.APPLICATION_READ_RECEIVED,
  PERMISSIONS.APPLICATION_UPDATE_STATUS,
]);
