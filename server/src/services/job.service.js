import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  ERROR_CODES,
  JOB_MATERIAL_FIELDS,
  JOB_STATUS,
  JOB_STATUS_TRANSITIONS,
} from '@verihire/shared';
import logger from '../config/logger.js';
import { jobRepository } from '../repositories/job.repository.js';
import { employerRepository } from '../repositories/employer.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { withTransaction } from '../database/transaction.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';
import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../constants/events.js';
import * as auditService from './audit.service.js';
import { buildSnapshot } from './verification.service.js';

/**
 * ★ GATE 2 — per-job approval, and the visibility rule.
 */

/**
 * ★ The single source of truth for whether a job is publicly visible.
 *
 * Everything that could change visibility routes through here — approval, rejection,
 * archiving, employer verification, employer suspension, deadline expiry, and the nightly
 * reconciliation. One function means those paths cannot drift apart, which is the failure
 * mode that would break the platform's core promise.
 *
 * @param {{status: string, deadline?: Date|null, deletedAt?: Date|null}} job
 * @param {{verificationStatus: string, status: string, deletedAt?: Date|null}|null} employer
 * @returns {boolean}
 */
export const computeVisibility = (job, employer) =>
  Boolean(
    job &&
      employer &&
      job.status === JOB_STATUS.APPROVED &&
      !job.deletedAt &&
      job.deadline &&
      new Date(job.deadline).getTime() >= Date.now() &&
      employer.verificationStatus === 'VERIFIED' &&
      employer.status === 'ACTIVE' &&
      !employer.deletedAt,
  );

/**
 * Guard used by the write-side middleware and by every job mutation.
 * @param {any} employer
 */
export const assertCanPostJobs = (employer) => {
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }
  if (employer.status === 'SUSPENDED') {
    throw new ForbiddenError(ERROR_CODES.EMPLOYER_SUSPENDED, MESSAGES.EMPLOYER.SUSPENDED, {
      reason: employer.suspension?.reason ?? null,
    });
  }
  if (employer.verificationStatus !== 'VERIFIED') {
    throw new ForbiddenError(ERROR_CODES.EMPLOYER_NOT_VERIFIED, MESSAGES.EMPLOYER.NOT_VERIFIED, {
      verificationStatus: employer.verificationStatus,
      rejectionReason: employer.verification?.rejectionReason ?? null,
      canResubmit: employer.verificationStatus !== 'PENDING',
    });
  }
};

/**
 * @param {string} from
 * @param {string} to
 */
const assertTransition = (from, to) => {
  const allowed = JOB_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ConflictError(
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      `A job cannot move from ${from} to ${to}.`,
      { from, to, allowed },
    );
  }
};

/**
 * Creates a job as a DRAFT.
 *
 * Note `isPubliclyVisible: false` is set explicitly rather than relying on the schema
 * default. Being explicit here means a future refactor of the default cannot silently
 * publish every newly created job.
 *
 * @param {Record<string, any>} dto
 * @param {{id: string, role: string, email: string}} actor
 */
export const createJob = async (dto, actor) => {
  const employer = await employerRepository.findByOwner(actor.id, { lean: false });
  assertCanPostJobs(employer);

  const job = await jobRepository.create({
    ...dto,
    employer: employer._id,
    postedBy: actor.id,
    companySnapshot: buildSnapshot(employer, true),
    status: JOB_STATUS.DRAFT,
    isPubliclyVisible: false,
    publishedAt: null,
  });

  await employerRepository.bumpStats(String(employer._id), { 'stats.totalJobsPosted': 1 });

  eventBus.emit(EVENTS.JOB_CREATED, {
    jobId: String(job._id),
    employerId: String(employer._id),
    title: job.title,
  });

  return job;
};

/**
 * Updates a job.
 *
 * ★ The material-edit rule. Changing the substance of an already-approved listing sends it
 * back to PENDING and hides it until a human re-reads it. Without this, the approval gate
 * is trivially bypassed: get one clean job approved, then rewrite it into whatever you
 * wanted to post in the first place.
 *
 * @param {string} jobId
 * @param {Record<string, any>} dto
 * @param {{id: string, role: string, email: string}} actor
 */
