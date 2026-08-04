import axiosClient from '../axiosClient.js';

/** Unwraps the standard envelope so callers get `data`, not `{success, data, meta}`. */
const unwrap = (response) => response.data?.data;

export const authApi = {
  register: (payload) => axiosClient.post('/auth/register', payload).then(unwrap),
  login: (payload) => axiosClient.post('/auth/login', payload).then(unwrap),
  refresh: () => axiosClient.post('/auth/refresh').then(unwrap),
  logout: () => axiosClient.post('/auth/logout').then(unwrap),
  logoutAll: () => axiosClient.post('/auth/logout-all').then(unwrap),
  me: () => axiosClient.get('/auth/me').then(unwrap),
  verifyEmail: (token) => axiosClient.post('/auth/verify-email', { token }).then(unwrap),
  resendVerification: (email) =>
    axiosClient.post('/auth/resend-verification', { email }).then(unwrap),
  forgotPassword: (email) => axiosClient.post('/auth/forgot-password', { email }).then(unwrap),
  resetPassword: (payload) => axiosClient.post('/auth/reset-password', payload).then(unwrap),
  changePassword: (payload) => axiosClient.patch('/auth/change-password', payload).then(unwrap),
  listSessions: () => axiosClient.get('/auth/sessions').then(unwrap),
  revokeSession: (id) => axiosClient.delete(`/auth/sessions/${id}`).then(unwrap),
};

export default authApi;
