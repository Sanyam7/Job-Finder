/**
 * User roles. Chosen at sign-up and immutable thereafter.
 * ADMIN can never be self-assigned — it comes from the seeder or an admin promotion.
 */
export const ROLES = Object.freeze({
  GUEST: 'GUEST',
  CANDIDATE: 'CANDIDATE',
  EMPLOYER: 'EMPLOYER',
  ADMIN: 'ADMIN',
});

/**
 * Roles that can be selected during public registration.
 *
 * Typed as `readonly string[]` rather than a two-literal tuple: every use is a membership test
 * against a value typed as a wider string (`REGISTERABLE_ROLES.includes(dto.role)`), and a
 * narrow tuple makes `.includes()` itself a type error.
 *
 * @type {readonly string[]}
 */
export const REGISTERABLE_ROLES = Object.freeze([ROLES.CANDIDATE, ROLES.EMPLOYER]);

/**
 * Roles that own a persisted account (GUEST is the absence of a session).
 * @type {readonly string[]}
 */
export const ACCOUNT_ROLES = Object.freeze([ROLES.CANDIDATE, ROLES.EMPLOYER, ROLES.ADMIN]);

export const ROLE_VALUES = Object.freeze(Object.values(ROLES));

export const ROLE_META = Object.freeze({
  [ROLES.GUEST]: { label: 'Guest', homePath: '/' },
  [ROLES.CANDIDATE]: { label: 'Candidate', homePath: '/candidate/dashboard' },
  [ROLES.EMPLOYER]: { label: 'Employer', homePath: '/employer/dashboard' },
  [ROLES.ADMIN]: { label: 'Admin', homePath: '/admin/dashboard' },
});

/**
 * @param {string} role
 * @returns {string} the landing route for a freshly authenticated user
 */
export const getHomePathForRole = (role) => ROLE_META[role]?.homePath ?? '/';
