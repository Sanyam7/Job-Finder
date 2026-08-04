import { AUDIT_ACTION, AUDIT_ENTITY, ERROR_CODES, JOB_STATUS } from '@verihire/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { MESSAGES, format } from '../constants/messages.js';
import { NotFoundError } from '../errors/index.js';
import { employerRepository } from '../repositories/employer.repository.js';
import { jobRepository } from '../repositories/job.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import * as verificationService from '../services/verification.service.js';
import * as jobService from '../services/job.service.js';
import * as auditService from '../services/audit.service.js';
import * as analyticsService from '../services/analytics.service.js';
import * as uploadService from '../services/upload.service.js';
import {
  toAdminEmployer,
  toQueueRow,
} from '../dtos/response/employer.response.dto.js';
import { toAdminJob, toJobQueueRow } from '../dtos/response/job.response.dto.js';

/** @param {import('express').Request} req */
const actorOf = (req) => ({ id: req.user.id, role: req.user.role, email: req.user.email });
/** @param {import('express').Request} req */
const ctxOf = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? undefined,
  requestId: req.id,
});

/* ============================ EMPLOYER QUEUE — GATE 1 ==================== */

export const listEmployers = asyncHandler(async (req, res) => {
  const result = await employerRepository.findQueue(req.validated ?? {});
  return ApiResponse.paginated(
    res,
    { ...result, items: result.items.map(toQueueRow) },
    MESSAGES.ADMIN.QUEUE_FETCHED,
  );
});

/**
 * The review screen.
 *
 * Returns the company, its owner, and the automated signals side by side — so an admin can
 * see "contact address is a free Gmail account" without having to notice it themselves.
 */
