import mongoose from 'mongoose';
import { APPLICATION_STATUS, APPLICATION_PIPELINE } from '@verihire/shared';
import { BaseRepository } from './base.repository.js';
import { Application } from '../models/application.model.js';

/** @param {string} value */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ID_FIELDS = ['job', 'employer', 'applicant', 'candidateProfile', '_id'];

/**
 * Casts id strings to ObjectIds for use in an aggregation `$match`.
 *
 * ★ `find()` runs every filter value through the schema, so `{job: "65f0…"}` works there.
 * An aggregation pipeline does not — Mongo compares the raw BSON types and a string never
 * equals an ObjectId. The failure is silent: no error, just an empty result, which reads as
 * "this job has no applicants" rather than "this query is wrong". Normalising at the
 * repository boundary means no caller has to remember the difference.
 *
 * @param {Record<string, any>} match
 * @returns {Record<string, any>}
 */
const castMatchIds = (match = {}) => {
  const out = { ...match };
  for (const field of ID_FIELDS) {
    const value = out[field];
    if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
      out[field] = new mongoose.Types.ObjectId(value);
    }
  }
  return out;
};

const SORT_MAP = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  experience: { 'candidateSnapshot.totalExperienceMonths': -1, createdAt: -1 },
  match: { 'candidateSnapshot.profileCompleteness': -1, createdAt: -1 },
  rating: { rating: -1, createdAt: -1 },
};

class ApplicationRepository extends BaseRepository {
  constructor() {
    super(Application);
  }

  /**
   * @param {string} jobId
   * @param {string} applicantId
   * @param {{session?: import('mongoose').ClientSession}} [opts]
   */
  findByJobAndApplicant(jobId, applicantId, opts = {}) {
    return this.findOne({ job: jobId, applicant: applicantId }, opts);
  }

  /**
   * @param {string} jobId
   * @param {string} applicantId
   */
  hasApplied(jobId, applicantId) {
    return this.exists({ job: jobId, applicant: applicantId, deletedAt: null });
  }

  /**
   * Which of these jobs has this candidate already applied to?
   *
   * One query for a whole page of job cards instead of twenty — the browse list needs an
   * "Applied" badge on every row and N+1 here would be felt immediately.
   *
   * @param {string} applicantId
   * @param {string[]} jobIds
   * @returns {Promise<Set<string>>}
   */
  async findAppliedJobIds(applicantId, jobIds) {
    if (!jobIds?.length) return new Set();
    const rows = await this.model
      .find({ applicant: applicantId, job: { $in: jobIds }, deletedAt: null })
      .select('job')
      .lean();
    return new Set(rows.map((r) => String(r.job)));
  }

  /**
   * The candidate's application tracker.
   * @param {string} applicantId
   * @param {{status?: string|string[], search?: string, page?: number, limit?: number,
   *          sort?: string}} criteria
   */
  findForCandidate(applicantId, criteria = {}) {
    const filter = { applicant: applicantId, deletedAt: null };

    if (criteria.status) {
      filter.status = Array.isArray(criteria.status)
        ? { $in: criteria.status }
        : criteria.status;
    }
    if (criteria.search) {
      filter.$or = [
        { 'jobSnapshot.title': new RegExp(escapeRegex(criteria.search), 'i') },
        { 'jobSnapshot.companyName': new RegExp(escapeRegex(criteria.search), 'i') },
      ];
    }

    return this.paginate(filter, {
      page: criteria.page,
      limit: criteria.limit,
      sort: SORT_MAP[criteria.sort ?? 'newest'] ?? SORT_MAP.newest,
    });
  }

  /**
   * The employer's inbox — one job or every job.
   * @param {string} employerId
   * @param {{job?: string, status?: string|string[], search?: string, minExperienceMonths?: number,
   *          minRating?: number, from?: Date, to?: Date, page?: number, limit?: number,
   *          sort?: string}} criteria
   */
  findForEmployer(employerId, criteria = {}) {
    const filter = { employer: employerId, deletedAt: null };

    if (criteria.job) filter.job = criteria.job;
    if (criteria.status) {
      filter.status = Array.isArray(criteria.status)
        ? { $in: criteria.status }
        : criteria.status;
    }
    if (criteria.minExperienceMonths != null) {
      filter['candidateSnapshot.totalExperienceMonths'] = { $gte: criteria.minExperienceMonths };
    }
    if (criteria.minRating != null) filter.rating = { $gte: criteria.minRating };
    if (criteria.from || criteria.to) {
      filter.createdAt = {};
      if (criteria.from) filter.createdAt.$gte = criteria.from;
      if (criteria.to) filter.createdAt.$lte = criteria.to;
    }
    if (criteria.search) {
      const rx = new RegExp(escapeRegex(criteria.search), 'i');
      filter.$or = [
        { 'candidateSnapshot.firstName': rx },
        { 'candidateSnapshot.lastName': rx },
        { 'candidateSnapshot.headline': rx },
        { 'candidateSnapshot.currentCompany': rx },
        { 'jobSnapshot.title': rx },
      ];
    }

    return this.paginate(filter, {
      page: criteria.page,
      limit: criteria.limit,
      sort: SORT_MAP[criteria.sort ?? 'newest'] ?? SORT_MAP.newest,
    });
  }

