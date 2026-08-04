import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  selectAuthStatus,
  selectIsAuthenticated,
  selectIsEmailVerified,
  selectIsVerifiedEmployer,
  selectUser,
} from '../features/auth/slices/authSlice.js';
import { ROUTES, homeForRole } from './paths.js';
import { FullPageSpinner } from '../components/common/FullPageSpinner.jsx';

/**
 * Requires a session.
 *
 * While `status === 'bootstrapping'` we render a spinner rather than redirecting. On a
 * hard reload the access token is gone (it lives in memory by design) and is being
 * recovered from the refresh cookie; redirecting during that window would bounce every
 * signed-in user to /login on every refresh.
 */
export const ProtectedRoute = () => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const status = useSelector(selectAuthStatus);
  const location = useLocation();

  if (status === 'idle' || status === 'bootstrapping') return <FullPageSpinner />;

  if (!isAuthenticated) {
    // Remember where they were headed so login can return them there.
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  return <Outlet />;
};

/**
 * Restricts a subtree to specific roles.
 * @param {{allow: string[]}} props
 */
export const RoleRoute = ({ allow }) => {
  const user = useSelector(selectUser);
  const status = useSelector(selectAuthStatus);

  if (status === 'bootstrapping') return <FullPageSpinner />;
  if (!user) return <Navigate to={ROUTES.LOGIN} replace />;

  // Send them to their own portal rather than a 403 — a candidate who lands on an admin
  // URL has taken a wrong turn, not attempted an intrusion.
  if (!allow.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;

  return <Outlet />;
};

/** Keeps signed-in users off /login and /signup. */
export const PublicOnlyRoute = () => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);
  const status = useSelector(selectAuthStatus);

  if (status === 'bootstrapping') return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to={homeForRole(user?.role)} replace />;

  return <Outlet />;
};

export const VerifiedEmailRoute = () => {
  const isVerified = useSelector(selectIsEmailVerified);
  if (!isVerified) return <Navigate to={ROUTES.VERIFY_EMAIL} replace />;
  return <Outlet />;
};

/**
 * ★ The client-side mirror of the USP gate.
 *
 * Redirects to the verification page instead of rendering a 403, because an employer
 * waiting on review has somewhere useful to be — their status page — and an error screen
 * would read as "you did something wrong" when they have not.
 *
 * This is presentation only. The server re-checks on every write; a user who edits their
 * Redux state gets a 403 from `requireVerifiedEmployer` the moment they try to act.
 */
export const VerifiedEmployerRoute = () => {
  const isVerifiedEmployer = useSelector(selectIsVerifiedEmployer);
  const status = useSelector(selectAuthStatus);

  if (status === 'bootstrapping') return <FullPageSpinner />;
  if (!isVerifiedEmployer) return <Navigate to={ROUTES.EMPLOYER_VERIFICATION} replace />;

  return <Outlet />;
};
