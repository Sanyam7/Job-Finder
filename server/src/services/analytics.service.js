import mongoose from 'mongoose';
import { ACCOUNT_STATUS, JOB_STATUS, VERIFICATION_STATUS } from '@verihire/shared';
import { User } from '../models/user.model.js';
import { EmployerProfile } from '../models/employerProfile.model.js';
import { Job } from '../models/job.model.js';
import { Application } from '../models/application.model.js';
import { applicationRepository } from '../repositories/application.repository.js';
import { employerRepository } from '../repositories/employer.repository.js';
import { jobRepository } from '../repositories/job.repository.js';

/**
 * Admin analytics.
 *
 * ★ The metrics here are chosen to answer one question: **is manual verification working, or
 * has it become the bottleneck?** That is the bet the whole product rests on. A dashboard of
 * signup counts would look busier and tell an operator nothing they can act on, whereas
 * "median review time is 31 hours and the oldest company has waited 4 days" is a staffing
 * decision.
 */

/** @param {string} range e.g. '7d', '30d', '90d' */
export const parseRange = (range = '30d') => {
  const days = Number(String(range).replace(/\D/g, '')) || 30;
  const clamped = Math.min(Math.max(days, 1), 365);
  return {
    days: clamped,
    from: new Date(Date.now() - clamped * 86_400_000),
    to: new Date(),
  };
};

/**
 * Buckets a collection by day over a range.
 *
 * ★ Zero-filled. A `$group` returns no row for a day with no activity, and a chart drawn
 * straight from that silently closes the gap — three quiet days become a straight line
 * between two busy ones, which reads as steady traffic rather than an outage.
 *
 * @param {import('mongoose').Model<any>} model
 * @param {{from: Date, to: Date, dateField?: string, match?: Record<string, any>}} opts
 */