export const getEmployerDetail = asyncHandler(async (req, res) => {
  const employer = await employerRepository.findById(req.validated.id, { lean: false });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }

  const [owner, jobCounts] = await Promise.all([
    userRepository.findById(String(employer.owner), {
      select: 'firstName lastName email createdAt status',
    }),
    jobRepository.model.aggregate([
      { $match: { employer: employer._id, deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  return ApiResponse.ok(
    res,
    {
      company: toAdminEmployer(employer, {
        owner,
        signals: verificationService.computeSignals(employer),
      }),
      jobCounts: Object.fromEntries(jobCounts.map((row) => [row._id, row.count])),
    },
    MESSAGES.EMPLOYER.PROFILE_FETCHED,
  );
});

/**
 * Issues a short-lived signed URL for a KYC document.
 *
 * The raw Cloudinary URL is never sent to the browser, and every view is audit-logged —
 * these are identity documents, and who looked at them is part of the record.
 */
export const viewEmployerDocument = asyncHandler(async (req, res) => {
  const employer = await employerRepository.findById(req.validated.id, { lean: false });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }

  const doc = employer.documents.id(req.validated.docId);
  if (!doc) throw new NotFoundError(ERROR_CODES.NOT_FOUND, 'That document does not exist.');

  const url = uploadService.getSignedUrl(doc.publicId, { expiresInSeconds: 300 });

  await auditService.record({
    actor: actorOf(req),
    action: AUDIT_ACTION.DOCUMENT_VIEWED,
    entityType: AUDIT_ENTITY.EMPLOYER_PROFILE,
    entityId: String(employer._id),
    entityLabel: `${employer.companyName} · ${doc.type}`,
    ...ctxOf(req),
  });

  return ApiResponse.ok(
    res,
    { url, expiresInSeconds: 300, type: doc.type, originalName: doc.originalName },
    'Document link generated',
  );
});

/** ★ Approve — flips every eligible job of theirs public in the same transaction. */
export const verifyEmployer = asyncHandler(async (req, res) => {
  const { employer, jobsMadeVisible } = await verificationService.approveEmployer(
    req.validated.id,
    { checklist: req.body.checklist, note: req.body.note },
    actorOf(req),
    ctxOf(req),
  );

  return ApiResponse.ok(
    res,
    { company: toAdminEmployer(employer), jobsMadeVisible },
    format(MESSAGES.ADMIN.EMPLOYER_VERIFIED, { company: employer.companyName }),
  );
});

export const rejectEmployer = asyncHandler(async (req, res) => {
  const { employer, jobsHidden } = await verificationService.rejectEmployer(
    req.validated.id,
    { reason: req.validated.reason, category: req.validated.category },
    actorOf(req),
    ctxOf(req),
  );

  return ApiResponse.ok(
    res,
    { company: toAdminEmployer(employer), jobsHidden },
    format(MESSAGES.ADMIN.EMPLOYER_REJECTED, { company: employer.companyName }),
  );
});

/** ★ Suspend — the retroactive case: live listings disappear in this request. */
export const suspendEmployer = asyncHandler(async (req, res) => {
  const { employer, jobsHidden } = await verificationService.suspendEmployer(
    req.validated.id,
    { reason: req.validated.reason },
    actorOf(req),
    ctxOf(req),
  );

  return ApiResponse.ok(
    res,
    { company: toAdminEmployer(employer), jobsHidden },
    format(MESSAGES.ADMIN.EMPLOYER_SUSPENDED, {
      company: employer.companyName,
      count: jobsHidden,
    }),
  );
});

export const restoreEmployer = asyncHandler(async (req, res) => {
  const { employer, jobsRestored } = await verificationService.restoreEmployer(
    req.validated.id,
    actorOf(req),
    ctxOf(req),
  );

  return ApiResponse.ok(
    res,
    { company: toAdminEmployer(employer), jobsRestored },
    format(MESSAGES.ADMIN.EMPLOYER_RESTORED, { company: employer.companyName }),
  );
});

/* ============================== JOB QUEUE — GATE 2 ======================= */

export const listJobs = asyncHandler(async (req, res) => {
  const criteria = req.validated ?? {};
  const result = criteria.status
    ? await jobRepository.paginate(
        { status: criteria.status, deletedAt: null },
        {
          page: criteria.page,
          limit: criteria.limit,
          sort: criteria.sort === 'newest' ? '-moderation.submittedAt' : 'moderation.submittedAt',
        },
      )
    : await jobRepository.findPendingQueue(criteria);

  return ApiResponse.paginated(
    res,
    { ...result, items: result.items.map(toJobQueueRow) },
    MESSAGES.ADMIN.QUEUE_FETCHED,
  );
});

/**
 * Job review screen.
 *
 * Carries the employer's standing alongside the listing: approving a job from a company
 * that was suspended an hour ago is a decision an admin should make knowingly.
 */
export const getJobDetail = asyncHandler(async (req, res) => {
  const job = await jobRepository.findById(req.validated.id, { lean: false });
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  const employer = await employerRepository.findById(String(job.employer), {
    select: 'companyName slug verificationStatus status website industry stats verification.attemptCount',
  });

  return ApiResponse.ok(
    res,
    {
      job: toAdminJob(job),
      employerContext: employer
        ? {
            id: String(employer._id),
            companyName: employer.companyName,
            slug: employer.slug,
            verificationStatus: employer.verificationStatus,
            status: employer.status,
            website: employer.website,
            industry: employer.industry,
            totalJobsPosted: employer.stats?.totalJobsPosted ?? 0,
            // If false, approving will NOT publish — the UI warns before the click.
            isEligibleToPublish:
              employer.verificationStatus === 'VERIFIED' && employer.status === 'ACTIVE',
          }
        : null,
      revisionCount: job.moderation?.revisionCount ?? 0,
    },
    MESSAGES.JOB.FETCHED,
  );
});

export const approveJob = asyncHandler(async (req, res) => {
  const job = await jobService.approveJob(
    req.validated.id,
    { note: req.body.note },
    actorOf(req),
    ctxOf(req),
  );

  return ApiResponse.ok(
    res,
    { job: toAdminJob(job), isPubliclyVisible: job.isPubliclyVisible },
    job.isPubliclyVisible
      ? MESSAGES.ADMIN.JOB_APPROVED
      : 'Job approved, but it is not published because the employer is not currently eligible.',
  );
});

export const rejectJob = asyncHandler(async (req, res) => {
  const job = await jobService.rejectJob(
    req.validated.id,
    { reason: req.validated.reason, category: req.validated.category },
    actorOf(req),
    ctxOf(req),
  );
  return ApiResponse.ok(res, { job: toAdminJob(job) }, MESSAGES.ADMIN.JOB_REJECTED);
});

/**
 * Bulk approve.
 *
 * Sequential, not `Promise.all`: each approval is its own transaction, and one bad job in
 * the batch must not abort the rest. The response reports per-id outcomes so the UI can
 * show exactly which ones failed and why.
 */
export const bulkApproveJobs = asyncHandler(async (req, res) => {
  const { ids, note } = req.validated;
  const succeeded = [];
  const failed = [];

  for (const id of ids) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const job = await jobService.approveJob(id, { note }, actorOf(req), ctxOf(req));
      succeeded.push({ id, isPubliclyVisible: job.isPubliclyVisible });
    } catch (error) {
      failed.push({ id, reason: /** @type {any} */ (error).message });
    }
  }

  return ApiResponse.ok(
    res,
    { succeeded, failed, total: ids.length },
    format(MESSAGES.ADMIN.BULK_APPROVED, { count: succeeded.length }),
  );
});

/* ================================ DASHBOARD ============================== */

/**
 * All KPI counters in one response.
 *
 * Six separate endpoints would mean six round trips before an admin sees anything; the
 * dashboard's job is to surface the queues fast.
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const [usersByRole, employersByStatus, jobsByStatus, queueHealth, activity, liveJobs] =
    await Promise.all([
      userRepository.countByRoleAndStatus(),
      employerRepository.countByVerificationStatus(),
      jobRepository.countByStatus(),
      employerRepository.getQueueHealth(),
      auditService.recentActivity(15),
      jobRepository.countPubliclyVisible(),
    ]);

  const employerCounts = Object.fromEntries(employersByStatus.map((r) => [r._id, r.count]));
  const jobCounts = Object.fromEntries(jobsByStatus.map((r) => [r._id, r.count]));

  const sumRole = (role) =>
    Object.values(usersByRole[role] ?? {}).reduce((total, n) => total + n, 0);

  return ApiResponse.ok(
    res,
    {
      users: {
        total: sumRole('CANDIDATE') + sumRole('EMPLOYER') + sumRole('ADMIN'),
        candidates: sumRole('CANDIDATE'),
        employers: sumRole('EMPLOYER'),
        admins: sumRole('ADMIN'),
        byRoleAndStatus: usersByRole,
      },
      employers: {
        verified: employerCounts.VERIFIED ?? 0,
        pending: employerCounts.PENDING ?? 0,
        rejected: employerCounts.REJECTED ?? 0,
        unsubmitted: employerCounts.UNSUBMITTED ?? 0,
      },
      jobs: {
        live: liveJobs,
        approved: jobCounts[JOB_STATUS.APPROVED] ?? 0,
        pending: jobCounts[JOB_STATUS.PENDING] ?? 0,
        rejected: jobCounts[JOB_STATUS.REJECTED] ?? 0,
        draft: jobCounts[JOB_STATUS.DRAFT] ?? 0,
        archived: jobCounts[JOB_STATUS.ARCHIVED] ?? 0,
      },
      // Tells the team whether manual verification has become the bottleneck.
      queueHealth,
      recentActivity: activity,
    },
    MESSAGES.ADMIN.DASHBOARD_FETCHED,
  );
});

export const getAuditLogs = asyncHandler(async (req, res) => {
  const result = await auditService.query(req.validated ?? {});
  return ApiResponse.paginated(res, result, MESSAGES.ADMIN.AUDIT_FETCHED);
});

/* ================================== USERS =============================== */

export const listUsers = asyncHandler(async (req, res) => {
  const result = await userRepository.searchUsers(req.validated ?? {});
  return ApiResponse.paginated(res, result, MESSAGES.USER.FETCHED);
});

export const suspendUser = asyncHandler(async (req, res) => {
  // An admin locking themselves out has no in-app recovery path.
  if (req.validated.id === req.user.id) {
    return ApiResponse.send(res, {
      statusCode: 400,
      message: MESSAGES.ADMIN.CANNOT_MODIFY_SELF,
      data: null,
    });
  }

  const user = await userRepository.suspend(req.validated.id, {
    reason: req.validated.reason,
    by: req.user.id,
  });
  if (!user) throw new NotFoundError(ERROR_CODES.USER_NOT_FOUND, MESSAGES.USER.NOT_FOUND);

  await auditService.record({
    actor: actorOf(req),
    action: AUDIT_ACTION.USER_SUSPENDED,
    entityType: AUDIT_ENTITY.USER,
    entityId: req.validated.id,
    entityLabel: user.email,
    reason: req.validated.reason,
    ...ctxOf(req),
  });

  return ApiResponse.ok(res, null, MESSAGES.USER.SUSPENDED);
});

export const restoreUser = asyncHandler(async (req, res) => {
  const user = await userRepository.restore(req.validated.id);
  if (!user) throw new NotFoundError(ERROR_CODES.USER_NOT_FOUND, MESSAGES.USER.NOT_FOUND);

  await auditService.record({
    actor: actorOf(req),
    action: AUDIT_ACTION.USER_RESTORED,
    entityType: AUDIT_ENTITY.USER,
    entityId: req.validated.id,
    entityLabel: user.email,
    ...ctxOf(req),
  });

  return ApiResponse.ok(res, null, MESSAGES.USER.RESTORED);
});

/* ------------------------------------------------------------- analytics */

/**
 * ★ The metrics that say whether manual verification is working.
 *
 * Every one of these is chosen to be actionable. "How many signups this week" looks busier
 * on a dashboard and tells an operator nothing; "the oldest company has waited 96 hours"
 * is a staffing decision.
 */
export const getOverview = asyncHandler(async (req, res) => {
  const range = analyticsService.parseRange(req.validated?.range);
  const data = await analyticsService.overview(range);
  return ApiResponse.ok(res, data, MESSAGES.ADMIN.ANALYTICS_FETCHED);
});

export const getUserAnalytics = asyncHandler(async (req, res) => {
  const range = analyticsService.parseRange(req.validated?.range);
  const series = await analyticsService.userGrowth(range);
  return ApiResponse.ok(res, { series, range }, MESSAGES.ADMIN.ANALYTICS_FETCHED);
});

export const getJobAnalytics = asyncHandler(async (req, res) => {
  const range = analyticsService.parseRange(req.validated?.range);
  const data = await analyticsService.jobBreakdown(range);
  return ApiResponse.ok(res, { ...data, range }, MESSAGES.ADMIN.ANALYTICS_FETCHED);
});

export const getApplicationAnalytics = asyncHandler(async (req, res) => {
  const range = analyticsService.parseRange(req.validated?.range);
  const data = await analyticsService.applicationAnalytics(range);
  return ApiResponse.ok(res, { ...data, range }, MESSAGES.ADMIN.ANALYTICS_FETCHED);
});

/** Gate-1 and gate-2 throughput side by side — the health of the product's core promise. */
export const getModerationAnalytics = asyncHandler(async (req, res) => {
  const range = analyticsService.parseRange(req.validated?.range);

  const [verification, moderation, oldestPending] = await Promise.all([
    analyticsService.verificationHealth(range),
    analyticsService.moderationHealth(range),
    analyticsService.oldestPending(10),
  ]);

  return ApiResponse.ok(
    res,
    { verification, moderation, oldestPending, range },
    MESSAGES.ADMIN.ANALYTICS_FETCHED,
  );
});

/**
 * ★ The invariant check, exposed as an endpoint.
 *
 * Runs the same reconciliation the nightly cron does, in dry-run mode. A non-zero `corrected`
 * count means some write path let the visibility flag drift from the truth — an admin should
 * be able to ask that question at any time, not wait for the small hours.
 */
export const checkVisibilityDrift = asyncHandler(async (_req, res) => {
  const result = await jobService.reconcileVisibility({ dryRun: true });

  return ApiResponse.ok(
    res,
    {
      scanned: result.scanned,
      drifted: result.corrected,
      isHealthy: result.corrected === 0,
      // A job wrongly visible is the severe direction — that is a leaked listing.
      wronglyVisible: result.drift.filter((d) => d.was && !d.shouldBe).length,
      wronglyHidden: result.drift.filter((d) => !d.was && d.shouldBe).length,
    },
    MESSAGES.ADMIN.ANALYTICS_FETCHED,
  );
});
