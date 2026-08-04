import { createSlice } from '@reduxjs/toolkit';

/**
 * @typedef {object} Toast
 * @property {string} id
 * @property {string} tone
 * @property {string} [title]
 * @property {string} [message]
 * @property {number} duration
 */

/**
 * Client-owned presentation state. Persisted (theme and sidebar survive a reload).
 *
 * `toasts` is annotated because an empty array literal infers as `never[]`, which makes every
 * push into it an error.
 *
 * @type {{theme: string, sidebarCollapsed: boolean, mobileNavOpen: boolean,
 *         activeModal: string|null, toasts: Toast[]}}
 */
const initialState = {
  theme: 'system', // 'light' | 'dark' | 'system'
  sidebarCollapsed: false,
  mobileNavOpen: false,
  activeModal: null,
  toasts: [],
};

let toastId = 0;

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action) => {
      state.theme = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setMobileNav: (state, action) => {
      state.mobileNavOpen = action.payload;
    },
    openModal: (state, action) => {
      state.activeModal = action.payload;
    },
    closeModal: (state) => {
      state.activeModal = null;
    },
    /**
     * ★ The id is generated in `prepare`, not in the reducer.
     *
     * A reducer must be pure: a counter or a timestamp inside one makes the same action
     * produce different state on replay, which breaks time-travel debugging and any future
     * action log. `prepare` is Redux Toolkit's sanctioned home for exactly this.
     *
     * Both halves are annotated because RTK checks that the reducer's action matches what
     * `prepare` returns — leaving either to inference makes the pair unassignable.
     */
    pushToast: {
      /** @param {{payload: Toast}} action */
      reducer: (state, action) => {
        state.toasts.push(action.payload);
      },
      /**
       * @param {{tone?: string, title?: string, message?: string, duration?: number}} input
       * @returns {{payload: Toast}}
       */
      prepare: ({ tone = 'info', title, message, duration = 5000 }) => ({
        payload: { id: `t${(toastId += 1)}`, tone, title, message, duration },
      }),
    },
    dismissToast: (state, action) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const {
  setTheme,
  toggleSidebar,
  setMobileNav,
  openModal,
  closeModal,
  pushToast,
  dismissToast,
} = uiSlice.actions;

export const selectTheme = (state) => state.ui.theme;
export const selectSidebarCollapsed = (state) => state.ui.sidebarCollapsed;
export const selectToasts = (state) => state.ui.toasts;

export default uiSlice.reducer;
