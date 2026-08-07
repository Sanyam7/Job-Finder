import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ROLES } from '@verihire/shared';
import { ROUTES } from './routes/paths.js';
import {
  ProtectedRoute,
  PublicOnlyRoute,
  RoleRoute,
  VerifiedEmployerRoute,
} from './routes/guards.jsx';
import { FullPageSpinner } from './components/common/FullPageSpinner.jsx';
import { DashboardLayout } from './components/layout/DashboardLayout.jsx';
import { CANDIDATE_NAV, EMPLOYER_NAV, ADMIN_NAV } from './routes/navigation.jsx';

/**
 * Route-level code splitting, one chunk per portal.
 *
 * A candidate never downloads the admin queue; a guest browsing jobs downloads neither.
 * This is the single largest lever on initial bundle size.
 */
const Home = lazy(() => import('./pages/public/Home.jsx'));
const Jobs = lazy(() => import('./pages/public/Jobs.jsx'));
const JobDetail = lazy(() => import('./pages/public/JobDetail.jsx'));
const NotFound = lazy(() => import('./pages/public/NotFound.jsx'));

const Login = lazy(() => import('./pages/auth/Login.jsx'));
const Signup = lazy(() => import('./pages/auth/Signup.jsx'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword.jsx'));

const CandidateProfile = lazy(() => import('./pages/candidate/Profile.jsx'));
const CandidateApplications = lazy(() => import('./pages/candidate/Applications.jsx'));
const CandidateSaved = lazy(() => import('./pages/candidate/SavedJobs.jsx'));
const ResumeReview = lazy(() => import('./pages/candidate/ResumeReview.jsx'));

const EmployerVerification = lazy(() => import('./pages/employer/Verification.jsx'));
const EmployerCompany = lazy(() => import('./pages/employer/CompanyProfile.jsx'));
const EmployerJobs = lazy(() => import('./pages/employer/Jobs.jsx'));
const EmployerJobForm = lazy(() => import('./pages/employer/JobForm.jsx'));
const EmployerApplicants = lazy(() => import('./pages/employer/Applicants.jsx'));

const AdminEmployerQueue = lazy(() => import('./pages/admin/EmployerQueue.jsx'));
const AdminJobQueue = lazy(() => import('./pages/admin/JobQueue.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/Users.jsx'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics.jsx'));

export const App = () => (
  <Suspense fallback={<FullPageSpinner />}>
    <Routes>
      {/* ---------------------------------------------------------- public */}
      <Route path={ROUTES.HOME} element={<Home />} />
      <Route path={ROUTES.JOBS} element={<Jobs />} />
      <Route path={ROUTES.JOB_DETAIL} element={<JobDetail />} />
      <Route path={ROUTES.COMPANIES} element={<Placeholder title="Verified companies" />} />

      {/*
        Sign-in and sign-up bounce an authenticated user away; the rest must not. Someone
        following a reset link while still signed in on another tab needs to reach the form,
        and a verification link is arrived at precisely when there is no session.
      */}
      <Route element={<PublicOnlyRoute />}>
        <Route path={ROUTES.LOGIN} element={<Login />} />
        <Route path={ROUTES.SIGNUP} element={<Signup />} />
      </Route>
      <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword />} />
      <Route path={ROUTES.RESET_PASSWORD} element={<ResetPassword />} />

      <Route element={<ProtectedRoute />}>
        {/* ------------------------------------------------------ candidate */}
        <Route element={<RoleRoute allow={[ROLES.CANDIDATE]} />}>
          <Route element={<DashboardLayout nav={CANDIDATE_NAV} portalLabel="Candidate" />}>
            <Route path={ROUTES.CANDIDATE_DASHBOARD} element={<Placeholder title="Dashboard" />} />
            <Route path={ROUTES.CANDIDATE_PROFILE} element={<CandidateProfile />} />
            {/* ★ ADR-006 — the review screen where nothing is applied without a click */}
            <Route path={ROUTES.CANDIDATE_RESUME_REVIEW} element={<ResumeReview />} />
            <Route path={ROUTES.CANDIDATE_APPLICATIONS} element={<CandidateApplications />} />
            <Route path={ROUTES.CANDIDATE_SAVED} element={<CandidateSaved />} />
          </Route>
        </Route>

        {/* ------------------------------------------------------- employer */}
        <Route element={<RoleRoute allow={[ROLES.EMPLOYER]} />}>
          <Route element={<DashboardLayout nav={EMPLOYER_NAV} portalLabel="Employer" />}>
            {/*
              ★ Verification and the company profile sit OUTSIDE the gate on purpose.
              An unverified employer must always be able to reach the screen that explains
              why they are blocked and the form that unblocks them — a gate that hides its
              own exit is just a dead end.
            */}
            <Route path={ROUTES.EMPLOYER_VERIFICATION} element={<EmployerVerification />} />
            <Route path={ROUTES.EMPLOYER_COMPANY} element={<EmployerCompany />} />
            <Route path={ROUTES.EMPLOYER_DASHBOARD} element={<Placeholder title="Dashboard" />} />

            {/* ★ everything that can lead to a public listing */}
            <Route element={<VerifiedEmployerRoute />}>
              <Route path={ROUTES.EMPLOYER_JOBS} element={<EmployerJobs />} />
              <Route path={ROUTES.EMPLOYER_JOB_NEW} element={<EmployerJobForm />} />
              <Route path={ROUTES.EMPLOYER_JOB_EDIT} element={<EmployerJobForm />} />
              <Route path={ROUTES.EMPLOYER_JOB_APPLICANTS} element={<EmployerApplicants />} />
              <Route
                path={ROUTES.EMPLOYER_CANDIDATES}
                element={<Placeholder title="Candidate search" />}
              />
            </Route>
          </Route>
        </Route>

        {/* ---------------------------------------------------------- admin */}
        <Route element={<RoleRoute allow={[ROLES.ADMIN]} />}>
          <Route element={<DashboardLayout nav={ADMIN_NAV} portalLabel="Admin" />}>
            <Route path={ROUTES.ADMIN_DASHBOARD} element={<Placeholder title="Dashboard" />} />
            {/* ★★ gate 1 — the screen the whole product exists to serve */}
            <Route path={ROUTES.ADMIN_EMPLOYERS} element={<AdminEmployerQueue />} />
            {/* ★★ gate 2 */}
            <Route path={ROUTES.ADMIN_JOBS} element={<AdminJobQueue />} />
            <Route path={ROUTES.ADMIN_USERS} element={<AdminUsers />} />
            <Route path={ROUTES.ADMIN_ANALYTICS} element={<AdminAnalytics />} />
            <Route path={ROUTES.ADMIN_AUDIT} element={<Placeholder title="Audit log" />} />
          </Route>
        </Route>
      </Route>

      <Route path="/index.html" element={<Navigate to={ROUTES.HOME} replace />} />
      <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
    </Routes>
  </Suspense>
);

/**
 * Scaffolding for screens whose UI has not been built yet.
 *
 * Deliberately explicit rather than a blank page: the routing, guards and gate behaviour are
 * real and testable now, and it is obvious at a glance which surfaces still need work.
 */
const Placeholder = ({ title }) => (
  <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-3 px-6 text-center">
    <h1 className="text-2xl font-bold">{title}</h1>
    <p className="text-muted">
      This screen is not built yet. Routing, guards and the verification gate are already
      wired — see docs/09-ROADMAP.md.
    </p>
  </main>
);

export default App;
