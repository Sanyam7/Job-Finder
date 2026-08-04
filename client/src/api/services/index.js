import axiosClient from '../axiosClient.js';

/**
 * API services.
 *
 * ★ Every function unwraps the standard envelope, so no component ever writes
 * `response.data.data`. `unwrapPage` keeps `pagination` and `summary` alongside the items,
 * because a list without its total is not a list a UI can paginate.
 */

const unwrap = (response) => response.data?.data;

const unwrapPage = (response) => ({
  items: response.data?.data ?? [],
  pagination: response.data?.pagination ?? null,
  summary: response.data?.summary ?? null,
});

/**
 * Drops empty filter values before they become query parameters.
 *
 * `?q=&workMode=` is not the same URL as `?`, so it is a different React Query cache key and
 * a different server-side cache entry — the same search, fetched and stored twice.
 */
const clean = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length),
    ),
  );

/* -------------------------------------------------------------------- public */

export const publicApi = {
  searchJobs: (params) => axiosClient.get('/public/jobs', { params: clean(params) }).then(unwrapPage),
  getJob: (slug) => axiosClient.get(`/public/jobs/${slug}`).then(unwrap),
  getSimilarJobs: (slug) => axiosClient.get(`/public/jobs/${slug}/similar`).then(unwrap),
  getFacets: (params) => axiosClient.get('/public/jobs/facets', { params: clean(params) }).then(unwrap),
  listCompanies: (params) =>
    axiosClient.get('/public/companies', { params: clean(params) }).then(unwrapPage),
  getCompany: (slug) => axiosClient.get(`/public/companies/${slug}`).then(unwrap),
  stats: () => axiosClient.get('/public/stats').then(unwrap),
  contact: (payload) => axiosClient.post('/public/contact', payload).then(unwrap),
};

/* ----------------------------------------------------------------- candidate */

export const candidateApi = {
  me: () => axiosClient.get('/candidates/me').then(unwrap),
  dashboard: () => axiosClient.get('/candidates/me/dashboard').then(unwrap),
  update: (payload) => axiosClient.patch('/candidates/me', payload).then(unwrap),
  updatePreferences: (payload) => axiosClient.patch('/candidates/me/preferences', payload).then(unwrap),
  updateVisibility: (payload) => axiosClient.patch('/candidates/me/visibility', payload).then(unwrap),
  setSkills: (skills) => axiosClient.put('/candidates/me/skills', { skills }).then(unwrap),

  addItem: (collection, item) => axiosClient.post(`/candidates/me/${collection}`, item).then(unwrap),
  updateItem: (collection, id, patch) =>
    axiosClient.patch(`/candidates/me/${collection}/${id}`, patch).then(unwrap),
  removeItem: (collection, id) =>
    axiosClient.delete(`/candidates/me/${collection}/${id}`).then(unwrap),

  uploadAvatar: (file) => upload('/candidates/me/avatar', 'image', file),
  removeAvatar: () => axiosClient.delete('/candidates/me/avatar').then(unwrap),

  uploadResume: (file) => upload('/candidates/me/resume', 'resume', file),
  removeResume: () => axiosClient.delete('/candidates/me/resume').then(unwrap),
  resumeUrl: () => axiosClient.get('/candidates/me/resume/url').then(unwrap),

  /* ★ ADR-006 — the review boundary. `applyDraft` requires explicit paths. */
  getDraft: () => axiosClient.get('/candidates/me/resume/draft').then(unwrap),
  applyDraft: (paths) =>
    axiosClient.post('/candidates/me/resume/draft/apply', { paths }).then(unwrap),
  discardDraft: () => axiosClient.delete('/candidates/me/resume/draft').then(unwrap),

  search: (params) => axiosClient.get('/candidates/search', { params: clean(params) }).then(unwrapPage),
  getOne: (id) => axiosClient.get(`/candidates/${id}`).then(unwrap),
};

/* ------------------------------------------------------------------ employer */

