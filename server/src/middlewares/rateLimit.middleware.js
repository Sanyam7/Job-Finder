import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { ERROR_CODES } from '@verihire/shared';
import env from '../config/env.js';
import { getRedis } from '../config/redis.js';
import logger from '../config/logger.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';

/**
 * Normalises a client address into a rate-limit bucket.
 *
 * IPv6 is collapsed to its /64 prefix. A residential IPv6 allocation hands the client an
 * enormous address space, so keying on the full address would let one host reset its own
 * counter simply by picking a new address for each request. The /64 is the smallest block
 * a single subscriber is reliably assigned, so it is the right unit to throttle.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export const clientKey = (req) => {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

  // Express reports IPv4-mapped IPv6 as ::ffff:1.2.3.4 — treat that as plain IPv4.
  const unmapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!unmapped.includes(':')) return unmapped;

  const groups = unmapped.split('%')[0].split(':');
  return `${groups.slice(0, 4).join(':')}::/64`;
};

/**
 * Builds a limiter backed by Redis when available, memory otherwise.
 *
 * The memory store is per-process, so with 4 API replicas a "5 per 15 min" login limit
 * becomes 20. That is exactly why REDIS_URL warns at boot in production.
 *
 * @param {{windowMs?: number, max?: number|((req: import('express').Request) => number),
 *          keyPrefix: string, message?: string,
 *          keyBy?: (req: import('express').Request) => string,
 *          skipSuccessful?: boolean}} options
 */
export const createRateLimiter = (options) => {
  /**
   * Limiters are built lazily, on first request.
   *
   * `RedisStore`'s constructor eagerly issues `SCRIPT LOAD`. Building it at module load —
   * before Redis has connected — produces an unhandled rejection that takes the process
   * down at import time. Deferring construction lets us look at the real connection state
   * and fall back to the memory store, and lets a limiter created during an outage pick
   * Redis up once it recovers.
   *
   * @type {import('express').RequestHandler|null}
   */
  let limiter = null;
  let usingRedis = false;
  let nextRedisCheck = 0;

  return (req, res, next) => {
    const now = Date.now();

    // Rebuild if we are on the memory fallback and it is time to re-check Redis.
    if (limiter && !usingRedis && env.REDIS_URL && now >= nextRedisCheck) {
      if (getRedis()?.status === 'ready') limiter = null;
      else nextRedisCheck = now + 30_000;
    }

    if (!limiter) {
      const redis = env.REDIS_URL ? getRedis() : null;
      usingRedis = redis?.status === 'ready';

      if (env.REDIS_URL && !usingRedis) {
        nextRedisCheck = now + 30_000;
        logger.warn('Rate limiter using in-memory store — Redis not ready', {
          keyPrefix: options.keyPrefix,
          status: redis?.status ?? 'absent',
        });
      }

      limiter = buildLimiter(options, usingRedis ? redis : null);
    }

    return limiter(req, res, next);
  };
};

/**
 * @param {{windowMs?: number, max?: number|((req: import('express').Request) => number),
 *          keyPrefix: string, message?: string,
 *          keyBy?: (req: import('express').Request) => string,
 *          skipSuccessful?: boolean}} options
 * @param {import('ioredis').Redis|null} redis
 */
const buildLimiter = (
  {
    windowMs = env.RATE_LIMIT_WINDOW_MS,
    max = env.RATE_LIMIT_MAX_ANON,
    keyPrefix,
    message = MESSAGES.ERROR.RATE_LIMITED,
    keyBy,
    skipSuccessful = false,
  },
  redis,
) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: skipSuccessful,
    skip: () => !env.RATE_LIMIT_ENABLED,

    keyGenerator: (req) => `${keyPrefix}:${keyBy ? keyBy(req) : clientKey(req)}`,

    /**
     * Fail open if the store is unreachable.
     *
     * The trade-off is deliberate. During a Redis incident, quotas briefly stop being
     * enforced; the alternative is every request 500-ing because a *secondary* system is
     * down. Losing throttling for a few minutes is recoverable, losing the whole site is
     * not — and the security-critical path does not depend on Redis anyway, because
     * brute-force protection also has a database-backed account lockout
     * (`user.registerFailedLogin`).
     */
    passOnStoreError: true,

    // Deferred construction is intentional (see createRateLimiter); the library's warning
    // about building a limiter inside a handler does not apply — ours is built once and
    // cached, not per request.
    validate: { creationStack: false },

    store: redis
      ? new RedisStore({
          // `redis.call` is declared as an overload set over specific command signatures, so
          // a generic spread cannot satisfy it. The cast is on the client, not on the
          // arguments — rate-limit-flexible passes exactly the commands ioredis accepts.
          sendCommand: (...args) => /** @type {any} */ (redis).call(...args),
          prefix: `${env.QUEUE_PREFIX}:rl:`,
        })
      : undefined,

    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        requestId: req.id,
        keyPrefix,
        ip: req.ip,
        userId: req.user?.id ?? null,
        path: req.originalUrl,
      });
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
        message,
        error: { code: ERROR_CODES.TOO_MANY_REQUESTS },
        meta: { requestId: req.id ?? null, timestamp: new Date().toISOString() },
      });
    },
  });

/** Authenticated users get a higher ceiling, keyed by user rather than shared NAT IP. */
export const globalLimiter = createRateLimiter({
  keyPrefix: 'global',
  max: (req) => (req.user ? env.RATE_LIMIT_MAX_AUTH : env.RATE_LIMIT_MAX_ANON),
  keyBy: (req) => req.user?.id ?? clientKey(req),
});

/**
 * Login is keyed by IP **and** email, so one attacker cannot lock out an arbitrary user by
 * hammering their address, and cannot bypass the limit by rotating emails from one IP.
 */
export const loginLimiter = createRateLimiter({
  keyPrefix: 'login',
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessful: true,
  keyBy: (req) => `${clientKey(req)}:${String(req.body?.email ?? '').toLowerCase()}`,
  message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
});

export const registerLimiter = createRateLimiter({
  keyPrefix: 'register',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many accounts created from this network. Please try again later.',
});

export const passwordResetLimiter = createRateLimiter({
  keyPrefix: 'pwreset',
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyBy: (req) => `${clientKey(req)}:${String(req.body?.email ?? '').toLowerCase()}`,
  message: 'Too many reset requests. Please try again in an hour.',
});

export const applyLimiter = createRateLimiter({
  keyPrefix: 'apply',
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyBy: (req) => req.user?.id ?? clientKey(req),
  message: "You've applied to a lot of jobs in a short time. Please slow down.",
});

export const jobCreateLimiter = createRateLimiter({
  keyPrefix: 'jobcreate',
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyBy: (req) => req.user?.id ?? clientKey(req),
});

export const uploadLimiter = createRateLimiter({
  keyPrefix: 'upload',
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyBy: (req) => req.user?.id ?? clientKey(req),
});

export const searchLimiter = createRateLimiter({
  keyPrefix: 'search',
  windowMs: 60 * 1000,
  max: 30,
  keyBy: (req) => req.user?.id ?? clientKey(req),
});

export const contactLimiter = createRateLimiter({
  keyPrefix: 'contact',
  windowMs: 60 * 60 * 1000,
  max: 3,
});
