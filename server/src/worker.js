import env, { envWarnings } from './config/env.js';
import logger from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { getRedis, disconnectRedis } from './config/redis.js';
import { closeTransporter } from './config/mailer.js';
import { registerSubscribers } from './events/index.js';
import { registerCronJobs, stopCronJobs } from './cron/index.js';
import { registerWorkers, closeWorkers } from './queues/workers.js';
import { closeQueues } from './queues/index.js';

/**
 * The background worker.
 *
 * Runs from the same image as the API but with a different entrypoint, and binds no port.
 * Its two responsibilities:
 *
 *  1. Scheduled maintenance (cron) — expiry, token purging, and the nightly visibility
 *     reconciliation that guards the core invariant.
 *  2. Queue consumers (BullMQ) — resume parsing and email retries, once Phase 6 lands.
 *
 * Keeping these out of the API process matters for correctness, not just tidiness: cron
 * registered in a horizontally scaled API would fire once per replica.
 */

let isShuttingDown = false;

const start = async () => {
  for (const warning of envWarnings) logger.warn(warning);

  await connectDatabase();
  getRedis();
  registerSubscribers();
  registerCronJobs();
  registerWorkers();

  logger.info('VeriHire worker started', {
    environment: env.NODE_ENV,
    cronEnabled: env.ENABLE_CRON,
    queuesEnabled: Boolean(env.REDIS_URL),
    pid: process.pid,
  });

  if (!env.REDIS_URL) {
    logger.warn(
      'REDIS_URL is not set — queue consumers are disabled. Resume parsing will run ' +
        'inline in the API process instead.',
    );
  }
};

/**
 * @param {string} signal
 * @param {number} [exitCode]
 */
const shutdown = async (signal, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received — worker shutting down`);

  const forceExit = setTimeout(() => {
    logger.error('Worker shutdown timed out after 15s — forcing exit');
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  try {
    // Stop taking new work first, so nothing starts that we then abandon mid-flight.
    stopCronJobs();
    // `closeWorkers` waits for in-flight jobs, so a resume being parsed during a deploy
    // finishes rather than being left stuck in PARSING forever.
    await closeWorkers();
    await closeQueues();
    await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
    closeTransporter();

    clearTimeout(forceExit);
    logger.info('Worker shutdown complete');
    process.exit(exitCode);
  } catch (error) {
    logger.error('Error during worker shutdown', {
      message: /** @type {Error} */ (error).message,
    });
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Worker uncaught exception', { message: error.message, stack: error.stack });
  shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Worker unhandled rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  shutdown('unhandledRejection', 1);
});

start().catch((error) => {
  logger.error('Worker failed to start', { message: error.message, stack: error.stack });
  process.exit(1);
});
