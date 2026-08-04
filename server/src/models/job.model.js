import mongoose from 'mongoose';
import {
  CURRENCY_VALUES,
  EDUCATION_LEVEL,
  EDUCATION_LEVEL_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  JOB_REJECTION_CATEGORY,
  JOB_STATUS,
  JOB_STATUS_VALUES,
  LIMITS,
  SALARY_PERIOD,
  SALARY_PERIOD_VALUES,
  WORK_MODE_VALUES,
  slugify,
} from '@verihire/shared';
import { toJSONPlugin } from './plugins/toJSON.plugin.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { paginatePlugin } from './plugins/paginate.plugin.js';

const salarySchema = new mongoose.Schema(
  {
    min: { type: Number, min: 0, default: null },
    max: { type: Number, min: 0, default: null },
    currency: { type: String, enum: CURRENCY_VALUES, default: 'INR' },
    period: { type: String, enum: SALARY_PERIOD_VALUES, default: SALARY_PERIOD.YEARLY },
    isDisclosed: { type: Boolean, default: true },
  },
  { _id: false },
);

salarySchema.pre('validate', function checkRange(next) {
  if (this.min != null && this.max != null && this.min > this.max) {
    return next(new Error('Minimum salary cannot exceed maximum salary'));
  }
  return next();
});