export const employerApi = {
  me: () => axiosClient.get('/employers/me').then(unwrap),
  update: (payload) => axiosClient.patch('/employers/me', payload).then(unwrap),
  verificationStatus: () => axiosClient.get('/employers/me/verification').then(unwrap),
  submitVerification: () => axiosClient.post('/employers/me/verification/submit').then(unwrap),
  uploadLogo: (file) => upload('/employers/me/logo', 'image', file),
  uploadDocuments: (files, types) => {
    const form = new FormData();
    for (const file of files) form.append('documents', file);
    for (const type of types) form.append('types', type);
    return axiosClient.post('/employers/me/documents', form).then(unwrap);
  },
  removeDocument: (docId) => axiosClient.delete(`/employers/me/documents/${docId}`).then(unwrap),
  myJobs: (params) => axiosClient.get('/employers/me/jobs', { params: clean(params) }).then(unwrapPage),
};

/* ---------------------------------------------------------------------- jobs */

export const jobApi = {
  create: (payload) => axiosClient.post('/jobs', payload).then(unwrap),
  get: (id) => axiosClient.get(`/jobs/${id}`).then(unwrap),
  update: (id, payload) => axiosClient.patch(`/jobs/${id}`, payload).then(unwrap),
  /** ★ The only transition that can lead to a public listing. */
  submit: (id) => axiosClient.post(`/jobs/${id}/submit`).then(unwrap),
  archive: (id) => axiosClient.post(`/jobs/${id}/archive`).then(unwrap),
  clone: (id) => axiosClient.post(`/jobs/${id}/clone`).then(unwrap),
  remove: (id) => axiosClient.delete(`/jobs/${id}`).then(unwrap),
  applicants: (id, params) =>
    axiosClient.get(`/jobs/${id}/applications`, { params: clean(params) }).then(unwrapPage),
};

/* -------------------------------------------------------------- applications */

export const applicationApi = {
  apply: (payload) => axiosClient.post('/applications', payload).then(unwrap),
  mine: (params) => axiosClient.get('/applications/me', { params: clean(params) }).then(unwrapPage),
  myStats: () => axiosClient.get('/applications/me/stats').then(unwrap),
  get: (id) => axiosClient.get(`/applications/${id}`).then(unwrap),
  timeline: (id) => axiosClient.get(`/applications/${id}/timeline`).then(unwrap),
  withdraw: (id, reason) => axiosClient.post(`/applications/${id}/withdraw`, { reason }).then(unwrap),

  forEmployer: (params) =>
    axiosClient.get('/applications/employer', { params: clean(params) }).then(unwrapPage),
  funnel: () => axiosClient.get('/applications/employer/funnel').then(unwrap),

  markViewed: (id) => axiosClient.post(`/applications/${id}/view`).then(unwrap),
  shortlist: (id, payload) => axiosClient.post(`/applications/${id}/shortlist`, payload).then(unwrap),
  reject: (id, payload) => axiosClient.post(`/applications/${id}/reject`, payload).then(unwrap),
  hire: (id, payload) => axiosClient.post(`/applications/${id}/hire`, payload).then(unwrap),
  scheduleInterview: (id, payload) =>
    axiosClient.post(`/applications/${id}/interview`, payload).then(unwrap),
  updateNotes: (id, payload) => axiosClient.patch(`/applications/${id}/notes`, payload).then(unwrap),
  bulkStatus: (payload) => axiosClient.patch('/applications/bulk/status', payload).then(unwrap),
  /** Audited server-side; the URL it returns expires in minutes. */
  resumeUrl: (id) => axiosClient.get(`/applications/${id}/resume`).then(unwrap),
};

/* ------------------------------------------------- notifications & bookmarks */

export const notificationApi = {
  list: (params) => axiosClient.get('/notifications', { params: clean(params) }).then(unwrapPage),
  summary: () => axiosClient.get('/notifications/summary').then(unwrap),
  markRead: (id) => axiosClient.patch(`/notifications/${id}/read`).then(unwrap),
  markAllRead: () => axiosClient.patch('/notifications/read-all').then(unwrap),
  remove: (id) => axiosClient.delete(`/notifications/${id}`).then(unwrap),
  clearRead: () => axiosClient.delete('/notifications/read').then(unwrap),
};

