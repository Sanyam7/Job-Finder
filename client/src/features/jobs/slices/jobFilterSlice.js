import { createSlice } from '@reduxjs/toolkit';
import { JOB_SORT } from '@verihire/shared';

/**
 * The filter *draft* — what the user has typed and toggled.
 *
 * This belongs in Redux; the resulting job list does not. Redux owns the question,
 * TanStack Query owns the answer (ADR-005). Keeping the two separate is what avoids the
 * usual mess of hand-rolled loading/error/data triplets duplicated across slices.
 */
const initialState = {
  keyword: '',
  location: '',
  skills: [],
  workMode: [],
  employmentType: [],
  industry: [],
  minSalary: null,
  maxSalary: null,
  minExpYears: null,
  maxExpYears: null,
  educationLevel: null,
  postedWithinDays: null,
  sort: JOB_SORT.NEWEST,
  page: 1,
};

const jobFilterSlice = createSlice({
  name: 'jobFilter',
  initialState,
  reducers: {
    setFilter: (state, action) => {
      const { key, value } = action.payload;
      state[key] = value;
      // Any filter change invalidates the current page — staying on page 7 of a result
      // set that now has two pages shows an empty screen.
      if (key !== 'page') state.page = 1;
    },

    toggleArrayFilter: (state, action) => {
      const { key, value } = action.payload;
      const current = state[key] ?? [];
      state[key] = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      state.page = 1;
    },

    setPage: (state, action) => {
      state.page = action.payload;
    },

    /** Hydrates from the URL query string so a shared link reproduces the exact search. */
    hydrateFromQuery: (state, action) => {
      const params = action.payload ?? {};
      for (const key of Object.keys(initialState)) {
        if (params[key] === undefined) continue;
        state[key] = params[key];
      }
    },

    resetFilters: () => initialState,
  },
});

export const { setFilter, toggleArrayFilter, setPage, hydrateFromQuery, resetFilters } =
  jobFilterSlice.actions;

export const selectJobFilters = (state) => state.jobFilter;

/** Number of active filters — drives the "Clear all (3)" affordance. */
export const selectActiveFilterCount = (state) => {
  const f = state.jobFilter;
  let count = 0;
  if (f.keyword) count += 1;
  if (f.location) count += 1;
  count += f.skills.length + f.workMode.length + f.employmentType.length + f.industry.length;
  if (f.minSalary != null || f.maxSalary != null) count += 1;
  if (f.minExpYears != null || f.maxExpYears != null) count += 1;
  if (f.educationLevel) count += 1;
  if (f.postedWithinDays) count += 1;
  return count;
};

/** Strips empties so the query key (and the URL) stays stable and cache-friendly. */
export const selectQueryParams = (state) => {
  const f = state.jobFilter;
  /** @type {Record<string, any>} */
  const params = {};
  for (const [key, value] of Object.entries(f)) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    params[key] = Array.isArray(value) ? value.join(',') : value;
  }
  return params;
};

export default jobFilterSlice.reducer;
