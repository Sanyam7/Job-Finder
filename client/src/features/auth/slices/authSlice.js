import { createSlice } from '@reduxjs/toolkit';
import { ROLES } from '@verihire/shared';

/**
 * Session state.
 *
 * ★ `accessToken` lives here and ONLY here — in memory, for the lifetime of the tab.
 * The persist config (app/store.js) whitelists `user` from this slice and nothing else.
 * Persisting the token would put it in localStorage, where any XSS payload can read it,
 * and would undo the entire reason the refresh token is an httpOnly cookie.
 *
 * Losing the token on reload is not a problem: `AppBootstrap` calls `/auth/refresh`, the
 * cookie is still valid, and a fresh token is minted silently. Persistent login without
 * a persisted token.
 */
const initialState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  /** 'idle' | 'bootstrapping' | 'authenticating' | 'ready' */
  status: 'idle',
  error: null,
  sessionLostReason: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { user, accessToken } = action.payload;
      state.user = user;
      state.accessToken = accessToken ?? state.accessToken;
      state.isAuthenticated = Boolean(user);
      state.status = 'ready';
      state.error = null;
      state.sessionLostReason = null;
    },

    /** Used by the axios refresh interceptor — replaces the token without touching user. */
    setAccessToken: (state, action) => {
      state.accessToken = action.payload;
      state.isAuthenticated = Boolean(state.user);
    },

    updateUser: (state, action) => {
      if (state.user) state.user = { ...state.user, ...action.payload };
    },

    /**
     * Keeps the employer's verification status current after an admin decision, so the
     * shell unlocks without requiring a full sign-out and back in.
     */
    setEmployerVerification: (state, action) => {
      if (state.user) {
        state.user.employerVerificationStatus = action.payload.verificationStatus;
        state.user.employerStatus = action.payload.status ?? state.user.employerStatus;
      }
    },

    authPending: (state) => {
      state.status = 'authenticating';
      state.error = null;
    },

    authFailed: (state, action) => {
      state.status = 'idle';
      state.error = action.payload ?? null;
    },

    bootstrapStarted: (state) => {
      state.status = 'bootstrapping';
    },

    bootstrapFinished: (state) => {
      if (state.status === 'bootstrapping') state.status = 'ready';
    },

    clearCredentials: (state, action) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.status = 'ready';
      state.error = null;
      state.sessionLostReason = action?.payload ?? null;
    },
  },
});

export const {
  setCredentials,
  setAccessToken,
  updateUser,
  setEmployerVerification,
  authPending,
  authFailed,
  bootstrapStarted,
  bootstrapFinished,
  clearCredentials,
} = authSlice.actions;

/* ---------------------------------------------------------------- selectors */

export const selectUser = (state) => state.auth.user;
export const selectAccessToken = (state) => state.auth.accessToken;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectAuthStatus = (state) => state.auth.status;
export const selectRole = (state) => state.auth.user?.role ?? ROLES.GUEST;

/**
 * ★ The client mirror of the USP gate.
 *
 * Used to render the correct shell — a locked dashboard rather than a dead button. The
 * server is still the authority: this is presentation, not enforcement, and every write
 * is re-checked by `requireVerifiedEmployer`.
 */
export const selectIsVerifiedEmployer = (state) =>
  state.auth.user?.role === ROLES.EMPLOYER &&
  state.auth.user?.employerVerificationStatus === 'VERIFIED' &&
  state.auth.user?.employerStatus === 'ACTIVE';

export const selectVerificationStatus = (state) =>
  state.auth.user?.employerVerificationStatus ?? null;

export default authSlice.reducer;