  /**
   * Funnel counts, in one round trip.
   *
   * Returns every pipeline stage even when the count is zero — a funnel chart with missing
   * bars reads as "no data" rather than "nobody reached this stage yet".
   *
   * @param {Record<string, any>} match
   * @returns {Promise<Record<string, number> & {total: number}>}
   */
  async countByStatus(match = {}) {
    const rows = await this.model.aggregate([
      { $match: { deletedAt: null, ...castMatchIds(match) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    /** @type {Record<string, number>} */
    const counts = {};
    for (const status of Object.values(APPLICATION_STATUS)) counts[status] = 0;

    let total = 0;
    for (const row of rows) {
      counts[row._id] = row.count;
      total += row.count;
    }

    return { ...counts, total };
  }

  /**
   * ★ The hiring funnel for one employer or one job.
   *
   * Each stage counts everyone who *reached at least* that stage, not who is sitting in it
   * now. A candidate currently at INTERVIEW was also viewed and shortlisted, and a funnel
   * that showed "shortlisted: 0" because they all moved on would be useless.
   *
   * @param {Record<string, any>} match
   */
  async getFunnel(match = {}) {
    const [row] = await this.model.aggregate([
      { $match: { deletedAt: null, ...castMatchIds(match) } },
      {
        $group: {
          _id: null,
          applied: { $sum: 1 },
          // `timeline.status` records every stage the application ever passed through.
          reachedViewed: { $sum: { $cond: [{ $ne: ['$viewedAt', null] }, 1, 0] } },
          reachedShortlist: { $sum: { $cond: [{ $ne: ['$shortlistedAt', null] }, 1, 0] } },
          reachedInterview: {
            $sum: { $cond: [{ $ne: ['$interview.scheduledAt', null] }, 1, 0] },
          },
          hired: { $sum: { $cond: [{ $eq: ['$status', APPLICATION_STATUS.HIRED] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', APPLICATION_STATUS.REJECTED] }, 1, 0] } },
          withdrawn: {
            $sum: { $cond: [{ $eq: ['$status', APPLICATION_STATUS.WITHDRAWN] }, 1, 0] },
          },
        },
      },
    ]);

    const applied = row?.applied ?? 0;
    const hired = row?.hired ?? 0;

    return {
      stages: APPLICATION_PIPELINE.map((stage) => ({
        status: stage,
        count:
          {
            [APPLICATION_STATUS.APPLIED]: applied,
            [APPLICATION_STATUS.VIEWED]: row?.reachedViewed ?? 0,
            [APPLICATION_STATUS.SHORTLISTED]: row?.reachedShortlist ?? 0,
            [APPLICATION_STATUS.INTERVIEW]: row?.reachedInterview ?? 0,
            [APPLICATION_STATUS.HIRED]: hired,
          }[stage] ?? 0,
      })),
      rejected: row?.rejected ?? 0,
      withdrawn: row?.withdrawn ?? 0,
      // Rounded to one decimal: "2.4%" is meaningful, "2.4390243902439024%" is noise.
      conversionRate: applied ? Math.round((hired / applied) * 1000) / 10 : 0,
    };
  }

  /**
   * Applications an employer has not looked at yet — powers the inbox badge and the
   * "you have unreviewed applicants" nudge.
   * @param {string} employerId
   */
  countUnviewed(employerId) {
    return this.count({
      employer: employerId,
      status: APPLICATION_STATUS.APPLIED,
      deletedAt: null,
    });
  }

  /** @param {string} applicantId */
  countForCandidate(applicantId) {
    return this.countByStatus({ applicant: applicantId });
  }

  /**
   * Applications per day, for the analytics charts.
   * @param {{from: Date, to: Date, employer?: string}} opts
   */
  timeSeries({ from, to, employer }) {
    return this.model.aggregate([
      {
        $match: {
          deletedAt: null,
          createdAt: { $gte: from, $lte: to },
          ...(employer ? castMatchIds({ employer }) : {}),
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } },
    ]);
  }

  /**
   * @param {string} id
   * @param {{lean?: boolean, session?: import('mongoose').ClientSession}} [opts]
   */
  findByIdPopulated(id, opts = {}) {
    const query = this.model
      .findById(id)
      .populate('applicant', 'firstName lastName email phone avatar')
      .populate('job', 'title slug status employer deadline');
    if (opts.session) query.session(opts.session);
    return opts.lean === false ? query : query.lean();
  }
}

export const applicationRepository = new ApplicationRepository();
export default applicationRepository;
