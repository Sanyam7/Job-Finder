import { JOB_SORT, JOB_STATUS, VERIFICATION_STATUS, ACCOUNT_STATUS } from '@verihire/shared';
import { BaseRepository } from './base.repository.js';
import { Job } from '../models/job.model.js';

/**
 * ★★★ THE MOST IMPORTANT FUNCTION IN THIS CODEBASE ★★★
 *
 * A job is visible to the public if and only if all of these hold. Every public read path
 * composes this filter — there are no exceptions and no second implementation.
 *
 * Why a denormalised `isPubliclyVisible` *and* the explicit status/deadline checks?
 * Defence in depth. The flag is what makes the query fast (no join to the employer
 * collection); the explicit predicates mean that if the flag ever drifts — a failed
 * transaction, a bad migration, a bug in a future service — the drift cannot leak a hidden
 * job into public results. A stale `true` is caught here; a stale `false` is caught by the
 * nightly reconciliation cron.
 *
 * @param {Record<string, any>} [extra] additional filters to merge
 * @returns {Record<string, any>}
 */
export const buildPublicJobFilter = (extra = {}) => ({
  status: JOB_STATUS.APPROVED,
  isPubliclyVisible: true,
  deletedAt: null,
  deadline: { $gte: new Date() },
  ...extra,
});

/** @param {string} value */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORT_MAP = {
  [JOB_SORT.NEWEST]: { publishedAt: -1, _id: -1 },
  [JOB_SORT.OLDEST]: { publishedAt: 1, _id: 1 },
  [JOB_SORT.SALARY_HIGH]: { 'salary.max': -1, publishedAt: -1 },
  [JOB_SORT.RELEVANCE]: { score: { $meta: 'textScore' }, publishedAt: -1 },
};

class JobRepository extends BaseRepository {
  constructor() {
    super(Job);
  }

  /**
   * Translates search criteria into a Mongo filter.
   *
   * @param {Object} c
   * @param {boolean} [publicOnly] false only for owner/admin views
   * @returns {Record<string, any>}
   */
  buildSearchFilter(c = {}, publicOnly = true) {
    const filter = publicOnly ? buildPublicJobFilter() : { deletedAt: null };

    if (c.keyword) filter.$text = { $search: c.keyword };
    if (c.employer) filter.employer = c.employer;
    if (c.status) filter.status = c.status;
    if (c.companySlug) filter['companySnapshot.slug'] = c.companySlug;

    if (c.skills?.length) filter['skillsRequired.name'] = { $in: c.skills };
    if (c.workMode?.length) filter.workMode = { $in: c.workMode };
    if (c.employmentType?.length) filter.employmentType = { $in: c.employmentType };
    if (c.industry?.length) filter.industry = { $in: [].concat(c.industry) };
    if (c.educationLevel) filter['education.level'] = c.educationLevel;

    if (c.location) {
      // Anchored prefix match so the index can be used; a leading-wildcard regex cannot.
      filter.$or = [
        { 'location.city': new RegExp(`^${escapeRegex(c.location)}`, 'i') },
        { 'location.state': new RegExp(`^${escapeRegex(c.location)}`, 'i') },
        { 'location.isRemoteAnywhere': true },
      ];
    }

    /**
     * Salary and experience are ranges on BOTH sides, so the comparison is an interval
     * overlap, not a containment check.
     *
     * A candidate filtering for "at least 15L" should see a job paying 12–20L, because
     * that job's ceiling clears their floor. The naive `job.min >= filter.min` silently
     * hides matching jobs — it is the most common bug in job-board search, and it makes
     * the product look empty.
     */
    if (c.minSalary != null) filter['salary.max'] = { $gte: c.minSalary };
    if (c.maxSalary != null) filter['salary.min'] = { $lte: c.maxSalary };

    if (c.minExpMonths != null) filter['experience.maxMonths'] = { $gte: c.minExpMonths };
    if (c.maxExpMonths != null) filter['experience.minMonths'] = { $lte: c.maxExpMonths };

    if (c.postedWithinDays) {
      filter.publishedAt = {
        $gte: new Date(Date.now() - c.postedWithinDays * 86_400_000),
      };
    }

    return filter;
  }

