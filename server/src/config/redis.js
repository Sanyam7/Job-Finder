// The named export, not the default: ioredis v5 exposes both, but under NodeNext resolution
// the default resolves to a namespace that is not constructable.
import { Redis } from 'ioredis';
import env from './env.js';
import logger from './logger.js';

/** @type {Redis|null} */
let client = null;
let hasWarned = false;

/**
 * Redis is optional by design.
 *
 * With `REDIS_URL` set: BullMQ queues, distributed rate limiting and response caching.
 * Without it: the app still runs — parsing goes inline, rate limits become per-process,
 * caching is a no-op — and warns loudly at boot. Dev machines shouldn't need a Redis to
 * run the project; production shouldn't run without one.
 *
 * @returns {Redis|null}
 */
export const getRedis = () => {
  if (!env.REDIS_URL) {
    if (!hasWarned) {
      hasWarned = true;
      logger.warn('Redis is not configured — running in degraded (single-process) mode');
    }
    return null;
  }
  if (client) return client;

  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    lazyConnect: false,
    connectTimeout: 5000,

    /**
     * Fail fast instead of queueing.
     *
     * With the default `enableOfflineQueue: true`, every command issued while Redis is
     * unreachable is buffered indefinitely — so a Redis outage turns into every HTTP
     * request hanging until the client times out, which is a far worse failure than
     * losing the rate-limit counters. Commands now reject immediately and callers
     * degrade gracefully.
     */
    enableOfflineQueue: false,
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.error('Redis error', { message: err.message }));
  client.on('close', () => logger.warn('Redis connection closed'));

  return client;
};

/** BullMQ needs its own connection options rather than a shared client. */
export const getQueueConnection = () =>
  env.REDIS_URL ? { url: env.REDIS_URL, maxRetriesPerRequest: null } : null;

export const isRedisAvailable = () => Boolean(env.REDIS_URL) && client?.status === 'ready';

export const pingRedis = async () => {
  const redis = getRedis();
  if (!redis) return null; // null = not configured, distinct from false = configured but down
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
};

export const disconnectRedis = async () => {
  if (!client) return;
  await client.quit().catch(() => client?.disconnect());
  client = null;
  logger.info('Redis connection closed');
};

export default getRedis;
