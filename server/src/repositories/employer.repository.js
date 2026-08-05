import { ACCOUNT_STATUS, VERIFICATION_STATUS } from '@verihire/shared';
import { BaseRepository } from './base.repository.js';
import { EmployerProfile } from '../models/employerProfile.model.js';

/**
 * The public company directory only ever shows companies that cleared gate 1.
 * @param {Record<string, any>} [extra]
 * @returns {Record<string, any>} a Mongo filter callers compose further conditions onto
 */
export const buildPublicEmployerFilter = (extra = {}) => ({
  verificationStatus: VERIFICATION_STATUS.VERIFIED,
  status: ACCOUNT_STATUS.ACTIVE,
  deletedAt: null,
  ...extra,
});

/** @param {string} value */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class EmployerRepository extends BaseRepository {
  constructor() {
    super(EmployerProfile);
  }

  /**
   * @param {string} userId
   * @param {{select?: string, lean?: boolean,
   *          session?: import('mongoose').ClientSession|null}} [opts]
   */
  findByOwner(userId, opts = {}) {
    return this.findOne({ owner: userId }, opts);
  }

  /** @param {string} slug */
  findPublicBySlug(slug) {
    return this.model.findOne(buildPublicEmployerFilter({ slug })).lean();
  }

  /** @param {string} slug */
  findBySlug(slug, opts = {}) {
    return this.findOne({ slug }, opts);
  }

  /**
   * ★ The admin verification queue.
   *
   * Defaults to oldest-first: an employer who submitted three days ago must not be
   * overtaken forever by a stream of newer submissions.
   *
   * @param {{status?: string, search?: string, page?: number, limit?: number,
   *          sort?: 'oldest'|'newest'}} criteria
   */
  findQueue(criteria = {}) {
    const filter = { deletedAt: null };
    if (criteria.status) filter.verificationStatus = criteria.status;
    if (criteria.search) {
      filter.companyName = new RegExp(escapeRegex(criteria.search), 'i');
    }

    return this.paginate(filter, {
      page: criteria.page,
      limit: criteria.limit,
      sort:
        criteria.sort === 'newest'
          ? '-verification.submittedAt'
          : 'verification.submittedAt',
      populate: { path: 'owner', select: 'firstName lastName email createdAt' },
    });
  }

  /**
   * @param {{search?: string, industry?: string, companySize?: string,
   *          page?: number, limit?: number, sort?: string}} criteria
   */
  searchPublic(criteria = {}) {
    const filter = buildPublicEmployerFilter();
    if (criteria.industry) filter.industry = criteria.industry;
    if (criteria.companySize) filter.companySize = criteria.companySize;
    if (criteria.search) filter.companyName = new RegExp(escapeRegex(criteria.search), 'i');

    return this.paginate(filter, {
      page: criteria.page,
      limit: criteria.limit,
      sort: criteria.sort ?? 'companyName',
      select: 'companyName slug logo tagline industry companySize address stats createdAt',
    });
  }

  countByVerificationStatus() {
    return this.model.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$verificationStatus', count: { $sum: 1 } } },
    ]);
  }

  countPublic() {
    return this.model.countDocuments(buildPublicEmployerFilter());
  }

  /**
   * How long companies are waiting for a decision — the metric that tells an admin team
   * whether manual verification has become the bottleneck.
   */
  async getQueueHealth() {
    const [row] = await this.model.aggregate([
      {
        $match: {
          verificationStatus: VERIFICATION_STATUS.PENDING,
          deletedAt: null,
          'verification.submittedAt': { $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          pending: { $sum: 1 },
          oldestSubmittedAt: { $min: '$verification.submittedAt' },
          avgWaitMs: { $avg: { $subtract: ['$$NOW', '$verification.submittedAt'] } },
        },
      },
    ]);

    return {
      pending: row?.pending ?? 0,
      oldestSubmittedAt: row?.oldestSubmittedAt ?? null,
      avgWaitHours: row?.avgWaitMs ? Math.round(row.avgWaitMs / 3_600_000) : 0,
    };
  }

  /** Average time from submission to decision, for the admin analytics page. */
  async getReviewThroughput({ from, to }) {
    const [row] = await this.model.aggregate([
      {
        $match: {
          deletedAt: null,
          'verification.reviewedAt': { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: '$verificationStatus',
          count: { $sum: 1 },
          avgReviewMs: {
            $avg: { $subtract: ['$verification.reviewedAt', '$verification.submittedAt'] },
          },
        },
      },
    ]);
    return row ?? null;
  }

  /**
   * @param {string} id
   * @param {Record<string, number>} increments
   */
  bumpStats(id, increments, opts = {}) {
    return this.model.updateOne({ _id: id }, { $inc: increments }, { session: opts.session });
  }
}

export const employerRepository = new EmployerRepository();
export default employerRepository;