export const bookmarkApi = {
  toggle: (payload) => axiosClient.post('/bookmarks', payload).then(unwrap),
  list: (params) => axiosClient.get('/bookmarks', { params: clean(params) }).then(unwrapPage),
  update: (id, patch) => axiosClient.patch(`/bookmarks/${id}`, patch).then(unwrap),
  collections: (entityType) =>
    axiosClient.get('/bookmarks/collections', { params: { entityType } }).then(unwrap),
};

/* --------------------------------------------------------------------- admin */

export const adminApi = {
  dashboard: () => axiosClient.get('/admin/dashboard').then(unwrap),
  auditLogs: (params) => axiosClient.get('/admin/audit-logs', { params: clean(params) }).then(unwrapPage),

  /* ★ gate 1 */
  listEmployers: (params) => axiosClient.get('/admin/employers', { params: clean(params) }).then(unwrapPage),
  getEmployer: (id) => axiosClient.get(`/admin/employers/${id}`).then(unwrap),
  viewDocument: (id, docId) => axiosClient.get(`/admin/employers/${id}/documents/${docId}`).then(unwrap),
  verifyEmployer: (id, checklist) =>
    axiosClient.post(`/admin/employers/${id}/verify`, { checklist }).then(unwrap),
  rejectEmployer: (id, payload) => axiosClient.post(`/admin/employers/${id}/reject`, payload).then(unwrap),
  suspendEmployer: (id, payload) => axiosClient.post(`/admin/employers/${id}/suspend`, payload).then(unwrap),
  restoreEmployer: (id) => axiosClient.post(`/admin/employers/${id}/restore`).then(unwrap),

  /* ★ gate 2 */
  listJobs: (params) => axiosClient.get('/admin/jobs', { params: clean(params) }).then(unwrapPage),
  getJob: (id) => axiosClient.get(`/admin/jobs/${id}`).then(unwrap),
  approveJob: (id, payload) => axiosClient.post(`/admin/jobs/${id}/approve`, payload).then(unwrap),
  rejectJob: (id, payload) => axiosClient.post(`/admin/jobs/${id}/reject`, payload).then(unwrap),
  bulkApproveJobs: (ids) => axiosClient.post('/admin/jobs/bulk/approve', { ids }).then(unwrap),

  listUsers: (params) => axiosClient.get('/admin/users', { params: clean(params) }).then(unwrapPage),
  suspendUser: (id, reason) => axiosClient.post(`/admin/users/${id}/suspend`, { reason }).then(unwrap),
  restoreUser: (id) => axiosClient.post(`/admin/users/${id}/restore`).then(unwrap),

  analytics: {
    overview: (range) => axiosClient.get('/admin/analytics/overview', { params: { range } }).then(unwrap),
    users: (range) => axiosClient.get('/admin/analytics/users', { params: { range } }).then(unwrap),
    jobs: (range) => axiosClient.get('/admin/analytics/jobs', { params: { range } }).then(unwrap),
    applications: (range) =>
      axiosClient.get('/admin/analytics/applications', { params: { range } }).then(unwrap),
    moderation: (range) =>
      axiosClient.get('/admin/analytics/moderation', { params: { range } }).then(unwrap),
  },
  /** ★ The invariant check, on demand. */
  visibilityHealth: () => axiosClient.get('/admin/health/visibility').then(unwrap),
};

/**
 * Multipart helper.
 *
 * `Content-Type` is deliberately left unset: the browser must generate it so the multipart
 * boundary is included. Setting `multipart/form-data` by hand omits the boundary and the
 * server rejects the body as malformed — a classic, very confusing upload bug.
 *
 * @param {string} url @param {string} field @param {File} file
 */
const upload = (url, field, file) => {
  const form = new FormData();
  form.append(field, file);
  return axiosClient.post(url, form).then(unwrap);
};

export default {
  publicApi,
  candidateApi,
  employerApi,
  jobApi,
  applicationApi,
  notificationApi,
  bookmarkApi,
  adminApi,
};
