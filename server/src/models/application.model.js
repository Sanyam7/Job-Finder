import mongoose from 'mongoose';
import {
  ACTOR_ROLE,
  APPLICATION_STATUS,
  APPLICATION_STATUS_VALUES,
  APPLICATION_TERMINAL_STATUSES,
  INTERVIEW_MODE_VALUES,
  JOB_REJECTION_CATEGORY,
  LIMITS,
} from '@verihire/shared';
import { salaryRangeSchema } from './schemas/profile.schemas.js';
import { toJSONPlugin } from './plugins/toJSON.plugin.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { paginatePlugin } from './plugins/paginate.plugin.js';

/**
 * ★ The append-only timeline.
 *
 * Every status change writes one entry and nothing ever rewrites one. When a candidate says
 * "they told me I was shortlisted and then it said rejected", the timeline is the record —
 * so it has to be a log, not a mutable field that the latest write overwrites.
 *
 * `isCandidateVisible` exists because an employer's note on a rejection is usually written
 * for their own team ("weak on system design"), not for the candidate. Storing both in one
 * array with an explicit flag is safer than two arrays that can drift out of order.
 */
const timelineEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: APPLICATION_STATUS_VALUES, required: true },
    note: { type: String, trim: true, maxlength: LIMITS.MAX_EMPLOYER_NOTES_LENGTH, default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: Object.values(ACTOR_ROLE), default: ACTOR_ROLE.SYSTEM },
    isCandidateVisible: { type: Boolean, default: true },
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const applicationSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },

    /**
     * Denormalised from the job.
     *
     * "Show me every applicant across all my jobs" is the employer's primary inbox query.
     * Without this field it needs a `$lookup` on every page load; with it, it is one indexed
     * scan. The job's employer never changes, so there is no staleness risk.
     */
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployerProfile',
      required: true,
      index: true,
    },

    applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    candidateProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CandidateProfile',
      default: null,
    },

    /* --------------------------------------------------------- ★ snapshots */

    /**
     * ★ Point-in-time copies, deliberately NOT populated on read.
     *
     * A candidate applied to "Senior React Developer, ₹18–28L, Bengaluru". If the employer
     * later edits the listing — or it is archived, or the employer is suspended and every
     * job of theirs disappears — the application must still show what was actually applied
     * to. Populating the live job instead would silently rewrite history, and on a platform
     * built to stop bait-and-switch that is precisely the wrong behaviour.
     */
    jobSnapshot: {
      title: { type: String, required: true },
      slug: { type: String, required: true },
      companyName: { type: String, required: true },
      companySlug: { type: String, default: null },
      companyLogo: { type: String, default: null },
      employmentType: { type: String, default: null },
      workMode: { type: String, default: null },
      location: {
        city: { type: String, default: null },
        state: { type: String, default: null },
        country: { type: String, default: null },
      },
      salary: { type: salaryRangeSchema, default: null },
      deadline: { type: Date, default: null },
    },

    candidateSnapshot: {
      firstName: { type: String, default: null },
      lastName: { type: String, default: null },
      email: { type: String, default: null },
      phone: { type: String, default: null },
      headline: { type: String, default: null },
      currentCompany: { type: String, default: null },
      currentDesignation: { type: String, default: null },
      totalExperienceMonths: { type: Number, default: 0 },
      skills: [{ type: String }],
      location: {
        city: { type: String, default: null },
        state: { type: String, default: null },
        country: { type: String, default: null },
      },
      profileCompleteness: { type: Number, default: 0 },
    },

    /**
     * The resume **as it was on the day they applied**.
     *
     * A candidate who uploads a new resume next month has not changed what this employer
     * received. Pointing at the live profile resume would show the employer a document the
     * applicant never sent them, and would let a candidate retroactively alter a submission.
     */
    resumeSnapshot: {
      publicId: { type: String, default: null },
      originalName: { type: String, default: null },
      format: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
      version: { type: Number, default: 0 },
      uploadedAt: { type: Date, default: null },
    },

    /* ----------------------------------------------------- submitted by the candidate */

    coverLetter: {
      type: String,
      trim: true,
      maxlength: LIMITS.MAX_COVER_LETTER_LENGTH,
      default: null,
    },
    expectedSalary: { type: salaryRangeSchema, default: null },
    noticePeriodDays: { type: Number, min: 0, max: LIMITS.MAX_NOTICE_PERIOD_DAYS, default: null },
    answers: [
      {
        _id: false,
        question: { type: String, trim: true, maxlength: 300 },
        answer: { type: String, trim: true, maxlength: 1000 },
      },
    ],

    /* ------------------------------------------------------------ lifecycle */

    status: {
      type: String,
      enum: APPLICATION_STATUS_VALUES,
      default: APPLICATION_STATUS.APPLIED,
      index: true,
    },
    statusChangedAt: { type: Date, default: Date.now },
    timeline: { type: [timelineEventSchema], default: [] },

    viewedAt: { type: Date, default: null },
    shortlistedAt: { type: Date, default: null },
    decidedAt: { type: Date, default: null },

    interview: {
      scheduledAt: { type: Date, default: null },
      mode: { type: String, enum: [...INTERVIEW_MODE_VALUES, null], default: null },
      meetingLink: { type: String, default: null },
      location: { type: String, default: null },
      round: { type: Number, min: 1, max: 10, default: null },
      notes: { type: String, maxlength: LIMITS.MAX_EMPLOYER_NOTES_LENGTH, default: null },
    },

    rejection: {
      reason: { type: String, maxlength: LIMITS.MAX_REJECTION_REASON_LENGTH, default: null },
      category: {
        type: String,
        enum: [...Object.values(JOB_REJECTION_CATEGORY), 'NOT_A_FIT', 'ROLE_FILLED', null],
        default: null,
      },
      at: { type: Date, default: null },
    },

    withdrawal: {
      reason: { type: String, maxlength: 500, default: null },
      at: { type: Date, default: null },
    },

    /* ------------------------------------------------- ★ employer-private */

    /**
     * These two are the reason `application.response.dto.js` has separate candidate and
     * employer projections.
     *
     * They are NOT marked `private: true` — that plugin strips a path from every consumer,
     * and the employer legitimately needs to read its own notes. The boundary is therefore
     * enforced at the projection layer and asserted by an integration test, because a leaked
     * "rejected — seemed dishonest in the screening call" is the kind of mistake that ends
     * up in a lawsuit rather than a bug report.
     */
    employerNotes: {
      type: String,
      trim: true,
      maxlength: LIMITS.MAX_EMPLOYER_NOTES_LENGTH,
      default: null,
    },
    rating: { type: Number, min: 1, max: 5, default: null },
    tags: [{ type: String, trim: true, maxlength: 40 }],

    /** True once the employer has opened the resume — surfaced to the candidate as a signal. */
    resumeDownloadedAt: { type: Date, default: null },

    source: { type: String, enum: ['DIRECT', 'SEARCH', 'RECOMMENDATION'], default: 'DIRECT' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

/* ------------------------------------------------------------------ indexes */

/**
 * ★★ ONE APPLICATION PER JOB PER CANDIDATE — enforced by the database, not by a service check.
 *
 * A service-level "have they already applied?" read followed by a write is a textbook race:
 * two clicks 20ms apart both read "no" and both insert. A unique index cannot lose that
 * race, so the duplicate check here is a constraint and the service's job is only to
 * translate the resulting E11000 into a friendly 409.
 *
 * Note this index is NOT partial on `deletedAt`. That is intentional: withdrawing is final,
 * and a soft-deleted application still occupies its slot. Letting a candidate withdraw and
 * re-apply repeatedly is a spam vector against the employer's inbox.
 */
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true, name: 'one_application_per_job' });

