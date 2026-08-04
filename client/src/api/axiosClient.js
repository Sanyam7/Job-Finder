import axios from 'axios';
import { ERROR_CODES, ERROR_CODE_MESSAGES } from '@verihire/shared';
import { API_BASE_URL } from '../config/env.js';
import { ROUTES } from '../routes/paths.js';

/**
 * The single HTTP client.
 *
 * `withCredentials` is required: the refresh token lives in an httpOnly cookie and must
 * ride along on the refresh call. The access token is injected from Redux memory — it is
 * deliberately never read from localStorage, because anything localStorage can read, an
 * XSS payload can read too.
 */
export const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

/* ------------------------------------------------------------------ wiring */

/**
 * Injected at boot by `main.jsx` to avoid a circular import between the store and this
 * module (store → slices → api → store).
 * @type {{getAccessToken: () => string|null, setAccessToken: (t: string) => void,
 *         onSessionLost: (reason: string) => void}|null}
 */
let bridge = null;

/** @param {NonNullable<typeof bridge>} value */
export const attachAuthBridge = (value) => {
  bridge = value;
};

/* ------------------------------------------------------------------ errors */

/**
 * @typedef {Object} NormalisedError
 * @property {number} status
 * @property {string} code
 * @property {string} message
 * @property {Array<{field: string, message: string}>|Record<string, unknown>|null} details
 * @property {string|null} requestId
 * @property {boolean} isNetworkError
 */

/**
 * Turns every failure into one shape.
 *
 * Components should never see a raw Axios error. They switch on `code` — a stable
 * contract — rather than on `message`, which is copy and will change.
 *
 * @param {unknown} error
 * @returns {NormalisedError}
 */
export const normaliseError = (error) => {
  const axiosError = /** @type {import('axios').AxiosError<any>} */ (error);

  if (axiosError.code === 'ECONNABORTED') {
    return {
      status: 0,
      code: 'TIMEOUT',
      message: 'That took too long. Check your connection and try again.',
      details: null,
      requestId: null,
      isNetworkError: true,
    };
  }

  if (!axiosError.response) {
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: "We couldn't reach the server. Check your connection.",
      details: null,
      requestId: null,
      isNetworkError: true,
    };
  }

  const { status, data } = axiosError.response;
  const code = data?.error?.code ?? ERROR_CODES.INTERNAL_ERROR;

  return {
    status,
    code,
    // Prefer our own curated copy where we have it; fall back to the server's message.
    message: ERROR_CODE_MESSAGES[code] ?? data?.message ?? 'Something went wrong.',
    details: data?.error?.details ?? null,
    requestId: data?.meta?.requestId ?? null,
    isNetworkError: false,
  };
};

/* ------------------------------------------------------------- interceptors */

axiosClient.interceptors.request.use((config) => {
  const token = bridge?.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Let the browser set the multipart boundary itself.
  if (config.data instanceof FormData) delete config.headers['Content-Type'];

  return config;
});

/** Refresh is never itself retried, and never triggers a nested refresh. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

let isRefreshing = false;
/** @type {Array<{resolve: (v: any) => void, reject: (e: any) => void, config: any}>} */
let pendingQueue = [];

/**
 * ★ The refresh queue.
 *
 * A dashboard fires six requests on mount. When the access token has expired, all six come
 * back 401 at once. Without this queue each one independently calls `/auth/refresh`, and
 * because refresh tokens rotate, five of those six present a token the server has just
 * revoked — which the reuse detector correctly reads as theft and responds to by killing
 * the entire session family. The user gets logged out for doing nothing wrong, and the
 * bug is nearly impossible to reproduce by hand because it needs concurrency.
 *
 * So: the first 401 performs the refresh; every other in-flight request parks here and is
 * replayed with the new token once it lands.
 */
axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const axiosError = /** @type {import('axios').AxiosError<any>} */ (error);

    /**
     * The `?? {}` fallback narrows the type to the empty object, losing `url` and `headers`.
     * `_retried` is ours in any case — a marker we set on the config so a replayed request
     * cannot trigger a second refresh and recurse.
     *
     * @type {import('axios').InternalAxiosRequestConfig & {_retried?: boolean}}
     */
    const config = axiosError.config ?? /** @type {any} */ ({});
    const status = axiosError.response?.status;
    const code = axiosError.response?.data?.error?.code;

    const isAuthPath = NO_REFRESH_PATHS.some((path) => config.url?.includes(path));
    const isExpired =
      code === ERROR_CODES.TOKEN_EXPIRED ||
      code === ERROR_CODES.TOKEN_MISSING ||
      code === ERROR_CODES.TOKEN_INVALID;

    if (status !== 401 || config._retried || isAuthPath || !isExpired) {
      return Promise.reject(normaliseError(error));
    }

    config._retried = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject, config });
      });
    }

    isRefreshing = true;

    try {
      const { data } = await axiosClient.post('/auth/refresh');
      const accessToken = data?.data?.accessToken;
      if (!accessToken) throw new Error('Refresh returned no access token');

      bridge?.setAccessToken(accessToken);

      // Replay everything that was waiting.
      const queue = pendingQueue;
      pendingQueue = [];
      queue.forEach(({ resolve, reject, config: queued }) => {
        queued.headers.Authorization = `Bearer ${accessToken}`;
        axiosClient(queued).then(resolve).catch(reject);
      });

      config.headers.Authorization = `Bearer ${accessToken}`;
      return await axiosClient(config);
    } catch (refreshError) {
      const queue = pendingQueue;
      pendingQueue = [];
      queue.forEach(({ reject }) => reject(normaliseError(refreshError)));

      const reason =
        /** @type {any} */ (refreshError)?.response?.data?.error?.code ===
        ERROR_CODES.SESSION_REVOKED
          ? 'session_revoked'
          : 'session_expired';

      bridge?.onSessionLost(reason);
      return Promise.reject(normaliseError(refreshError));
    } finally {
      isRefreshing = false;
    }
  },
);

/** Redirect helper used by the store when a session cannot be recovered. */
export const redirectToLogin = (reason = 'session_expired') => {
  if (window.location.pathname === ROUTES.LOGIN) return;
  window.location.assign(`${ROUTES.LOGIN}?reason=${reason}`);
};

export default axiosClient;
