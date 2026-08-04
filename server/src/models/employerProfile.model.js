import mongoose from 'mongoose';
import {
  ACCOUNT_STATUS,
  ACCOUNT_STATUS_VALUES,
  COMPANY_SIZE_VALUES,
  DOCUMENT_TYPE_VALUES,
  EMPLOYER_REJECTION_CATEGORY,
  LIMITS,
  PATTERNS,
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_VALUES,
  slugify,
} from '@verihire/shared';
import { documentSchema } from './schemas/document.schema.js';
import { toJSONPlugin } from './plugins/toJSON.plugin.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { paginatePlugin } from './plugins/paginate.plugin.js';

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    country: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 20 },
  },
  { _id: false },
);

const companyDocumentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: DOCUMENT_TYPE_VALUES, required: true },
    publicId: { type: String, required: true },
    url: { type: String, required: true },
    originalName: { type: String, maxlength: 255 },
    sizeBytes: { type: Number, min: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

/** The admin's per-check verdict, snapshotted at the moment of the decision. */
const checklistSchema = new mongoose.Schema(
  {
    companyNameMatches: { type: Boolean, default: false },
    websiteLive: { type: Boolean, default: false },
    emailDomainMatches: { type: Boolean, default: false },
    linkedinValid: { type: Boolean, default: false },
    documentsValid: { type: Boolean, default: false },
    identityValid: { type: Boolean, default: false },
    gstValid: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * ★ VERIFICATION GATE 1.
 *
 * An employer account exists the moment someone signs up. This document is what decides
 * whether that account can do anything — nothing they post reaches a candidate until
 * `verificationStatus === VERIFIED` and `status === ACTIVE`.
 */
/**
 * Cast for the same reason as `candidateProfile.model.js` — `verification.checks` is a nested
 * plain object of sub-schema references, which Mongoose's `InferSchemaType` resolves into a
 * self-referencing mapped type (TS2615). See the longer note there.
 */
const employerProfileSchema = new mongoose.Schema(
  /** @type {any} */ ({
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    /** Seat model for a future multi-recruiter team; only OWNER is issued in v1. */
    members: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['OWNER', 'RECRUITER'], default: 'RECRUITER' },
        addedAt: { type: Date, default: Date.now },
      },
    ],

    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      minlength: LIMITS.MIN_COMPANY_NAME_LENGTH,
      maxlength: LIMITS.MAX_COMPANY_NAME_LENGTH,
    },
    slug: { type: String, unique: true, lowercase: true, trim: true, index: true },

    logo: { type: documentSchema, default: null },
    coverImage: { type: documentSchema, default: null },
    tagline: { type: String, trim: true, maxlength: LIMITS.MAX_TAGLINE_LENGTH },
    description: { type: String, trim: true, maxlength: LIMITS.MAX_COMPANY_DESCRIPTION_LENGTH },
    industry: { type: String, trim: true, index: true },
    foundedYear: {
      type: Number,
      min: LIMITS.MIN_FOUNDED_YEAR,
      validate: {
        validator: (value) => value == null || value <= new Date().getFullYear(),
        message: 'Founded year cannot be in the future',
      },
    },
    companySize: { type: String, enum: [...COMPANY_SIZE_VALUES, null], default: null },

    website: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || PATTERNS.URL.test(v),
        message: 'Enter a valid website URL',
      },
    },
    linkedin: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || PATTERNS.LINKEDIN_COMPANY.test(v),
        message: 'Enter a valid LinkedIn company URL',
      },
    },

    address: { type: addressSchema, default: () => ({}) },
    contact: {
      email: {
        type: String,
        trim: true,
        lowercase: true,
        validate: {
          validator: (v) => !v || PATTERNS.EMAIL.test(v),
          message: 'Enter a valid company email',
        },
      },
      phone: { type: String, trim: true },
      hrName: { type: String, trim: true, maxlength: 100 },
    },

    /* ------------------------------------------------------ ★ the gate ------ */

    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUS_VALUES,
      default: VERIFICATION_STATUS.UNSUBMITTED,
      index: true,
    },

    verification: {
      submittedAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

      /**
       * A rejection without a reason is unactionable for the employer, so the schema
       * refuses to persist one. This is the brief's "employer receives rejection reason"
       * turned into an invariant the database enforces rather than a convention a
       * controller is trusted to follow.
       */
      rejectionReason: {
        type: String,
        maxlength: LIMITS.MAX_REJECTION_REASON_LENGTH,
        default: null,
        required: [
          function requiredWhenRejected() {
            return this.verificationStatus === VERIFICATION_STATUS.REJECTED;
          },
          'A reason is required when rejecting a company',
        ],
      },
      rejectionCategory: {
        type: String,
        enum: [...Object.values(EMPLOYER_REJECTION_CATEGORY), null],
        default: null,
      },
      attemptCount: { type: Number, default: 0, min: 0 },
      checks: { type: checklistSchema, default: () => ({}) },
      adminNotes: { type: String, maxlength: LIMITS.MAX_ADMIN_NOTE_LENGTH, default: null },
    },

    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: (v) => !v || PATTERNS.GST.test(v),
        message: 'Enter a valid GSTIN',
      },
    },
    documents: {
      type: [companyDocumentSchema],
      validate: {
        validator: (docs) => docs.length <= LIMITS.MAX_COMPANY_DOCUMENTS,
        message: `At most ${LIMITS.MAX_COMPANY_DOCUMENTS} documents`,
      },
    },

    status: {
      type: String,
      enum: ACCOUNT_STATUS_VALUES,
      default: ACCOUNT_STATUS.ACTIVE,
      index: true,
    },
    suspension: {
      reason: { type: String, maxlength: LIMITS.MAX_ADMIN_NOTE_LENGTH, default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
    },

    stats: {
      totalJobsPosted: { type: Number, default: 0 },
      activeJobs: { type: Number, default: 0 },
      totalApplications: { type: Number, default: 0 },
      totalHires: { type: Number, default: 0 },
    },
  }),
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

