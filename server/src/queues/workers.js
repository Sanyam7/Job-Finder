import { Worker } from 'bullmq';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { getQueueConnection } from '../config/redis.js';
import { QUEUE_NAMES } from './index.js';
import { runResumeParse } from './resumeParse.job.js';

/**
 * BullMQ consumers. Registered by `worker.js` only — never by the API process.
 *
 * Running consumers inside the API would put multi-second PDF parsing on the same event loop
 * that serves requests, which is the whole reason the work was queued.
 */

/** @type {Worker[]} */
const workers = [];

export const registerWorkers = () => {
  const connection = getQueueConnection();

  if (!connection) {
    logger.warn('No REDIS_URL — queue consumers not registered; parsing runs inline in the API');
    return [];
  }

  const resumeWorker = new Worker(QUEUE_NAMES.RESUME_PARSE, async (job) => runResumeParse(job.data), {
    connection,
    prefix: `${env.QUEUE_PREFIX}:q`,
    /**
     * Deliberately low. Each job holds a whole PDF in memory and burns CPU parsing it;
     * a high concurrency here turns a burst of uploads into an OOM rather than into
     * throughput.
     */
    concurrency: 2,
    limiter: { max: 10, duration: 60_000 },
  });

  resumeWorker.on('completed', (job) => {
    logger.debug('Job completed', { queue: QUEUE_NAMES.RESUME_PARSE, jobId: job.id });
  });

  resumeWorker.on('failed', (job, error) => {
    // Only the final attempt is an error — earlier ones are retries doing their job.
    const exhausted = (job?.attemptsMade ?? 0) >= (job?.opts?.attempts ?? 1);
    logger[exhausted ? 'error' : 'warn']('Job failed', {
      queue: QUEUE_NAMES.RESUME_PARSE,
      jobId: job?.id,
      attempt: job?.attemptsMade,
      exhausted,
      message: error.message,
    });
  });

  workers.push(resumeWorker);
  logger.info('Queue consumers registered', { queues: workers.map((w) => w.name) });
  return workers;
};

export const closeWorkers = async () => {
  await Promise.allSettled(workers.map((w) => w.close()));
  workers.length = 0;
};

export default { registerWorkers, closeWorkers };