export const dailySeries = async (model, { from, to, dateField = 'createdAt', match = {} }) => {
  const rows = await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` } },
        count: { $sum: 1 },
      },
    },
  ]);

  const byDate = new Map(rows.map((r) => [r._id, r.count]));
  const series = [];

  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, count: byDate.get(key) ?? 0 });
  }

  return series;
};

/**
 * ★ Verification throughput — the health of the gate.
 *
 * Reports the **median** review time as well as the mean. One company that sat in the queue
 * over a holiday weekend drags a mean into uselessness; the median is what a company
 * submitting today should actually expect.
 *
 * @param {{from: Date, to: Date}} range
 */
export const verificationHealth = async ({ from, to }) => {
  const [decided, queue] = await Promise.all([
    EmployerProfile.aggregate([
      {
        $match: {
          deletedAt: null,
          'verification.reviewedAt': { $gte: from, $lte: to },
          'verification.submittedAt': { $ne: null },
        },
      },
      {
        $project: {
          verificationStatus: 1,
          reviewMs: { $subtract: ['$verification.reviewedAt', '$verification.submittedAt'] },
        },
      },
      {
        $group: {
          _id: '$verificationStatus',
          count: { $sum: 1 },
          avgMs: { $avg: '$reviewMs' },
          // `$percentile` needs Mongo 7; sorting a bounded set and picking the middle works
          // everywhere and this collection is small by construction.
          durations: { $push: '$reviewMs' },
        },
      },
    ]),
    employerRepository.getQueueHealth(),
  ]);

  let approved = 0;
  let rejected = 0;
  /** @type {number[]} */
  const allDurations = [];

  for (const row of decided) {
    if (row._id === VERIFICATION_STATUS.VERIFIED) approved = row.count;
    if (row._id === VERIFICATION_STATUS.REJECTED) rejected = row.count;
    allDurations.push(...row.durations);
  }

  const total = approved + rejected;

  return {
    decided: total,
    approved,
    rejected,
    approvalRate: total ? Math.round((approved / total) * 1000) / 10 : 0,
    avgReviewHours: allDurations.length ? Math.round(mean(allDurations) / 3_600_000) : 0,
    medianReviewHours: allDurations.length ? Math.round(median(allDurations) / 3_600_000) : 0,
    /** What a company submitting right now is actually waiting behind. */
    pendingNow: queue.pending,
    oldestPendingSubmittedAt: queue.oldestSubmittedAt,
    oldestPendingWaitHours: queue.oldestSubmittedAt
      ? Math.floor((Date.now() - new Date(queue.oldestSubmittedAt).getTime()) / 3_600_000)
      : 0,
  };
};

/** @param {number[]} values */
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/** @param {number[]} values */
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Job moderation throughput — the gate-2 equivalent.
 * @param {{from: Date, to: Date}} range
 */
export const moderationHealth = async ({ from, to }) => {
  const [decided, pending] = await Promise.all([
    Job.aggregate([
      {
        $match: {
          deletedAt: null,
          'moderation.reviewedAt': { $gte: from, $lte: to },
          'moderation.submittedAt': { $ne: null },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgMs: {
            $avg: { $subtract: ['$moderation.reviewedAt', '$moderation.submittedAt'] },
          },
          // A revision is a job approved once and then materially edited — the fraud vector
          // the material-edit rule closes, so it is tracked separately.
          revisions: { $sum: { $cond: [{ $gt: ['$moderation.revisionCount', 0] }, 1, 0] } },
        },
      },
    ]),
    Job.countDocuments({ status: JOB_STATUS.PENDING, deletedAt: null }),
  ]);

  const byStatus = Object.fromEntries(decided.map((r) => [r._id, r]));
  const approved = byStatus[JOB_STATUS.APPROVED]?.count ?? 0;
  const rejected = byStatus[JOB_STATUS.REJECTED]?.count ?? 0;
  const total = approved + rejected;

  return {
    decided: total,
    approved,
    rejected,
    approvalRate: total ? Math.round((approved / total) * 1000) / 10 : 0,
    avgReviewHours: Math.round((byStatus[JOB_STATUS.APPROVED]?.avgMs ?? 0) / 3_600_000),
    revisionsReviewed:
      (byStatus[JOB_STATUS.APPROVED]?.revisions ?? 0) + (byStatus[JOB_STATUS.REJECTED]?.revisions ?? 0),
    pendingNow: pending,
  };
};

/**
 * The headline numbers.
 * @param {{from: Date, to: Date, days: number}} range
 */
export const overview = async (range) => {
  const [
    users,
    employers,
    jobs,
    applications,
    liveJobs,
    verifiedCompanies,
    verification,
    moderation,
  ] = await Promise.all([
    User.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    employerRepository.countByVerificationStatus(),
    jobRepository.countByStatus(),
    applicationRepository.countByStatus(),
    jobRepository.countPubliclyVisible(),
    employerRepository.countPublic(),
    verificationHealth(range),
    moderationHealth(range),
  ]);

  return {
    range: { days: range.days, from: range.from, to: range.to },
    users: {
      total: users.reduce((sum, r) => sum + r.count, 0),
      byRole: Object.fromEntries(users.map((r) => [r._id, r.count])),
    },
    employers: {
      total: employers.reduce((sum, r) => sum + r.count, 0),
      byStatus: Object.fromEntries(employers.map((r) => [r._id, r.count])),
      verified: verifiedCompanies,
    },
    jobs: {
      total: jobs.reduce((sum, r) => sum + r.count, 0),
      byStatus: Object.fromEntries(jobs.map((r) => [r._id, r.count])),
      live: liveJobs,
    },
    applications,
    verification,
    moderation,
    /**
     * ★ The number that says whether the promise is being kept.
     *
     * Every live listing belongs to a company a human approved and passed a human review.
     * If this ever diverges from `jobs.live`, the invariant has been broken — which is
     * exactly what the nightly reconciliation exists to catch.
     */
    trust: {
      liveJobsFromVerifiedCompanies: liveJobs,
      companiesRejected: employers.find((r) => r._id === VERIFICATION_STATUS.REJECTED)?.count ?? 0,
      jobsRejected: jobs.find((r) => r._id === JOB_STATUS.REJECTED)?.count ?? 0,
    },
  };
};

/**
 * Signups over time, split by role.
 * @param {{from: Date, to: Date}} range
 */
export const userGrowth = async ({ from, to }) => {
  const rows = await User.aggregate([
    { $match: { deletedAt: null, createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          role: '$role',
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const byDate = new Map();
  for (const row of rows) {
    const entry = byDate.get(row._id.date) ?? {};
    entry[row._id.role] = row.count;
    byDate.set(row._id.date, entry);
  }

  const series = [];
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const entry = byDate.get(key) ?? {};
    series.push({
      date: key,
      CANDIDATE: entry.CANDIDATE ?? 0,
      EMPLOYER: entry.EMPLOYER ?? 0,
      total: (entry.CANDIDATE ?? 0) + (entry.EMPLOYER ?? 0),
    });
  }

  return series;
};

/**
 * Job distribution — where the demand actually is.
 * @param {{from: Date, to: Date}} range
 */
export const jobBreakdown = async ({ from, to }) => {
  const [result] = await Job.aggregate([
    { $match: { deletedAt: null, createdAt: { $gte: from, $lte: to } } },
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byWorkMode: [{ $group: { _id: '$workMode', count: { $sum: 1 } } }],
        byEmploymentType: [{ $group: { _id: '$employmentType', count: { $sum: 1 } } }],
        byIndustry: [
          { $group: { _id: '$industry', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        topSkills: [
          { $unwind: '$skillsRequired' },
          { $group: { _id: '$skillsRequired.name', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ],
        rejectionReasons: [
          { $match: { status: JOB_STATUS.REJECTED } },
          { $group: { _id: '$moderation.rejectionCategory', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
      },
    },
  ]);

  const toPairs = (rows = []) =>
    rows.map((r) => ({ value: r._id ?? 'UNKNOWN', count: r.count })).filter((r) => r.value);

  return {
    byStatus: toPairs(result?.byStatus),
    byWorkMode: toPairs(result?.byWorkMode),
    byEmploymentType: toPairs(result?.byEmploymentType),
    byIndustry: toPairs(result?.byIndustry),
    topSkills: toPairs(result?.topSkills),
    // Why listings get refused, so posting guidance can be improved rather than just enforced.
    rejectionReasons: toPairs(result?.rejectionReasons),
  };
};

/**
 * The platform-wide hiring funnel plus application volume over time.
 * @param {{from: Date, to: Date}} range
 */
export const applicationAnalytics = async ({ from, to }) => {
  const [funnel, series, topEmployers] = await Promise.all([
    applicationRepository.getFunnel({ createdAt: { $gte: from, $lte: to } }),
    dailySeries(Application, { from, to }),
    Application.aggregate([
      { $match: { deletedAt: null, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$employer', applications: { $sum: 1 } } },
      { $sort: { applications: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'employerprofiles',
          localField: '_id',
          foreignField: '_id',
          as: 'employer',
          pipeline: [{ $project: { companyName: 1, slug: 1 } }],
        },
      },
      { $unwind: { path: '$employer', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          employerId: '$_id',
          companyName: '$employer.companyName',
          applications: 1,
        },
      },
    ]),
  ]);

  return { funnel, series, topEmployers };
};

/**
 * Companies waiting longest — the admin's actual work queue, ordered by who has waited most.
 * @param {number} limit
 */
export const oldestPending = async (limit = 10) => {
  const rows = await EmployerProfile.find({
    verificationStatus: VERIFICATION_STATUS.PENDING,
    status: ACCOUNT_STATUS.ACTIVE,
    deletedAt: null,
  })
    .sort('verification.submittedAt')
    .limit(limit)
    .select('companyName slug verification.submittedAt')
    .lean();

  return rows.map((r) => ({
    id: String(r._id),
    companyName: r.companyName,
    slug: r.slug,
    submittedAt: r.verification?.submittedAt ?? null,
    waitingHours: r.verification?.submittedAt
      ? Math.floor((Date.now() - new Date(r.verification.submittedAt).getTime()) / 3_600_000)
      : null,
  }));
};

/** Aggregations do not cast ids — see application.repository.js. */
export const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

export default {
  parseRange,
  overview,
  userGrowth,
  jobBreakdown,
  applicationAnalytics,
  verificationHealth,
  moderationHealth,
  oldestPending,
  dailySeries,
};