const jobSchema = new mongoose.Schema(
  {
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployerProfile',
      required: true,
      index: true,
    },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      minlength: LIMITS.MIN_JOB_TITLE_LENGTH,
      maxlength: LIMITS.MAX_JOB_TITLE_LENGTH,
    },
    slug: { type: String, unique: true, lowercase: true, index: true },

    /**
     * Denormalised employer snapshot.
     *
     * The public job list must not `$lookup` the employer collection on every read — that
     * join is what would put the p95 over budget at 100k jobs. The snapshot is refreshed
     * by the employer service whenever the company's public-facing fields change.
     */
    companySnapshot: {
      name: { type: String, required: true },
      slug: { type: String, required: true },
      logo: { type: String, default: null },
      industry: { type: String, default: null },
      companySize: { type: String, default: null },
      isVerified: { type: Boolean, default: false },
    },

    description: {
      type: String,
      required: [true, 'Job description is required'],
      minlength: LIMITS.MIN_JOB_DESCRIPTION_LENGTH,
      maxlength: LIMITS.MAX_JOB_DESCRIPTION_LENGTH,
    },
    responsibilities: [{ type: String, trim: true, maxlength: LIMITS.MAX_JOB_LIST_ITEM_LENGTH }],
    requirements: [{ type: String, trim: true, maxlength: LIMITS.MAX_JOB_LIST_ITEM_LENGTH }],
    niceToHave: [{ type: String, trim: true, maxlength: LIMITS.MAX_JOB_LIST_ITEM_LENGTH }],
    benefits: [{ type: String, trim: true, maxlength: LIMITS.MAX_JOB_LIST_ITEM_LENGTH }],

    skillsRequired: [
      {
        _id: false,
        skill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', default: null },
        name: { type: String, required: true, trim: true },
        isMandatory: { type: Boolean, default: true },
      },
    ],

    /** Experience is stored in MONTHS everywhere — see shared/utils/format.js. */
    experience: {
      minMonths: { type: Number, min: 0, max: LIMITS.MAX_TOTAL_EXPERIENCE_MONTHS, default: 0 },
      maxMonths: { type: Number, min: 0, max: LIMITS.MAX_TOTAL_EXPERIENCE_MONTHS, default: null },
    },
    education: {
      level: { type: String, enum: EDUCATION_LEVEL_VALUES, default: EDUCATION_LEVEL.ANY },
      fields: [{ type: String, trim: true }],
    },

    employmentType: { type: String, enum: EMPLOYMENT_TYPE_VALUES, required: true, index: true },
    workMode: { type: String, enum: WORK_MODE_VALUES, required: true, index: true },
    location: {
      city: { type: String, trim: true, index: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      isRemoteAnywhere: { type: Boolean, default: false },
    },
    salary: { type: salarySchema, default: () => ({}) },

    openings: {
      type: Number,
      default: 1,
      min: LIMITS.MIN_OPENINGS,
      max: LIMITS.MAX_OPENINGS,
    },
    deadline: { type: Date, required: [true, 'An application deadline is required'], index: true },
    industry: { type: String, trim: true, index: true },
    department: { type: String, trim: true },

    /* ------------------------------------------------- ★ VERIFICATION GATE 2 */

    status: {
      type: String,
      enum: JOB_STATUS_VALUES,
      default: JOB_STATUS.DRAFT,
      index: true,
    },

    moderation: {
      submittedAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      rejectionReason: {
        type: String,
        maxlength: LIMITS.MAX_REJECTION_REASON_LENGTH,
        default: null,
        required: [
          function requiredWhenRejected() {
            return this.status === JOB_STATUS.REJECTED;
          },
          'A reason is required when rejecting a job',
        ],
      },
      rejectionCategory: {
        type: String,
        enum: [...Object.values(JOB_REJECTION_CATEGORY), null],
        default: null,
      },
      revisionCount: { type: Number, default: 0 },
      previousStatus: { type: String, default: null },
    },

    /**
     * ★ THE VISIBILITY FLAG.
     *
     * Denormalised from (job status × employer verification × employer status × deadline)
     * so the public list is a single indexed scan with no join. It is written ONLY by
     * `job.service.js#recomputeVisibility` and repaired nightly by `reconcileVisibility`.
     *
     * Defaults to false: a job is invisible until something explicitly makes it visible,
     * which is the safe direction for this failure mode.
     */
    isPubliclyVisible: { type: Boolean, default: false, index: true },

    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },

    stats: {
      views: { type: Number, default: 0 },
      uniqueViews: { type: Number, default: 0 },
      applications: { type: Number, default: 0 },
      shortlisted: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
    },

    /** Concatenated blob backing the weighted text index. */
    searchText: { type: String, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

/* ------------------------------------------------------------------ indexes */

/**
 * Every public-facing compound index leads with `isPubliclyVisible`.
 *
 * That predicate is present in 100% of public queries and eliminates the overwhelming
 * majority of documents immediately, so leading with it is the difference between an
 * IXSCAN and a COLLSCAN once the collection is large.
 */
jobSchema.index({ isPubliclyVisible: 1, publishedAt: -1 });
jobSchema.index({ isPubliclyVisible: 1, workMode: 1, employmentType: 1, publishedAt: -1 });
jobSchema.index({ isPubliclyVisible: 1, 'location.city': 1, publishedAt: -1 });
jobSchema.index({ isPubliclyVisible: 1, 'salary.max': -1 });
jobSchema.index({ isPubliclyVisible: 1, 'skillsRequired.name': 1 });
jobSchema.index({ isPubliclyVisible: 1, industry: 1, publishedAt: -1 });

// The admin approval queue — oldest submission first.
jobSchema.index({ status: 1, 'moderation.submittedAt': 1 });
// An employer's own job list, which shows every status.
jobSchema.index({ employer: 1, status: 1, createdAt: -1 });
// The expiry cron.
jobSchema.index({ status: 1, deadline: 1 });

jobSchema.index(
  { title: 'text', searchText: 'text', description: 'text' },
  { weights: { title: 10, searchText: 5, description: 1 }, name: 'job_text_search' },
);

/* ----------------------------------------------------------------- virtuals */

jobSchema.virtual('isExpired').get(function isExpired() {
  return this.deadline ? this.deadline.getTime() < Date.now() : false;
});

/**
 * ★ Depends on `isExpired` above and on the denormalised visibility flag — exactly the pair
 * `computeVisibility()` keeps in step.
 *
 * The `@this` tag sits on the function expression rather than the statement, which is where
 * TypeScript actually reads it from; a virtual reading another virtual is invisible to
 * Mongoose's schema-path inference otherwise.
 */
jobSchema.virtual('isAcceptingApplications').get(
  /** @this {import('mongoose').Document & {isPubliclyVisible: boolean, isExpired: boolean}} */
  function isAccepting() {
    return this.isPubliclyVisible && !this.isExpired;
  },
);

jobSchema.virtual('daysUntilDeadline').get(function daysLeft() {
  if (!this.deadline) return null;
  return Math.ceil((this.deadline.getTime() - Date.now()) / 86_400_000);
});

/* -------------------------------------------------------------------- hooks */

jobSchema.pre('save', async function generateSlug(next) {
  if (!this.isModified('title') && this.slug) return next();

  const base = slugify(`${this.title}-${this.companySnapshot?.name ?? ''}`) || 'job';
  let candidate = base;
  let attempt = 0;

  while (await mongoose.models.Job.exists({ slug: candidate, _id: { $ne: this._id } })) {
    attempt += 1;
    candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    if (attempt > 5) break;
  }

  this.slug = candidate;
  return next();
});

jobSchema.pre('save', function buildSearchText(next) {
  if (
    !this.isModified('title') &&
    !this.isModified('skillsRequired') &&
    !this.isModified('companySnapshot') &&
    !this.isModified('location') &&
    this.searchText
  ) {
    return next();
  }

  this.searchText = [
    this.title,
    this.companySnapshot?.name,
    this.industry,
    this.department,
    this.location?.city,
    this.location?.state,
    ...(this.skillsRequired ?? []).map((s) => s.name),
  ]
    .filter(Boolean)
    .join(' ');

  return next();
});

jobSchema.pre('validate', function checkExperienceRange(next) {
  const { minMonths, maxMonths } = this.experience ?? {};
  if (minMonths != null && maxMonths != null && minMonths > maxMonths) {
    this.invalidate('experience.maxMonths', 'Maximum experience cannot be less than minimum');
  }
  return next();
});

/* ------------------------------------------------------------------ methods */

/**
 * ★ Recomputes visibility from first principles.
 *
 * The one place the rule lives. Both the service layer and the nightly reconciliation cron
 * call this, which is what guarantees they can never disagree.
 *
 * @param {{verificationStatus: string, status: string, deletedAt?: Date|null}} employer
 * @returns {boolean}
 */
jobSchema.methods.computeVisibility = function computeVisibility(employer) {
  return Boolean(
    this.status === JOB_STATUS.APPROVED &&
      !this.deletedAt &&
      this.deadline &&
      this.deadline.getTime() >= Date.now() &&
      employer &&
      employer.verificationStatus === 'VERIFIED' &&
      employer.status === 'ACTIVE' &&
      !employer.deletedAt,
  );
};

jobSchema.plugin(toJSONPlugin);
jobSchema.plugin(softDeletePlugin);
jobSchema.plugin(paginatePlugin);

export const Job = mongoose.model('Job', jobSchema);
export default Job;
