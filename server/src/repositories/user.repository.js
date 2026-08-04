import { ACCOUNT_STATUS, ROLES } from '@verihire/shared';
import { BaseRepository } from './base.repository.js';
import { User } from '../models/user.model.js';

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  /**
   * @param {string} email
   * @param {{withPassword?: boolean, lean?: boolean}} [opts]
   */
  findByEmail(email, { withPassword = false, lean = false } = {}) {
    const query = this.model.findOne({ email: String(email ?? '').toLowerCase().trim() });
    if (withPassword) query.select('+passwordHash');
    if (lean) query.lean();
    return query;
  }

  /** @param {string} email */
  emailExists(email) {
    return this.exists({ email: String(email ?? '').toLowerCase().trim() });
  }

  /**
   * Loads a hydrated document (not lean) — callers need instance methods such as
   * `comparePassword` and `registerFailedLogin`.
   * @param {string} id
   */
  findByIdWithPassword(id) {
    return this.model.findById(id).select('+passwordHash');
  }

  /**
   * @param {{role?: string, status?: string, search?: string, isEmailVerified?: boolean,
   *          page?: number, limit?: number, sort?: string}} criteria
   */
  searchUsers(criteria = {}) {
    const filter = {};
    if (criteria.role) filter.role = criteria.role;
    if (criteria.status) filter.status = criteria.status;
    if (typeof criteria.isEmailVerified === 'boolean') {
      filter.isEmailVerified = criteria.isEmailVerified;
    }

    if (criteria.search) {
      const term = escapeRegex(criteria.search);
      filter.$or = [
        { firstName: new RegExp(term, 'i') },
        { lastName: new RegExp(term, 'i') },
        { email: new RegExp(term, 'i') },
      ];
    }

    return this.paginate(filter, {
      page: criteria.page,
      limit: criteria.limit,
      sort: criteria.sort ?? '-createdAt',
    });
  }

  /**
   * @param {string} id
   * @param {{reason: string, by: string}} payload
   * @param {{session?: import('mongoose').ClientSession}} [opts]
   */
  suspend(id, { reason, by }, opts = {}) {
    return this.updateById(
      id,
      {
        status: ACCOUNT_STATUS.SUSPENDED,
        suspendedReason: reason,
        suspendedBy: by,
        suspendedAt: new Date(),
      },
      opts,
    );
  }

  /**
   * @param {string} id
   * @param {{session?: import('mongoose').ClientSession}} [opts]
   */
  restore(id, opts = {}) {
    return this.updateById(
      id,
      {
        status: ACCOUNT_STATUS.ACTIVE,
        suspendedReason: null,
        suspendedBy: null,
        suspendedAt: null,
      },
      opts,
    );
  }

  /** @param {string} id */
  markEmailVerified(id) {
    return this.updateById(id, { isEmailVerified: true, emailVerifiedAt: new Date() });
  }

  /** Recipients for platform-wide admin notifications (new pending queue items). */
  findActiveAdmins() {
    return this.find(
      { role: ROLES.ADMIN, status: ACCOUNT_STATUS.ACTIVE },
      { select: '_id email firstName' },
    );
  }

  /** Counters for the admin dashboard, in one round trip rather than five. */
  async countByRoleAndStatus() {
    const rows = await this.model.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } },
    ]);

    /** @type {Record<string, Record<string, number>>} */
    const result = {};
    for (const row of rows) {
      const { role, status } = row._id;
      result[role] ??= {};
      result[role][status] = row.count;
    }
    return result;
  }

  /**
   * Daily signup counts for the analytics chart.
   * @param {{from: Date, to: Date, role?: string}} params
   */
  signupsOverTime({ from, to, role }) {
    return this.model.aggregate([
      {
        $match: {
          deletedAt: null,
          createdAt: { $gte: from, $lte: to },
          ...(role ? { role } : {}),
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            role: '$role',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);
  }
}

/** @param {string} value */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const userRepository = new UserRepository();
export default userRepository;
