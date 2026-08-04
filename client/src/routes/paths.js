import { ROLES } from '@verihire/shared';

/**
 * Every route string in the application.
 *
 * Hardcoding paths at call sites means renaming one route requires finding every literal
 * that referenced it — and the ones you miss fail silently at runtime as a 404 rather than
 * loudly at build time.
 */
export const ROUTES = Object.freeze({
  /* public */
  HOME: '/',
  JOBS: '/jobs',
  JOB_DETAIL: '/jobs/:slug',
  COMPANIES: '/companies',
  COMPANY_DETAIL: '/companies/:slug',
  ABOUT: '/about',
  HOW_IT_WORKS: '/how-it-works',
  FEATURES: '/features',
  WHY_VERIFIED: '/why-verified',
  FAQ: '/faq',
  CONTACT: '/contact',

  /* auth */
  LOGIN: '/login',
  SIGNUP: '/signup',
  VERIFY_EMAIL: '/verify-email',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',

  /* candidate */
  CANDIDATE_ROOT: '/candidate',
  CANDIDATE_DASHBOARD: '/candidate/dashboard',
  CANDIDATE_PROFILE: '/candidate/profile',
  CANDIDATE_PROFILE_EDIT: '/candidate/profile/edit',
  CANDIDATE_RESUME_REVIEW: '/candidate/resume/review',
  CANDIDATE_APPLICATIONS: '/candidate/applications',
  CANDIDATE_APPLICATION_DETAIL: '/candidate/applications/:id',
  CANDIDATE_SAVED: '/candidate/saved',
  CANDIDATE_RECOMMENDED: '/candidate/recommended',
  CANDIDATE_SETTINGS: '/candidate/settings',

  /* employer */
  EMPLOYER_ROOT: '/employer',
  EMPLOYER_DASHBOARD: '/employer/dashboard',
  EMPLOYER_COMPANY: '/employer/company',
  EMPLOYER_VERIFICATION: '/employer/verification',
  EMPLOYER_JOBS: '/employer/jobs',
  EMPLOYER_JOB_NEW: '/employer/jobs/new',
  EMPLOYER_JOB_EDIT: '/employer/jobs/:id/edit',
  EMPLOYER_JOB_APPLICANTS: '/employer/jobs/:id/applicants',
  EMPLOYER_CANDIDATES: '/employer/candidates',
  EMPLOYER_CANDIDATE_DETAIL: '/employer/candidates/:id',
  EMPLOYER_BOOKMARKS: '/employer/bookmarks',
  EMPLOYER_SETTINGS: '/employer/settings',

  /* admin */
  ADMIN_ROOT: '/admin',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_EMPLOYERS: '/admin/employers',
  ADMIN_EMPLOYER_DETAIL: '/admin/employers/:id',
  ADMIN_JOBS: '/admin/jobs',
  ADMIN_JOB_DETAIL: '/admin/jobs/:id',
  ADMIN_USERS: '/admin/users',
  ADMIN_USER_DETAIL: '/admin/users/:id',
  ADMIN_REPORTS: '/admin/reports',
  ADMIN_AUDIT: '/admin/audit-logs',
  ADMIN_ANALYTICS: '/admin/analytics',
  ADMIN_SETTINGS: '/admin/settings',

  NOT_FOUND: '*',
});

/**
 * Fills `:param` placeholders.
 * @param {string} pattern
 * @param {Record<string, string|number>} params
 * @returns {string}
 */
export const buildPath = (pattern, params = {}) =>
  Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(String(value))),
    pattern,
  );

/** Where each role lands after signing in. */
export const HOME_BY_ROLE = Object.freeze({
  [ROLES.CANDIDATE]: ROUTES.CANDIDATE_DASHBOARD,
  [ROLES.EMPLOYER]: ROUTES.EMPLOYER_DASHBOARD,
  [ROLES.ADMIN]: ROUTES.ADMIN_DASHBOARD,
  [ROLES.GUEST]: ROUTES.HOME,
});

/** @param {string|null|undefined} role */
export const homeForRole = (role) => HOME_BY_ROLE[role ?? ROLES.GUEST] ?? ROUTES.HOME;

export default ROUTES;