export const updateJob = async (jobId, dto, actor) => {
  const job = await jobRepository.findById(jobId, { lean: false });
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  const employer = await employerRepository.findByOwner(actor.id, { lean: false });
  assertCanPostJobs(employer);

  if (String(job.employer) !== String(employer._id)) {
    throw new ForbiddenError(ERROR_CODES.NOT_RESOURCE_OWNER, 'This job belongs to another company.');
  }

  const changedMaterialFields = JOB_MATERIAL_FIELDS.filter(
    (field) =>
      dto[field] !== undefined &&
      JSON.stringify(dto[field]) !== JSON.stringify(job.get(field)),
  );

  const wasApproved = job.status === JOB_STATUS.APPROVED;
  const needsReReview = wasApproved && changedMaterialFields.length > 0;

  Object.assign(job, dto);

  if (needsReReview) {
    job.status = JOB_STATUS.PENDING;
    job.isPubliclyVisible = false;
    job.moderation.previousStatus = JOB_STATUS.APPROVED;
    job.moderation.submittedAt = new Date();
    job.moderation.revisionCount = (job.moderation.revisionCount ?? 0) + 1;
    job.moderation.reviewedAt = null;
    job.moderation.reviewedBy = null;
  }

  await job.save();

  if (needsReReview) {
    logger.info('Approved job returned to review after a material edit', {
      jobId,
      changedMaterialFields,
    });
    eventBus.emit(EVENTS.JOB_SUBMITTED, {
      jobId: String(job._id),
      employerId: String(employer._id),
      title: job.title,
      isRevision: true,
    });
  }

  return { job, requiresReReview: needsReReview, changedMaterialFields };
};

/**
 * Submits a draft (or a rejected job) for review.
 * @param {string} jobId
 * @param {{id: string, role: string, email: string}} actor
 */
export const submitForReview = async (jobId, actor) => {
  const job = await jobRepository.findById(jobId, { lean: false });
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  const employer = await employerRepository.findByOwner(actor.id, { lean: false });

  // ★ The write-side gate. An unverified company can draft all it likes and publish nothing.
  assertCanPostJobs(employer);

  if (String(job.employer) !== String(employer._id)) {
    throw new ForbiddenError(ERROR_CODES.NOT_RESOURCE_OWNER, 'This job belongs to another company.');
  }

  assertTransition(job.status, JOB_STATUS.PENDING);

  if (!job.deadline || job.deadline.getTime() <= Date.now()) {
    throw new BadRequestError(ERROR_CODES.BAD_REQUEST, 'Set a future application deadline first.', [
      { field: 'deadline', message: 'Must be in the future' },
    ]);
  }

  job.status = JOB_STATUS.PENDING;
  job.isPubliclyVisible = false;
  job.moderation.submittedAt = new Date();
  job.moderation.rejectionReason = null;
  job.moderation.rejectionCategory = null;
  await job.save();

  eventBus.emit(EVENTS.JOB_SUBMITTED, {
    jobId: String(job._id),
    employerId: String(employer._id),
    title: job.title,
  });

  logger.info('Job submitted for review', { jobId });
  return job;
};

/**
 * ★ Approves a job — the moment it becomes public.
 *
 * Visibility is recomputed from the employer's live state rather than assumed. An admin
 * could be approving a job whose employer was suspended thirty seconds ago; in that case
 * the job is APPROVED but stays hidden, which is exactly right.
 *
 * @param {string} jobId
 * @param {{note?: string}} decision
 * @param {{id: string, role: string, email: string}} actor
 * @param {{ip?: string, userAgent?: string, requestId?: string}} [ctx]
 */
