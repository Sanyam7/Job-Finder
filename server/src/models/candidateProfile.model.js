import mongoose from 'mongoose';
import {
  AVAILABILITY,
  AVAILABILITY_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  FIELD_SOURCE,
  LIMITS,
  PARSE_STATUS,
  PARSE_STATUS_VALUES,
  PATTERNS,
  PROFILE_VISIBILITY,
  PROFILE_VISIBILITY_VALUES,
  WORK_MODE_VALUES,
} from '@verihire/shared';
import { documentSchema } from './schemas/document.schema.js';
import {
  addressSchema,
  candidateSkillSchema,
  certificationSchema,
  educationSchema,
  experienceSchema,
  languageSchema,
  projectSchema,
  salaryRangeSchema,
} from './schemas/profile.schemas.js';
import { toJSONPlugin } from './plugins/toJSON.plugin.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { paginatePlugin } from './plugins/paginate.plugin.js';

const urlValidator = (pattern, message) => ({
  validator: (v) => !v || pattern.test(v),
  message,
});

/**
 * The definition object is cast so Mongoose does not try to infer a document type from it.
 *
 * `preferences` is a nested plain object that contains sub-schema references
 * (`expectedSalary: { type: salaryRangeSchema }`). Mongoose's `InferSchemaType` cannot resolve
 * that combination — it produces a mapped type that references itself and fails with TS2615.
 * The same shape appears in `employerProfile.model.js` under `verification.checks`.
 *
 * Flattening `preferences` into its own `new mongoose.Schema(...)` would resolve the inference,
 * but it would also turn a nested path into a subdocument — which changes `_id` generation and
 * the semantics of `profile.set('preferences.noticePeriodDays', x)`, the exact call the
 * candidate service and the ADR-006 provenance map depend on. Not worth a behaviour change to
 * satisfy a type inference we do not use: the model is exported as `Model<any>` and every
 * consumer reads it through a response DTO.
 */
