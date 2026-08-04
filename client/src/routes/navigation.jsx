import { ROUTES } from './paths.js';

/**
 * Sidebar navigation, one list per portal.
 *
 * Kept out of the layout so the layout stays a pure shell, and out of each page so the nav
 * does not have to be re-declared on every screen — which is how one portal ends up with a
 * link the other three lost.
 */

/** @param {{d: string}} props */
const Icon = ({ d }) => (
  <svg
    className="h-4 w-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  home: 'M3 12l9-9 9 9M5 10v10h14V10',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z',
  briefcase: 'M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2',
  building: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  chart: 'M18 20V10M12 20V4M6 20v-6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  sparkles: 'M12 3l1.9 5.8L20 10l-5.8 1.9L12 18l-1.9-6.1L4 10l6.1-1.2L12 3z',
};

export const CANDIDATE_NAV = [
  { to: ROUTES.CANDIDATE_DASHBOARD, label: 'Dashboard', icon: <Icon d={ICONS.home} /> },
  { to: ROUTES.JOBS, label: 'Find jobs', icon: <Icon d={ICONS.briefcase} /> },
  { to: ROUTES.CANDIDATE_APPLICATIONS, label: 'Applications', icon: <Icon d={ICONS.file} /> },
  { to: ROUTES.CANDIDATE_SAVED, label: 'Saved jobs', icon: <Icon d={ICONS.bookmark} /> },
  { to: ROUTES.CANDIDATE_PROFILE, label: 'Profile', icon: <Icon d={ICONS.user} /> },
];

export const EMPLOYER_NAV = [
  { to: ROUTES.EMPLOYER_DASHBOARD, label: 'Dashboard', icon: <Icon d={ICONS.home} /> },
  /**
   * ★ Verification sits second, above everything it gates.
   *
   * For an unverified employer this is the only link that leads anywhere useful, so burying
   * it under "Jobs" and "Candidates" — both of which will refuse them — would be a deliberate
   * dead end.
   */
  { to: ROUTES.EMPLOYER_VERIFICATION, label: 'Verification', icon: <Icon d={ICONS.shield} /> },
  { to: ROUTES.EMPLOYER_COMPANY, label: 'Company profile', icon: <Icon d={ICONS.building} /> },
  { to: ROUTES.EMPLOYER_JOBS, label: 'Your jobs', icon: <Icon d={ICONS.briefcase} /> },
  { to: ROUTES.EMPLOYER_CANDIDATES, label: 'Find candidates', icon: <Icon d={ICONS.users} /> },
];

export const ADMIN_NAV = [
  { to: ROUTES.ADMIN_DASHBOARD, label: 'Dashboard', icon: <Icon d={ICONS.home} /> },
  /** ★ The two queues are the job. They lead. */
  { to: ROUTES.ADMIN_EMPLOYERS, label: 'Verify companies', icon: <Icon d={ICONS.shield} /> },
  { to: ROUTES.ADMIN_JOBS, label: 'Approve jobs', icon: <Icon d={ICONS.briefcase} /> },
  { to: ROUTES.ADMIN_USERS, label: 'Users', icon: <Icon d={ICONS.users} /> },
  { to: ROUTES.ADMIN_ANALYTICS, label: 'Analytics', icon: <Icon d={ICONS.chart} /> },
  { to: ROUTES.ADMIN_AUDIT, label: 'Audit log', icon: <Icon d={ICONS.list} /> },
];

export default { CANDIDATE_NAV, EMPLOYER_NAV, ADMIN_NAV };