export const approveJob = async (jobId, decision, actor, ctx = {}) => {
  const job = await jobRepository.findById(jobId, { lean: false });
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  assertTransition(job.status, JOB_STATUS.APPROVED);

  const employer = await employerRepository.findById(String(job.employer), { lean: false });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }

  const before = { status: job.status, isPubliclyVisible: job.isPubliclyVisible };

  await withTransaction(
    async (session) => {
      job.status = JOB_STATUS.APPROVED;
      job.moderation.reviewedAt = new Date();
      job.moderation.reviewedBy = actor.id;
      job.moderation.rejectionReason = null;
      job.moderation.rejectionCategory = null;
      job.publishedAt = job.publishedAt ?? new Date();
      job.companySnapshot = buildSnapshot(employer, employer.verificationStatus === 'VERIFIED');

      // ★ Derived, never assumed.
      job.isPubliclyVisible = computeVisibility(job, employer);

      await job.save({ session });
      await employerRepository.bumpStats(
        String(employer._id),
        { 'stats.activeJobs': job.isPubliclyVisible ? 1 : 0 },
        { session },
      );
    },
    { name: 'approveJob' },
  );

  const owner = await userRepository.findById(String(employer.owner), {
    select: 'email firstName',
  });

  await auditService.record({
    actor,
    action: AUDIT_ACTION.JOB_APPROVED,
    entityType: AUDIT_ENTITY.JOB,
    entityId: jobId,
    entityLabel: job.title,
    before,
    after: { status: JOB_STATUS.APPROVED, isPubliclyVisible: job.isPubliclyVisible },
    reason: decision.note ?? null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  eventBus.emit(EVENTS.JOB_APPROVED, {
    jobId,
    employerId: String(employer._id),
    jobTitle: job.title,
    jobSlug: job.slug,
    ownerUserId: String(employer.owner),
    ownerEmail: owner?.email,
    ownerFirstName: owner?.firstName,
    isPubliclyVisible: job.isPubliclyVisible,
  });

  if (!job.isPubliclyVisible) {
    // Worth surfacing: the admin approved something that did not go live, and they should
    // understand why without having to reason about the invariant themselves.
    logger.warn('Job approved but not published — employer is not currently eligible', {
      jobId,
      employerVerification: employer.verificationStatus,
      employerStatus: employer.status,
    });
  }

  return job;
};

/**
 * @param {string} jobId
 * @param {{reason: string, category: string}} decision
 * @param {{id: string, role: string, email: string}} actor
 * @param {{ip?: string, userAgent?: string, requestId?: string}} [ctx]
 */
export const rejectJob = async (jobId, decision, actor, ctx = {}) => {
  if (!decision.reason?.trim()) {
    throw new BadRequestError(ERROR_CODES.MISSING_FIELD, MESSAGES.ADMIN.REASON_REQUIRED, [
      { field: 'reason', message: 'Explain what the employer needs to change' },
    ]);
  }

  const job = await jobRepository.findById(jobId, { lean: false });
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  assertTransition(job.status, JOB_STATUS.REJECTED);

  const before = { status: job.status, isPubliclyVisible: job.isPubliclyVisible };

  job.status = JOB_STATUS.REJECTED;
  job.isPubliclyVisible = false;
  job.moderation.reviewedAt = new Date();
  job.moderation.reviewedBy = actor.id;
  job.moderation.rejectionReason = decision.reason.trim();
  job.moderation.rejectionCategory = decision.category ?? 'OTHER';
  await job.save();

  const employer = await employerRepository.findById(String(job.employer), {
    select: 'owner companyName',
  });
  const owner = employer
    ? await userRepository.findById(String(employer.owner), { select: 'email firstName' })
    : null;

  await auditService.record({
    actor,
    action: AUDIT_ACTION.JOB_REJECTED,
    entityType: AUDIT_ENTITY.JOB,
    entityId: jobId,
    entityLabel: job.title,
    before,
    after: { status: JOB_STATUS.REJECTED },
    reason: decision.reason,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  eventBus.emit(EVENTS.JOB_REJECTED, {
    jobId,
    jobTitle: job.title,
    employerId: String(job.employer),
    ownerEmail: owner?.email,
    ownerFirstName: owner?.firstName,
    reason: decision.reason,
    category: decision.category,
  });

  return job;
};

/**
 * @param {string} jobId
 * @param {{id: string, role: string, email: string}} actor
 */
export const archiveJob = async (jobId, actor) => {
  const job = await jobRepository.findById(jobId, { lean: false });
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  const employer = await employerRepository.findByOwner(actor.id, { select: '_id' });
  if (actor.role !== 'ADMIN' && String(job.employer) !== String(employer?._id)) {
    throw new ForbiddenError(ERROR_CODES.NOT_RESOURCE_OWNER, 'This job belongs to another company.');
  }

  assertTransition(job.status, JOB_STATUS.ARCHIVED);

  job.status = JOB_STATUS.ARCHIVED;
  job.isPubliclyVisible = false;
  job.archivedAt = new Date();
  await job.save();

  eventBus.emit(EVENTS.JOB_ARCHIVED, { jobId, employerId: String(job.employer) });
  return job;
};

/**
 * Duplicates a job as a fresh draft.
 * Copies content only — never status, moderation history, stats or visibility.
 * @param {string} jobId
 * @param {{id: string, role: string, email: string}} actor
 */
export const cloneJob = async (jobId, actor) => {
  const source = await jobRepository.findById(jobId);
  if (!source) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  const employer = await employerRepository.findByOwner(actor.id, { lean: false });
  assertCanPostJobs(employer);

  if (String(source.employer) !== String(employer._id)) {
    throw new ForbiddenError(ERROR_CODES.NOT_RESOURCE_OWNER, 'This job belongs to another company.');
  }

  const {
    _id, slug, status, moderation, stats, isPubliclyVisible, publishedAt, archivedAt,
    createdAt, updatedAt, searchText, deletedAt, deletedBy, ...content
  } = source;

  return jobRepository.create({
    ...content,
    title: `${source.title} (copy)`,
    employer: employer._id,
    postedBy: actor.id,
    companySnapshot: buildSnapshot(employer, true),
    status: JOB_STATUS.DRAFT,
    isPubliclyVisible: false,
    publishedAt: null,
    moderation: { revisionCount: 0 },
    stats: {},
  });
};

/**
 * ★ Recomputes visibility for every job — the nightly reconciliation.
 *
 * A non-zero `corrected` count is a defect signal, not routine maintenance: it means some
 * write path failed to keep the flag in step with the truth. It is logged at warn level
 * precisely so it is noticed.
 *
 * @param {{dryRun?: boolean}} [opts]
 */
export const reconcileVisibility = async ({ dryRun = false } = {}) => {
  const rows = await jobRepository.findAllWithEmployerState();

  /** @type {{_id: any, shouldBe: boolean, was: boolean}[]} */
  const drift = [];

  for (const row of rows) {
    const shouldBe = computeVisibility(
      { status: row.status, deadline: row.deadline, deletedAt: null },
      row.employerVerification
        ? {
            verificationStatus: row.employerVerification,
            status: row.employerStatus,
            deletedAt: row.employerDeleted,
          }
        : null,
    );

    if (Boolean(row.isPubliclyVisible) !== shouldBe) {
      drift.push({ _id: row._id, shouldBe, was: Boolean(row.isPubliclyVisible) });
    }
  }

  if (drift.length && !dryRun) {
    await jobRepository.bulkWrite(
      drift.map((d) => ({
        updateOne: { filter: { _id: d._id }, update: { $set: { isPubliclyVisible: d.shouldBe } } },
      })),
    );
  }

  if (drift.length) {
    // A job that was wrongly public is the severe direction — that is a leaked listing.
    const leaked = drift.filter((d) => d.was && !d.shouldBe).length;
    logger.warn('Visibility drift detected and corrected', {
      total: drift.length,
      wronglyVisible: leaked,
      wronglyHidden: drift.length - leaked,
      dryRun,
    });
  } else {
    logger.info('Visibility reconciliation clean', { scanned: rows.length });
  }

  return { scanned: rows.length, corrected: drift.length, drift };
};

/**
 * Archives jobs whose deadline has passed — the hourly cron.
 */
export const expireOverdueJobs = async () => {
  const expired = await jobRepository.findExpiredLive();
  if (!expired.length) return { expired: 0 };

  await jobRepository.bulkWrite(
    expired.map((job) => ({
      updateOne: {
        filter: { _id: job._id },
        update: {
          $set: {
            status: JOB_STATUS.ARCHIVED,
            isPubliclyVisible: false,
            archivedAt: new Date(),
          },
        },
      },
    })),
  );

  for (const job of expired) {
    eventBus.emit(EVENTS.JOB_EXPIRED, {
      jobId: String(job._id),
      jobTitle: job.title,
      employerId: String(job.employer),
    });
  }

  logger.info('Expired overdue jobs', { count: expired.length });
  return { expired: expired.length };
};

export default {
  computeVisibility,
  assertCanPostJobs,
  createJob,
  updateJob,
  submitForReview,
  approveJob,
  rejectJob,
  archiveJob,
  cloneJob,
  reconcileVisibility,
  expireOverdueJobs,
};