// The candidate's tracker.
applicationSchema.index({ applicant: 1, status: 1, createdAt: -1 });
// The employer's cross-job inbox.
applicationSchema.index({ employer: 1, status: 1, createdAt: -1 });
// A single job's applicant list.
applicationSchema.index({ job: 1, status: 1, createdAt: -1 });
// Analytics: funnel over a date range.
applicationSchema.index({ employer: 1, createdAt: -1 });

/* ----------------------------------------------------------------- virtuals */

applicationSchema.virtual('isTerminal').get(function isTerminal() {
  return APPLICATION_TERMINAL_STATUSES.includes(this.status);
});

applicationSchema.virtual('canWithdraw').get(function canWithdraw() {
  return !APPLICATION_TERMINAL_STATUSES.includes(this.status);
});

applicationSchema.virtual('daysSinceApplied').get(function daysSince() {
  if (!this.createdAt) return null;
  return Math.floor((Date.now() - this.createdAt.getTime()) / 86_400_000);
});

/* ------------------------------------------------------------------ methods */

/**
 * Appends one timeline entry. The only sanctioned way to write to `timeline`.
 *
 * @param {{status: string, note?: string|null, actor?: string|null, actorRole?: string,
 *          isCandidateVisible?: boolean}} event
 */
applicationSchema.methods.pushTimeline = function pushTimeline(event) {
  this.timeline.push({
    status: event.status,
    note: event.note ?? null,
    actor: event.actor ?? null,
    actorRole: event.actorRole ?? ACTOR_ROLE.SYSTEM,
    isCandidateVisible: event.isCandidateVisible ?? true,
    at: new Date(),
  });
};

/* -------------------------------------------------------------------- hooks */

/**
 * ★ The timeline is append-only, enforced at the model layer.
 *
 * A guard in the service can be bypassed by the next person who writes a new service. This
 * cannot: any save that shortens the array or edits an existing entry's status is rejected
 * outright, so the audit value of the timeline survives future refactors.
 */
applicationSchema.pre('save', function guardTimeline(next) {
  if (this.isNew) return next();

  const modified = this.modifiedPaths();
  const rewritesExisting = modified.some((path) => /^timeline\.\d+\./.test(path));

  if (rewritesExisting) {
    return next(new Error('The application timeline is append-only and cannot be edited'));
  }
  return next();
});

applicationSchema.plugin(toJSONPlugin);
applicationSchema.plugin(softDeletePlugin);
applicationSchema.plugin(paginatePlugin);

/**
 * ★ `pushTimeline` is declared so callers get it typed — it is the only sanctioned write to
 * `timeline`, and the model hook rejects every other one.
 *
 * @typedef {object} ApplicationMethods
 * @property {(event: {status: string, note?: string|null, actor?: string|null,
 *   actorRole?: string, isCandidateVisible?: boolean}) => void} pushTimeline
 */

/** @type {import('mongoose').Model<any, {}, ApplicationMethods>} */
export const Application = /** @type {any} */ (
  mongoose.model('Application', applicationSchema)
);
export default Application;
