/**
 * Wraps an async controller so a rejected promise reaches the global error handler
 * instead of hanging the request forever.
 *
 * Express 4 does not await route handlers; an unhandled rejection inside one produces a
 * request that never responds and a process-level warning nobody sees. Every controller in
 * this codebase is wrapped.
 *
 * @template {import('express').RequestHandler} T
 * @param {T} handler
 * @returns {import('express').RequestHandler}
 */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export default asyncHandler;
