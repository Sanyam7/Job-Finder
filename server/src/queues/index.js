import { Queue } from 'bullmq';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { getQueueConnection } from '../config/redis.js';

/**
 * BullMQ queues.
 *
 * ★ Every queue here degrades to inline execution when `REDIS_URL` is absent. That is a
 * deliberate developer-experience decision: `git clone && npm run dev` must work without a
 * Redis, and a feature that silently does nothing on a developer's machine is a feature that
 * ships broken. `enqueue()` returns `{queued: false}` in that mode and the caller runs the
 * job itself.
 */

export const QUEUE_NAMES = Object.freeze({
  RESUME_PARSE: 'resume-parse',
  EMAIL: 'email',
});

/** @type {Map<string, Queue>} */
const queues = new Map();

/**
 * @param {string} name
 * @returns {Queue|null}
 */
export const getQueue = (name) => {
  const connection = getQueueConnection();
  if (!connection) return null;

  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection,
        prefix: `${env.QUEUE_PREFIX}:q`,
        defaultJobOptions: {
          attempts: 3,
          // Exponential, not fixed: a transient Cloudinary blip clears in seconds, while a
          // sustained outage should not be hammered every second by every retry in flight.
          backoff: { type: 'exponential', delay: 5_000 },
          // Keep a window of history for debugging, then let Redis reclaim the memory.
          removeOnComplete: { age: 3600, count: 500 },
          removeOnFail: { age: 7 * 86_400 },
        },
      }),
    );
    logger.info('Queue ready', { queue: name });
  }

  return queues.get(name) ?? null;
};

/**
 * Adds a job, or reports that the caller must do the work itself.
 *
 * @param {string} queueName
 * @param {string} jobName
 * @param {Record<string, any>} payload
 * @param {{jobId?: string, delay?: number}} [opts]
 * @returns {Promise<{queued: boolean, jobId?: string}>}
 */
export const enqueue = async (queueName, jobName, payload, opts = {}) => {
  const queue = getQueue(queueName);
  if (!queue) return { queued: false };

  try {
    const job = await queue.add(jobName, payload, {
      // A stable jobId makes re-submission idempotent: a double-clicked upload produces one
      // parse, not two racing writes to the same draft.
      jobId: opts.jobId,
      delay: opts.delay,
    });
    return { queued: true, jobId: String(job.id) };
  } catch (error) {
    /**
     * Enqueue failure must not fail the user's request.
     *
     * Their resume is already stored; losing the *parse* means they fill in a few fields by
     * hand. Returning a 500 for that would be wildly out of proportion, so the caller falls
     * back to running the job inline.
     */
    logger.error('Enqueue failed — falling back to inline execution', {
      queue: queueName,
      job: jobName,
      message: /** @type {Error} */ (error).message,
    });
    return { queued: false };
  }
};

export const closeQueues = async () => {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
};

export default { QUEUE_NAMES, getQueue, enqueue, closeQueues };
