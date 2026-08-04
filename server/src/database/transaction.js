import mongoose from 'mongoose';
import logger from '../config/logger.js';

/**
 * Runs `fn` inside a MongoDB transaction, with a graceful fallback.
 *
 * Transactions require a replica set. A standalone `mongod` — which is what most people
 * have running locally — rejects them outright. Rather than force every developer to
 * configure a single-node replica set before the app will start, we detect that specific
 * failure and run the same function without a session.
 *
 * The trade-off is explicit: in that mode a multi-document operation is no longer atomic.
 * That is acceptable for local development and unacceptable for production, which is why
 * the fallback logs a warning every time it fires and production runs against Atlas
 * (always a replica set).
 *
 * @template T
 * @param {(session: import('mongoose').ClientSession|null) => Promise<T>} fn
 * @param {{name?: string}} [opts]
 * @returns {Promise<T>}
 */
export const withTransaction = async (fn, { name = 'transaction' } = {}) => {
  let session = null;

  try {
    session = await mongoose.startSession();
  } catch (error) {
    logger.warn(`${name}: could not start a session — running without a transaction`, {
      message: /** @type {Error} */ (error).message,
    });
    return fn(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return /** @type {T} */ (result);
  } catch (error) {
    const err = /** @type {any} */ (error);

    if (isUnsupportedTransactionError(err)) {
      logger.warn(
        `${name}: this MongoDB deployment does not support transactions — ` +
          'running without atomicity. Use a replica set in production.',
      );
      return fn(null);
    }

    logger.error(`${name}: transaction aborted`, { message: err.message });
    throw error;
  } finally {
    await session.endSession().catch(() => {});
  }
};

/** @param {any} error */
const isUnsupportedTransactionError = (error) => {
  const message = String(error?.message ?? '');
  return (
    error?.code === 20 || // IllegalOperation
    error?.codeName === 'IllegalOperation' ||
    /Transaction numbers are only allowed on a replica set/i.test(message) ||
    /transactions are not supported/i.test(message) ||
    /replica set/i.test(message)
  );
};

export default withTransaction;