/* ------------------------------------------------------------------ indexes */

// The admin verification queue: filter by status, oldest first.
employerProfileSchema.index({ verificationStatus: 1, 'verification.submittedAt': 1 });
// The public company directory.
employerProfileSchema.index({ verificationStatus: 1, status: 1, companyName: 1 });
employerProfileSchema.index({ companyName: 'text', description: 'text', industry: 'text' });

/* ----------------------------------------------------------------- virtuals */

/**
 * ★ The single predicate that decides whether this company may operate.
 *
 * Both halves matter: an unverified company was never approved, and a suspended one had
 * its approval taken away. Everything downstream — the write gate, job visibility, the
 * candidate search — reads this rather than re-deriving it.
 */
employerProfileSchema.virtual('canPostJobs').get(function canPostJobs() {
  return (
    this.verificationStatus === VERIFICATION_STATUS.VERIFIED &&
    this.status === ACCOUNT_STATUS.ACTIVE &&
    !this.deletedAt
  );
});

/**
 * Reads the virtual above, so `this` has to be declared — Mongoose infers a document type
 * from the schema paths and virtuals are not paths. Spelling out the dependency is also the
 * honest documentation: these two answers are the same answer.
 */
employerProfileSchema.virtual('isPubliclyListed').get(
  /** @this {import('mongoose').Document & {canPostJobs: boolean}} */
  function isPubliclyListed() {
    return this.canPostJobs;
  },
);

employerProfileSchema.virtual('canResubmit').get(function canResubmit() {
  return (
    this.verificationStatus === VERIFICATION_STATUS.REJECTED ||
    this.verificationStatus === VERIFICATION_STATUS.UNSUBMITTED
  );
});

/* -------------------------------------------------------------------- hooks */

employerProfileSchema.pre('save', async function generateSlug(next) {
  if (!this.isModified('companyName') && this.slug) return next();

  const base = slugify(this.companyName) || 'company';
  let candidate = base;
  let suffix = 1;

  // Two companies genuinely can share a name; the slug must still be unique.
  while (
    await mongoose.models.EmployerProfile.exists({ slug: candidate, _id: { $ne: this._id } })
  ) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  this.slug = candidate;
  return next();
});

/* ------------------------------------------------------------------ methods */

/**
 * Everything that must be present before a company can enter the review queue.
 * @returns {{ready: boolean, missing: string[]}}
 */
employerProfileSchema.methods.getSubmissionReadiness = function getSubmissionReadiness() {
  const missing = [];
  if (!this.companyName) missing.push('companyName');
  if (!this.description || this.description.length < 50) missing.push('description');
  if (!this.website) missing.push('website');
  if (!this.industry) missing.push('industry');
  if (!this.companySize) missing.push('companySize');
  if (!this.contact?.email) missing.push('contact.email');
  if (!this.contact?.phone) missing.push('contact.phone');
  if (!this.address?.city || !this.address?.country) missing.push('address');
  if (!this.documents?.length) missing.push('documents');

  return { ready: missing.length === 0, missing };
};

employerProfileSchema.plugin(toJSONPlugin);
employerProfileSchema.plugin(softDeletePlugin);
employerProfileSchema.plugin(paginatePlugin);

export const EmployerProfile = mongoose.model('EmployerProfile', employerProfileSchema);
export default EmployerProfile;
