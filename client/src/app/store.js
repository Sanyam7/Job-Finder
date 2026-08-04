import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

import authReducer from '../features/auth/slices/authSlice.js';
import uiReducer from '../features/ui/slices/uiSlice.js';
import jobFilterReducer from '../features/jobs/slices/jobFilterSlice.js';

/**
 * ★ The security-critical part of the persistence config.
 *
 * `auth` is persisted through a nested config that whitelists `user` alone. The access
 * token is therefore never written to localStorage — see the note in authSlice.js. If
 * someone later adds `accessToken` to this whitelist "so login survives a refresh", they
 * will have silently reverted the token-handling design; the refresh cookie already
 * handles that case correctly.
 */
const authPersistConfig = {
  key: 'auth',
  storage,
  whitelist: ['user'],
};

const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  ui: uiReducer,
  jobFilter: jobFilterReducer,
});

const rootPersistConfig = {
  key: 'verihire',
  version: 1,
  storage,
  // Server-owned data is never persisted — TanStack Query owns it (ADR-005).
  whitelist: ['ui', 'jobFilter'],
};

export const store = configureStore({
  reducer: persistReducer(rootPersistConfig, rootReducer),
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // redux-persist dispatches non-serialisable internals; everything else is checked.
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
  devTools: import.meta.env.DEV,
});

export const persistor = persistStore(store);

/**
 * The shape of the whole client store.
 *
 * ★ Derived from `rootReducer` rather than from `store.getState()`. `persistReducer` wraps the
 * root reducer in a type that erases its state, so `store.getState()` resolves to `unknown` and
 * every `useSelector((state) => state.auth)` becomes a type error. Taking the type from the
 * unwrapped reducer gives the real shape, and it cannot drift — adding a slice above adds it
 * here.
 *
 * @typedef {ReturnType<typeof rootReducer>} RootState
 */

export default store;
