import mongoose from 'mongoose';
import env from './env.js';
import logger from './logger.js';

let isConnected = false;

/**
 * ★ Mongoose-wide settings, in one place so every connection gets the same ones.
 *
 * Exported and called by `tests/setup.js` as well. That is not tidiness — these are global
 * driver settings that change how queries are *interpreted*, so a test harness that skips
 * them runs against different semantics than production and can pass while production is
 * completely broken. That is not hypothetical: it is exactly what happened here, and it hid
 * a total failure of the public job list behind 142 green tests.
 *
 * `strictQuery` is on so a typo in a filter key throws instead of silently matching every
 * document — the difference between "no results" and "leaked the whole collection".
 */
export const applyMongooseSettings = () => {
  mongoose.set('strictQuery', true);

  /**
   * ★ Deliberately NOT `sanitizeFilter`.
   *
   * `sanitizeFilter` wraps any filter value containing `$` keys in `$eq`, because it cannot
   * distinguish an operator the server constructed from one that arrived in a request body.
   * It therefore breaks every server-built operator query — `buildPublicJobFilter()`'s
   * `deadline: {$gte: now}` becomes `{$eq: {$gte: now}}` and throws a CastError, taking the
   * entire public job list with it. Making it work would mean wrapping ~70 server-built
   * operators in `mongoose.trusted()` and remembering to do so in every filter written from
   * now on, where each omission is a production-only failure.
   *
   * Operator injection is already closed off twice before a filter is built:
   *   1. `mongoSanitize` (app.js) recursively deletes every `$`-prefixed and dotted key from
   *      body, params and query, so a `{$ne: null}` cannot survive the request boundary.
   *   2. Controllers read `req.validated` from `matchedData`, which contains only declared,
   *      type-coerced, allowlisted fields — an object cannot pass `toInt()` or an enum check.
   *
   * Layer 1 is the real defence and is unconditional; this was explicitly the backstop
   * behind it. See sanitize.middleware.js.
   */
};

/**
 * Connects to MongoDB with bounded retry.
 *
 * @param {{retries?: number, retryDelayMs?: number}} [opts]
 * @returns {Promise<typeof mongoose>}
 */
export const connectDatabase = async ({ retries = 5, retryDelayMs = 3000 } = {}) => {
  applyMongooseSettings();

  if (env.isDevelopment && process.env.MONGO_DEBUG === 'true') {
    mongoose.set('debug', (collection, method, query) => {
      logger.debug('mongo', { collection, method, query: safeStringify(query) });
    });
  }

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(env.MONGO_URI, {
        maxPoolSize: env.MONGO_MAX_POOL,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
        family: 4,
        autoIndex: !env.isProduction, // build indexes explicitly in prod via a migration
      });

      isConnected = true;
      logger.info('MongoDB connected', {
        host: mongoose.connection.host,
        db: mongoose.connection.name,
      });
      registerConnectionHandlers();
      return mongoose;
    } catch (error) {
      const isLast = attempt === retries;
      logger.error(`MongoDB connection failed (attempt ${attempt}/${retries})`, {
        message: /** @type {Error} */ (error).message,
      });
      if (isLast) throw error;
      await sleep(retryDelayMs * attempt); // linear backoff
    }
  }

  throw new Error('Unreachable');
};

const registerConnectionHandlers = () => {
  const conn = mongoose.connection;
  conn.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB disconnected');
  });
  conn.on('reconnected', () => {
    isConnected = true;
    logger.info('MongoDB reconnected');
  });
  conn.on('error', (error) => logger.error('MongoDB error', { message: error.message }));
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close(false);
  isConnected = false;
  logger.info('MongoDB connection closed');
};

/** @returns {boolean} */
export const isDatabaseConnected = () => isConnected && mongoose.connection.readyState === 1;

/** Liveness probe used by `/health/ready`. */
export const pingDatabase = async () => {
  if (!mongoose.connection.db) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
};

/** @param {number} ms */
const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** @param {unknown} value */
const safeStringify = (value) => {
  try {
    return JSON.stringify(value)?.slice(0, 500);
  } catch {
    return '[unserialisable]';
  }
};

export default connectDatabase;
