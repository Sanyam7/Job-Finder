import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { authApi } from '../api/services/auth.api.js';
import {
  bootstrapStarted,
  bootstrapFinished,
  clearCredentials,
  selectAuthStatus,
  setCredentials,
} from '../features/auth/slices/authSlice.js';
import { FullPageSpinner } from '../components/common/FullPageSpinner.jsx';

/**
 * ★ Persistent login, without persisting a token.
 *
 * The access token lives in memory and dies with the tab, so on every load we ask
 * `/auth/refresh` whether the httpOnly cookie still represents a live session. If it does,
 * a fresh token is minted and the user never notices they were logged out. If it does not,
 * we clear whatever stale `user` object redux-persist rehydrated — otherwise the app would
 * render a signed-in shell for a session that no longer exists, and every request would
 * 401 into an infinite redirect.
 *
 * The whole app is gated behind this so guards never see a half-resolved session.
 */
export const AppBootstrap = ({ children }) => {
  const dispatch = useDispatch();
  const status = useSelector(selectAuthStatus);
  const hasRun = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in development; a second refresh would rotate the
    // token twice and trip the server's reuse detector.
    if (hasRun.current) return;
    hasRun.current = true;

    const restore = async () => {
      dispatch(bootstrapStarted());
      try {
        const { user, accessToken } = await authApi.refresh();
        dispatch(setCredentials({ user, accessToken }));
      } catch {
        // No cookie, expired, or revoked — all mean "not signed in".
        dispatch(clearCredentials());
      } finally {
        dispatch(bootstrapFinished());
      }
    };

    restore();
  }, [dispatch]);

  if (status === 'idle' || status === 'bootstrapping') {
    return <FullPageSpinner label="Restoring your session" />;
  }

  return children;
};

export default AppBootstrap;
