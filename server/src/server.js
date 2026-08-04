import http from 'node:http';
import app from './app.js';
import env, { envWarnings } from './config/env.js';
import logger from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { getRedis, disconnectRedis } from './config/redis.js';
import { closeTransporter } from './config/mailer.js';
import { registerSubscribers } from './events/index.js';

const server = http.createServer(app);

let isShuttingDown = false;

const start = async () => {
  for (const warning of envWarnings) logger.warn(warning);

  await connectDatabase();
  getRedis(); // no-op when REDIS_URL is unset — logs the degraded-mode warning once
  registerSubscribers();

  server.listen(env.PORT, () => {
    logger.info(`VeriHire API listening on port ${env.PORT}`, {
      environment: env.NODE_ENV,
      apiPrefix: env.API_PREFIX,
      pid: process.pid,
    });
  });
};

/**
 * Graceful shutdown.
 *
 * Stop accepting new connections, let in-flight requests finish, then close the database
 * and Redis. Without this, a rolling deploy severs requests mid-write — and a write that
 * was interrupted between "job approved" and "notify the employer" is exactly the kind of
 * inconsistency this platform cannot afford.
 *
 * @param {string} signal
 * @param {number} [exitCode]
 */
const shutdown = async (signal, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received — shutting down gracefully`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 15s — forcing exit');
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  try {
    await new Promise((resolve) => {
      server.close(resolve);
    });
    logger.info('HTTP server closed');

    await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
    closeTransporter();

    clearTimeout(forceExit);
    logger.info('Shutdown complete');
    process.exit(exitCode);
  } catch (error) {
    logger.error('Error during shutdown', { message: /** @type {Error} */ (error).message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * A process that has thrown an unhandled exception is in an unknown state. Log it, then
 * restart — a crashed process is safer than one silently serving corrupted data.
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { message: error.message, stack: error.stack });
  shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  shutdown('unhandledRejection', 1);
});

start().catch((error) => {
  logger.error('Failed to start server', { message: error.message, stack: error.stack });
  process.exit(1);
});

export default server;
