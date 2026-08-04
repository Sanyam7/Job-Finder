import { PROFILE_VISIBILITY, AVAILABILITY_META } from '@verihire/shared';
import { BaseRepository } from './base.repository.js';
import { CandidateProfile } from '../models/candidateProfile.model.js';

/**
 * ★ The candidate-discoverability gate.
 *
 * An employer searching the database only ever sees candidates who opted in. This is the
 * candidate-side mirror of the employer verification gate: the platform does not sell
 * access to people who did not ask to be found.
 *
 * @param {Record<string, any>} [extra]
 * @returns {Record<string, any>} a Mongo filter callers compose further conditions onto
 */
export const buildDiscoverableFilter = (extra = {}) => ({
  openToWork: true,
  profileVisibility: { $ne: PROFILE_VISIBILITY.PRIVATE },
  deletedAt: null,
  ...extra,
});

/** @param {string} value */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class CandidateRepository extends BaseRepository {
  constructor() {
    super(CandidateProfile);
  }

  /**
   * @param {string} userId
   * @param {{select?: string, lean?: boolean, populate?: any}} [opts]
   */
  findByUser(userId, opts = {}) {
    return this.findOne({ user: userId }, opts);
  }

  /** @param {string} userId */
  findByUserPopulated(userId) {
    return this.model
      .findOne({ user: userId })
      .populate('user', 'firstName lastName email phone avatar isEmailVerified createdAt');
  }

  /**
   * Employer-facing candidate search.
   *
   * Always composes `buildDiscoverableFilter()` — there is no code path that lets an
   * employer query candidates who have not opted in.
   *
   * @param {Object} c
   */
  searchDiscoverable(c = {}) {
    const filter = buildDiscoverableFilter();

    if (c.keyword) filter.$text = { $search: c.keyword };
    if (c.skills?.length) filter['skills.name'] = { $all: c.skills };
    if (c.location) filter['location.city'] = new RegExp(`^${escapeRegex(c.location)}`, 'i');
    if (c.availability?.length) filter['preferences.availability'] = { $in: c.availability };
    if (c.willingToRelocate != null) filter['preferences.willingToRelocate'] = c.willingToRelocate;
    if (c.workModes?.length) filter['preferences.workModes'] = { $in: c.workModes };

    // Experience is a point value on the candidate and a range on the query.
    if (c.minExpMonths != null || c.maxExpMonths != null) {
      filter.totalExperienceMonths = {};
      if (c.minExpMonths != null) filter.totalExperienceMonths.$gte = c.minExpMonths;
      if (c.maxExpMonths != null) filter.totalExperienceMonths.$lte = c.maxExpMonths;
    }

    /**
     * Budget filter matches on the candidate's *floor*, not their ceiling: an employer
     * with 20L to spend can hire someone asking 15–25L. Comparing against `expected.max`
     * would hide every candidate whose range merely extends past the budget.
     */
    if (c.maxSalary != null) filter['preferences.expectedSalary.min'] = { $lte: c.maxSalary };

    if (c.maxNoticePeriodDays != null) {
      filter['preferences.noticePeriodDays'] = { $lte: c.maxNoticePeriodDays };
    }

    const page = Math.max(Number(c.page) || 1, 1);
    const limit = Math.min(Math.max(Number(c.limit) || 20, 1), 50);

    return this.paginate(filter, {
      page,
      limit,
      sort: c.sort ?? '-updatedAt',
      populate: { path: 'user', select: 'firstName lastName avatar' },
      select:
        'headline currentCompany currentDesignation totalExperienceMonths skills location ' +
        'preferences.availability preferences.noticePeriodDays preferences.expectedSalary ' +
        'openToWork profileCompleteness updatedAt',
    });
  }

  /**
   * Detail view for an employer.
   *
   * Returns null when the candidate is not discoverable, so the caller must fall back to
   * the "did they apply to one of my jobs?" check before showing anything.
   * @param {string} id
   */
  findDiscoverableById(id) {
    return this.model
      .findOne(buildDiscoverableFilter({ _id: id }))
      .populate('user', 'firstName lastName avatar')
      .lean();
  }

  /** @param {string} userId @param {Record<string, any>} update */
  updateByUser(userId, update, opts = {}) {
    return this.updateOne({ user: userId }, update, opts);
  }

  /**
   * @param {string} profileId
   * @param {string} arrayPath e.g. 'experience'
   * @param {Record<string, any>} item
   */
  pushSubdocument(profileId, arrayPath, item) {
    return this.model.findByIdAndUpdate(
      profileId,
      { $push: { [arrayPath]: item } },
      { new: true, runValidators: true },
    );
  }

  /**
   * @param {string} profileId
   * @param {string} arrayPath
   * @param {string} itemId
   */
  pullSubdocument(profileId, arrayPath, itemId) {
    return this.model.findByIdAndUpdate(
      profileId,
      { $pull: { [arrayPath]: { _id: itemId } } },
      { new: true },
    );
  }

  /** @param {string} id */
  incrementViews(id) {
    return this.model.updateOne({ _id: id }, { $inc: { 'stats.profileViews': 1 } });
  }

  countDiscoverable() {
    return this.model.countDocuments(buildDiscoverableFilter());
  }

  /**
   * Candidates whose skills overlap a job's requirements — powers "recommended jobs" in
   * reverse and the employer's "matching candidates" hint.
   * @param {string[]} skillNames
   * @param {number} limit
   */
  findBySkillOverlap(skillNames, limit = 10) {
    return this.model.aggregate([
      { $match: buildDiscoverableFilter({ 'skills.name': { $in: skillNames } }) },
      {
        $addFields: {
          matchCount: {
            $size: { $setIntersection: ['$skills.name', skillNames] },
          },
        },
      },
      { $sort: { matchCount: -1, totalExperienceMonths: -1 } },
      { $limit: limit },
      {
        $project: {
          headline: 1,
          currentDesignation: 1,
          totalExperienceMonths: 1,
          matchCount: 1,
          'location.city': 1,
        },
      },
    ]);
  }
}

export { AVAILABILITY_META };
export const candidateRepository = new CandidateRepository();
export default candidateRepository;
