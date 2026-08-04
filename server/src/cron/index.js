import cron from 'node-cron';
import env from '../config/env.js';
import logger from '../config/logger.js';
import * as jobService from '../services/job.service.js';
import { tokenRepository } from '../repositories/token.repository.js';
import { jobRepository } from '../repositories/job.repository.js';
import { employerRepository } from '../repositories/employer.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../constants/events.js';

/** @type {import('node-cron').ScheduledTask[]} */
const tasks = [];

/**
 * Wraps a job so a failure logs instead of crashing the scheduler.
 * @param {string} name
 * @param {() => Promise<unknown>} fn
 */
const guard = (name, fn) => async () => {
  const started = Date.now();
  try {
    const result = await fn();
    logger.info(`Cron finished: ${name}`, { ms: Date.now() - started, result });
  } catch (error) {
    logger.error(`Cron failed: ${name}`, {
      message: /** @type {Error} */ (error).message,
      stack: /** @type {Error} */ (error).stack,
    });
  }
};

/**
 * ★ Scheduled maintenance.
 *
 * Registered ONLY in the worker process. If the API registered these, scaling to four
 * replicas would run the expiry job four times — archiving the same listings repeatedly and
 * sending four notification emails per employer.
 */
export const registerCronJobs = () => {
  if (!env.ENABLE_CRON) {
    logger.warn('Cron is disabled (ENABLE_CRON=false)');
    return;
  }

  /* Hourly — retire jobs whose deadline has passed. */
  tasks.push(
    cron.schedule(
      '0 * * * *',
      guard('expireJobs', () => jobService.expireOverdueJobs()),
    ),
  );

  /**
   * Nightly — ★ visibility reconciliation.
   *
   * A non-zero `corrected` count is a defect signal, not routine maintenance. It means a
   * write path failed to keep the denormalised flag in step with the truth, and the log
   * line at warn level is deliberately loud.
   */
  tasks.push(
    cron.schedule(
      '30 3 * * *',
      guard('reconcileVisibility', async () => {
        const result = await jobService.reconcileVisibility();
        if (result.corrected > 0) {
          logger.error('★ Visibility drift found — investigate the write path', {
            corrected: result.corrected,
            scanned: result.scanned,
          });
        }
        return result;
      }),
    ),
  );

  /* Daily 03:00 — purge spent tokens. The TTL indexes are the real guarantee; this is a
     belt-and-braces sweep that also clears long-revoked sessions. */
  tasks.push(
    cron.schedule(
      '0 3 * * *',
      guard('purgeTokens', async () => {
        const [refresh, verification] = await Promise.all([
          tokenRepository.purgeExpiredRefreshTokens(),
          tokenRepository.purgeExpiredVerificationTokens(),
        ]);
        return {
          refreshDeleted: refresh.deletedCount ?? 0,
          verificationDeleted: verification.deletedCount ?? 0,
        };
      }),
    ),
  );

  /* Daily 09:00 — warn employers about listings closing in three days. */
  tasks.push(
    cron.schedule(
      '0 9 * * *',
      guard('jobExpiringSoon', async () => {
        const jobs = await jobRepository.findExpiringSoon(3);
        for (const job of jobs) {
          eventBus.emit(EVENTS.JOB_EXPIRING_SOON, {
            jobId: String(job._id),
            jobTitle: job.title,
            employerId: String(job.employer),
            daysLeft: Math.ceil((new Date(job.deadline).getTime() - Date.now()) / 86_400_000),
          });
        }
        return { notified: jobs.length };
      }),
    ),
  );

  /**
   * Daily 09:00 — the moderation-queue digest.
   *
   * Manual verification only works if somebody looks at the queue. This tells the admin
   * team how many companies are waiting and how long the oldest has been waiting, which is
   * the metric that reveals whether the human gate has become the bottleneck.
   */
  tasks.push(
    cron.schedule(
      '5 9 * * *',
      guard('pendingQueueDigest', async () => {
        const [health, admins] = await Promise.all([
          employerRepository.getQueueHealth(),
          userRepository.findActiveAdmins(),
        ]);

        if (health.pending === 0) return { skipped: 'queue empty' };

        logger.info('Moderation queue digest', {
          pending: health.pending,
          avgWaitHours: health.avgWaitHours,
          oldestSubmittedAt: health.oldestSubmittedAt,
          adminCount: admins.length,
        });

        return { pending: health.pending, avgWaitHours: health.avgWaitHours };
      }),
    ),
  );

  /**
   * Daily 03:30 — notification retention.
   *
   * Read notifications go after 30 days; unread ones are left to the 90-day TTL index. A
   * user who has not opened the app in a month should still find out their company was
   * verified, but nobody needs "your application was viewed" from last spring.
   */
  tasks.push(
    cron.schedule(
      '30 3 * * *',
      guard('purgeNotifications', async () => {
        const { purgeOld } = await import('../services/notification.service.js');
        return purgeOld({ readAfterDays: 30 });
      }),
    ),
  );

  logger.info('Cron jobs registered', { count: tasks.length });
};

export const stopCronJobs = () => {
  tasks.forEach((task) => task.stop());
  tasks.length = 0;
  logger.info('Cron jobs stopped');
};

export default registerCronJobs;