  /**
   * @param {Object} criteria
   * @param {{publicOnly?: boolean}} [opts]
   */
  async search(criteria = {}, { publicOnly = true } = {}) {
    const filter = this.buildSearchFilter(criteria, publicOnly);

    // Relevance sorting is only meaningful when there is a text query to score against.
    const requested = criteria.sort ?? JOB_SORT.NEWEST;
    const sortKey =
      requested === JOB_SORT.RELEVANCE && !criteria.keyword ? JOB_SORT.NEWEST : requested;
    const sort = SORT_MAP[sortKey] ?? SORT_MAP[JOB_SORT.NEWEST];

    const page = Math.max(Number(criteria.page) || 1, 1);
    const limit = Math.min(Math.max(Number(criteria.limit) || 20, 1), 50);
    const projection =
      sortKey === JOB_SORT.RELEVANCE ? { score: { $meta: 'textScore' } } : undefined;

    let query = this.model.find(filter, projection).sort(sort).skip((page - 1) * limit).limit(limit);
    if (criteria.select) query = query.select(criteria.select);

    const [items, totalItems] = await Promise.all([
      query.lean().exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { items, page, limit, totalItems };
  }

  /**
   * Public detail lookup by slug.
   *
   * Returns null — never a 403 — when a job fails either gate. Distinguishing "hidden" from
   * "does not exist" would confirm to a scraper that a specific pending listing exists.
   * @param {string} slug
   */
  findPublicBySlug(slug) {
    return this.model.findOne(buildPublicJobFilter({ slug })).lean();
  }

  /** @param {string} id */
  findByIdAny(id, opts = {}) {
    return this.findById(id, opts);
  }

  /** @param {string} employerId */
  findByEmployer(employerId, criteria = {}) {
    const filter = { employer: employerId, deletedAt: null };
    if (criteria.status) filter.status = criteria.status;
    if (criteria.search) filter.title = new RegExp(escapeRegex(criteria.search), 'i');

    return this.paginate(filter, {
      page: criteria.page,
      limit: criteria.limit,
      sort: criteria.sort ?? '-createdAt',
    });
  }

  /** The admin approval queue — oldest submission first, so nobody waits indefinitely. */
  findPendingQueue(criteria = {}) {
    return this.paginate(
      { status: JOB_STATUS.PENDING, deletedAt: null },
      {
        page: criteria.page,
        limit: criteria.limit,
        sort: criteria.sort === 'newest' ? '-moderation.submittedAt' : 'moderation.submittedAt',
      },
    );
  }

  /**
   * ★ Bulk visibility flip when an employer's standing changes.
   *
   * When an admin verifies a company, every already-approved, in-deadline job of theirs
   * must become public in the same transaction. When an admin suspends one, every job must
   * vanish immediately — a write-time check cannot do that retroactively, which is exactly
   * why the read-side flag exists.
   *
   * @param {string} employerId
   * @param {boolean} visible
   * @param {{session?: import('mongoose').ClientSession}} [opts]
   */
  setVisibilityForEmployer(employerId, visible, opts = {}) {
    const filter = { employer: employerId, deletedAt: null };

    if (visible) {
      // Only jobs that already cleared gate 2 and have not expired.
      filter.status = JOB_STATUS.APPROVED;
      filter.deadline = { $gte: new Date() };
    }

    return this.model.updateMany(
      filter,
      {
        $set: {
          isPubliclyVisible: visible,
          'companySnapshot.isVerified': visible,
        },
      },
      { session: opts.session },
    );
  }

  /**
   * @param {string} employerId
   * @param {Record<string, any>} snapshot
   */
  refreshCompanySnapshot(employerId, snapshot, opts = {}) {
    return this.model.updateMany(
      { employer: employerId, deletedAt: null },
      { $set: { companySnapshot: snapshot } },
      { session: opts.session },
    );
  }

  /** Jobs whose deadline has passed but are still marked live — the hourly expiry cron. */
  findExpiredLive() {
    return this.model
      .find({
        status: JOB_STATUS.APPROVED,
        deadline: { $lt: new Date() },
        deletedAt: null,
        $or: [{ isPubliclyVisible: true }, { archivedAt: null }],
      })
      .select('_id title employer slug postedBy')
      .lean();
  }

  /** @param {number} days */
  findExpiringSoon(days = 3) {
    const from = new Date();
    const to = new Date(Date.now() + days * 86_400_000);
    return this.model
      .find({
        status: JOB_STATUS.APPROVED,
        isPubliclyVisible: true,
        deletedAt: null,
        deadline: { $gte: from, $lte: to },
      })
      .select('_id title employer deadline postedBy')
      .lean();
  }

  /**
   * ★ Reconciliation source data.
   *
   * Joins each job to its employer so the cron can recompute the truth and compare it to
   * the stored flag. Any mismatch is a defect signal, logged loudly.
   */
  findAllWithEmployerState() {
    return this.model.aggregate([
      { $match: { deletedAt: null } },
      {
        $lookup: {
          from: 'employerprofiles',
          localField: 'employer',
          foreignField: '_id',
          as: 'employerDoc',
          pipeline: [{ $project: { verificationStatus: 1, status: 1, deletedAt: 1 } }],
        },
      },
      { $unwind: { path: '$employerDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          status: 1,
          deadline: 1,
          isPubliclyVisible: 1,
          employerVerification: '$employerDoc.verificationStatus',
          employerStatus: '$employerDoc.status',
          employerDeleted: '$employerDoc.deletedAt',
        },
      },
    ]);
  }

  /** Facet counts for the browse sidebar, in one round trip instead of six. */
  async getFacets(criteria = {}) {
    const filter = this.buildSearchFilter(criteria, true);

    const [result] = await this.model.aggregate([
      { $match: filter },
      {
        $facet: {
          workMode: [{ $group: { _id: '$workMode', count: { $sum: 1 } } }],
          employmentType: [{ $group: { _id: '$employmentType', count: { $sum: 1 } } }],
          industry: [
            { $group: { _id: '$industry', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 },
          ],
          city: [
            { $match: { 'location.city': { $ne: null } } },
            { $group: { _id: '$location.city', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 },
          ],
          skills: [
            { $unwind: '$skillsRequired' },
            { $group: { _id: '$skillsRequired.name', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 25 },
          ],
          total: [{ $count: 'value' }],
        },
      },
    ]);

    const toMap = (rows) => rows.map((r) => ({ value: r._id, count: r.count })).filter((r) => r.value);

    return {
      workMode: toMap(result?.workMode ?? []),
      employmentType: toMap(result?.employmentType ?? []),
      industry: toMap(result?.industry ?? []),
      city: toMap(result?.city ?? []),
      skills: toMap(result?.skills ?? []),
      total: result?.total?.[0]?.value ?? 0,
    };
  }

  /** @param {string} id */
  incrementViews(id) {
    return this.model.updateOne({ _id: id }, { $inc: { 'stats.views': 1 } });
  }

  /** @param {string} id @param {number} delta */
  incrementApplications(id, delta = 1, opts = {}) {
    return this.model.updateOne(
      { _id: id },
      { $inc: { 'stats.applications': delta } },
      { session: opts.session },
    );
  }

  countByStatus() {
    return this.model.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
  }

  /** Landing-page counter: live jobs from verified, active companies. */
  countPubliclyVisible() {
    return this.model.countDocuments(buildPublicJobFilter());
  }
}

export { VERIFICATION_STATUS, ACCOUNT_STATUS };
export const jobRepository = new JobRepository();
export default jobRepository;