const candidateProfileSchema = new mongoose.Schema(
  /** @type {any} */ ({
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    headline: { type: String, trim: true, maxlength: LIMITS.MAX_HEADLINE_LENGTH },
    bio: { type: String, trim: true, maxlength: LIMITS.MAX_BIO_LENGTH },
    profilePicture: { type: documentSchema, default: null },
    location: { type: addressSchema, default: () => ({}) },

    currentCompany: { type: String, trim: true, maxlength: 120 },
    currentDesignation: { type: String, trim: true, maxlength: 120 },
    /** Canonical unit is MONTHS — "3.5 years" is ambiguous, 42 is not. */
    totalExperienceMonths: {
      type: Number,
      min: 0,
      max: LIMITS.MAX_TOTAL_EXPERIENCE_MONTHS,
      default: 0,
    },

    skills: {
      type: [candidateSkillSchema],
      validate: {
        validator: (v) => v.length <= LIMITS.MAX_SKILLS,
        message: `At most ${LIMITS.MAX_SKILLS} skills`,
      },
    },
    experience: {
      type: [experienceSchema],
      validate: {
        validator: (v) => v.length <= LIMITS.MAX_EXPERIENCE_ENTRIES,
        message: `At most ${LIMITS.MAX_EXPERIENCE_ENTRIES} roles`,
      },
    },
    education: {
      type: [educationSchema],
      validate: {
        validator: (v) => v.length <= LIMITS.MAX_EDUCATION_ENTRIES,
        message: `At most ${LIMITS.MAX_EDUCATION_ENTRIES} entries`,
      },
    },
    projects: {
      type: [projectSchema],
      validate: {
        validator: (v) => v.length <= LIMITS.MAX_PROJECT_ENTRIES,
        message: `At most ${LIMITS.MAX_PROJECT_ENTRIES} projects`,
      },
    },
    certifications: {
      type: [certificationSchema],
      validate: {
        validator: (v) => v.length <= LIMITS.MAX_CERTIFICATION_ENTRIES,
        message: `At most ${LIMITS.MAX_CERTIFICATION_ENTRIES} certifications`,
      },
    },
    achievements: [{ type: String, trim: true, maxlength: LIMITS.MAX_ACHIEVEMENT_LENGTH }],
    languages: { type: [languageSchema], default: [] },

    links: {
      github: { type: String, trim: true, validate: urlValidator(PATTERNS.GITHUB, 'Enter a valid GitHub profile URL') },
      linkedin: { type: String, trim: true, validate: urlValidator(PATTERNS.LINKEDIN_PROFILE, 'Enter a valid LinkedIn profile URL') },
      portfolio: { type: String, trim: true, validate: urlValidator(PATTERNS.URL, 'Enter a valid URL') },
      twitter: { type: String, trim: true, validate: urlValidator(PATTERNS.URL, 'Enter a valid URL') },
    },

    /* ------------------------------------------------------------- resume */

    resume: {
      publicId: { type: String, default: null },
      url: { type: String, default: null, private: true }, // never sent raw; always re-signed
      originalName: { type: String, default: null },
      format: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
      version: { type: Number, default: 0 },
      uploadedAt: { type: Date, default: null },
      parseStatus: { type: String, enum: PARSE_STATUS_VALUES, default: PARSE_STATUS.NONE },
      parseError: { type: String, default: null },
    },

    /**
     * ★ ADR-006 — extraction lands HERE, never in the live profile.
     *
     * The candidate sees a side-by-side review and accepts fields individually. Nothing
     * from a parser or an LLM reaches the fields above without an explicit click. This is
     * the brief's "never force AI extracted values" expressed as a storage boundary rather
     * than as UI discipline that a future refactor could quietly drop.
     */
    parsedDraft: {
      extractedAt: { type: Date, default: null },
      engine: { type: String, default: null },
      llmUsed: { type: Boolean, default: false },
      fields: { type: mongoose.Schema.Types.Mixed, default: null },
      appliedAt: { type: Date, default: null },
    },

    /**
     * Field path → provenance. `USER` on a path means the candidate wrote it, so a re-parse
     * must not overwrite it and the review screen must warn before replacing it.
     *
     * ★ Keys are stored **encoded**, because Mongoose maps reject keys containing a dot —
     * `preferences.currentSalary` throws on save. Read and write this through
     * `setFieldSource` / `getFieldSource` / `fieldSourcePaths` below, which own the
     * encoding; touching the map directly with a dotted path is a runtime error waiting to
     * happen the first time someone edits a nested field.
     */
    fieldSources: {
      type: Map,
      of: { type: String, enum: Object.values(FIELD_SOURCE) },
      default: () => new Map(),
    },

    /* -------------------------------------------------------- preferences */

    preferences: {
      jobTypes: [{ type: String, enum: EMPLOYMENT_TYPE_VALUES }],
      workModes: [{ type: String, enum: WORK_MODE_VALUES }],
      preferredLocations: [{ type: String, trim: true, maxlength: 100 }],
      expectedSalary: { type: salaryRangeSchema, default: () => ({}) },
      currentSalary: {
        amount: { type: Number, min: 0, default: null },
        currency: { type: String, default: 'INR' },
        period: { type: String, default: 'YEARLY' },
        // Current pay is the most sensitive field a candidate gives us. Hidden by default.
        isConfidential: { type: Boolean, default: true },
      },
      noticePeriodDays: { type: Number, min: 0, max: LIMITS.MAX_NOTICE_PERIOD_DAYS, default: 0 },
      availability: {
        type: String,
        enum: AVAILABILITY_VALUES,
        default: AVAILABILITY.WITHIN_30_DAYS,
      },
      willingToRelocate: { type: Boolean, default: false },
    },

    /** ★ Controls whether employers can find this profile in candidate search. */
    openToWork: { type: Boolean, default: false, index: true },
    profileVisibility: {
      type: String,
      enum: PROFILE_VISIBILITY_VALUES,
      default: PROFILE_VISIBILITY.EMPLOYERS_ONLY,
    },

    profileCompleteness: { type: Number, min: 0, max: 100, default: 0 },
    searchKeywords: [{ type: String }],

    stats: {
      profileViews: { type: Number, default: 0 },
      applicationsSent: { type: Number, default: 0 },
      shortlistedCount: { type: Number, default: 0 },
    },
  }),
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

/* ------------------------------------------------------------------ indexes */

// Employer candidate search — leads with the discoverability gate.
candidateProfileSchema.index({ openToWork: 1, profileVisibility: 1, totalExperienceMonths: 1 });
candidateProfileSchema.index({ openToWork: 1, 'skills.name': 1 });
candidateProfileSchema.index({ openToWork: 1, 'location.city': 1 });
candidateProfileSchema.index({ openToWork: 1, 'preferences.availability': 1 });
candidateProfileSchema.index(
  { headline: 'text', searchKeywords: 'text', currentDesignation: 'text', bio: 'text' },
  {
    weights: { headline: 10, currentDesignation: 8, searchKeywords: 5, bio: 2 },
    name: 'candidate_text_search',
  },
);

/* ----------------------------------------------------------------- virtuals */

candidateProfileSchema.virtual('hasResume').get(function hasResume() {
  return Boolean(this.resume?.publicId);
});

candidateProfileSchema.virtual('isDiscoverable').get(function isDiscoverable() {
  return this.openToWork && this.profileVisibility !== PROFILE_VISIBILITY.PRIVATE;
});

/* -------------------------------------------------------------------- hooks */

/**
 * Weighted completeness.
 *
 * Weights reflect what actually makes a profile useful to an employer, not field count —
 * a resume and real work history matter far more than a Twitter link.
 */
candidateProfileSchema.pre('save', function computeCompleteness(next) {
  /**
   * Annotated because a bare array of mixed tuples infers as `(boolean|number)[]`, which makes
   * `weight` a `number|boolean` and the sum below a type error. The runtime behaviour was
   * always correct; this just tells the checker what the pairs are.
   *
   * @type {Array<[boolean, number]>}
   */
  const checks = [
    [Boolean(this.headline), 10],
    [Boolean(this.bio && this.bio.length >= 50), 10],
    [Boolean(this.profilePicture?.publicId), 5],
    [Boolean(this.location?.city), 5],
    [(this.skills?.length ?? 0) >= 3, 15],
    [(this.experience?.length ?? 0) >= 1, 20],
    [(this.education?.length ?? 0) >= 1, 10],
    [Boolean(this.resume?.publicId), 15],
    [(this.preferences?.jobTypes?.length ?? 0) > 0, 5],
    [Boolean(this.links?.linkedin || this.links?.github || this.links?.portfolio), 5],
  ];

  this.profileCompleteness = checks.reduce(
    (total, [passed, weight]) => total + (passed ? weight : 0),
    0,
  );
  return next();
});

candidateProfileSchema.pre('save', function buildSearchKeywords(next) {
  if (
    !this.isModified('skills') &&
    !this.isModified('experience') &&
    !this.isModified('currentDesignation') &&
    this.searchKeywords?.length
  ) {
    return next();
  }

  const keywords = new Set();
  for (const skill of this.skills ?? []) keywords.add(skill.name);
  for (const role of this.experience ?? []) {
    keywords.add(role.title);
    keywords.add(role.company);
  }
  if (this.currentDesignation) keywords.add(this.currentDesignation);
  if (this.currentCompany) keywords.add(this.currentCompany);

  this.searchKeywords = [...keywords].filter(Boolean).slice(0, 100);
  return next();
});

/* ------------------------------------------------------------------ methods */

/**
 * Dot-path ⇄ map-key encoding.
 *
 * `__` is unambiguous here: field paths are validated against `[a-zA-Z][a-zA-Z0-9]*`
 * segments, so an underscore can never appear in one legitimately.
 *
 * @param {string} path
 */
export const encodeFieldPath = (path) => String(path).replace(/\./g, '__');

/** @param {string} key */
export const decodeFieldPath = (key) => String(key).replace(/__/g, '.');

/**
 * ★ Marks a set of dot-paths as candidate-authored.
 *
 * Called on every manual edit. Once a path is USER, a re-parse cannot overwrite it, and the
 * review screen surfaces a conflict warning instead of pre-checking the replacement.
 *
 * @param {string[]} paths
 */
candidateProfileSchema.methods.markUserEdited = function markUserEdited(paths) {
  for (const path of paths) this.setFieldSource(path, FIELD_SOURCE.USER);
};

/**
 * @param {string} path dot-path, e.g. `preferences.noticePeriodDays`
 * @param {string} source one of FIELD_SOURCE
 */
candidateProfileSchema.methods.setFieldSource = function setFieldSource(path, source) {
  this.fieldSources ??= new Map();
  this.fieldSources.set(encodeFieldPath(path), source);
};

/** @param {string} path */
candidateProfileSchema.methods.getFieldSource = function getFieldSource(path) {
  return this.fieldSources?.get(encodeFieldPath(path)) ?? null;
};

/** @param {string} path */
candidateProfileSchema.methods.isUserEdited = function isUserEdited(path) {
  return this.getFieldSource(path) === FIELD_SOURCE.USER;
};

/**
 * The provenance map with dot-paths restored — the shape the API exposes.
 * @returns {Record<string, string>}
 */
candidateProfileSchema.methods.fieldSourcePaths = function fieldSourcePaths() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of this.fieldSources ?? []) out[decodeFieldPath(key)] = value;
  return out;
};

candidateProfileSchema.plugin(toJSONPlugin);
candidateProfileSchema.plugin(softDeletePlugin);
candidateProfileSchema.plugin(paginatePlugin);

export const CandidateProfile = mongoose.model('CandidateProfile', candidateProfileSchema);
export default CandidateProfile;
