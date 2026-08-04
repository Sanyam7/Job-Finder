/**
 * The error shape every failed request produces.
 *
 * ★ `normaliseError` in `api/axiosClient.js` converts axios failures, timeouts and offline
 * errors into this single shape, so the UI switches on `error.code` and never on
 * `error.message` — codes are a contract, messages are copy.
 *
 * Declaring it here and registering it with TanStack Query below is what makes that contract
 * checkable. Without the registration, `useQuery`/`useMutation` type their `error` as the
 * built-in `Error`, so every `error.code === ERROR_CODES.ALREADY_APPLIED` in the app is a type
 * error — around twenty of them, which is enough noise to make the checker useless. Worse, it
 * means a typo'd or renamed code would never be caught.
 */
export interface ApiClientError {
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;

  /** A value from `ERROR_CODES`, or `TIMEOUT` / `NETWORK_ERROR` for transport failures. */
  code: string;

  /** Safe to show a user: our curated copy where we have it, the server's message otherwise. */
  message: string;

  /** Field errors on a 422; `null` otherwise. */
  details: Array<{ field: string; message: string }> | null;

  /** The server's correlation id — the string that turns a bug report into a log line. */
  requestId: string | null;

  /** True when the request never got a response, so "try again" is genuinely useful advice. */
  isNetworkError: boolean;
}

/**
 * Tells TanStack Query that a rejected query or mutation carries an `ApiClientError`.
 * This is the officially supported hook for replacing the default `Error` type.
 */
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiClientError;
  }
}
