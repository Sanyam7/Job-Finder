import { useDispatch, useSelector } from 'react-redux';

/**
 * Typed Redux hooks.
 *
 * ★ Components import these, never `useSelector` from `react-redux` directly. The plain hook
 * receives the store's state type, which `persistReducer` erases to `unknown` — so
 * `useSelector((state) => state.auth.user)` compiles to an error and, worse, gives no
 * autocomplete on the one piece of client state that matters.
 *
 * This is the standard Redux Toolkit pattern. Doing it once here beats a cast at every call
 * site, and it means adding a slice to `rootReducer` immediately makes it visible everywhere.
 *
 * @type {import('react-redux').TypedUseSelectorHook<import('./store.js').RootState>}
 */
export const useAppSelector = useSelector;

/** Paired with the above so both hooks are imported from one place. */
export const useAppDispatch = useDispatch;
