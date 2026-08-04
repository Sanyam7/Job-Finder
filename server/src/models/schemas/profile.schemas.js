import mongoose from 'mongoose';
import {
  CURRENCY_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  FIELD_SOURCE,
  FIELD_SOURCE_VALUES,
  LIMITS,
  PATTERNS,
  SALARY_PERIOD,
  SALARY_PERIOD_VALUES,
  SKILL_LEVEL_VALUES,
  WORK_MODE_VALUES,
} from '@verihire/shared';

/**
 * Embedded sub-schemas for the candidate profile (ADR-009).
 *
 * Each lives in its own exported schema so promoting any of them to a standalone
 * collection later is a repository-layer change rather than a rewrite.
 *
 * Every entry carries `source` — the provenance marker from ADR-006. A re-parse may
 * overwrite a PARSER/AI entry; it may never silently replace one the candidate wrote.
 */

const sourceField = {
  type: String,
  enum: FIELD_SOURCE_VALUES,
  default: FIELD_SOURCE.USER,
};

export const addressSchema = new mongoose.Schema(
  {
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    country: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 20 },
  },
  { _id: false },
);

export const salaryRangeSchema = new mongoose.Schema(
  {
    min: { type: Number, min: 0, default: null },
    max: { type: Number, min: 0, default: null },
    currency: { type: String, enum: CURRENCY_VALUES, default: 'INR' },
    period: { type: String, enum: SALARY_PERIOD_VALUES, default: SALARY_PERIOD.YEARLY },
  },
  { _id: false },
);

export const experienceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, required: true, trim: true, maxlength: 120 },
    employmentType: { type: String, enum: [...EMPLOYMENT_TYPE_VALUES, null], default: null },
    location: { type: String, trim: true, maxlength: 120 },
    workMode: { type: String, enum: [...WORK_MODE_VALUES, null], default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    isCurrent: { type: Boolean, default: false },
    description: { type: String, maxlength: LIMITS.MAX_DESCRIPTION_LENGTH },
    skills: [{ type: String, trim: true }],
    source: sourceField,
  },
  { _id: true, timestamps: false },
);

/**
 * "Current role" and "end date" are mutually exclusive by definition. Enforcing it at the
 * schema level means no code path — form, importer, or resume parser — can produce a role
 * that is simultaneously ongoing and finished.
 */
experienceSchema.pre('validate', function validateDates(next) {
  if (this.isCurrent) {
    this.endDate = null;
  } else if (this.endDate && this.startDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'End date cannot be before the start date');
  }
  if (this.startDate && this.startDate > new Date()) {
    this.invalidate('startDate', 'Start date cannot be in the future');
  }
  return next();
});

export const educationSchema = new mongoose.Schema(
  {
    degree: { type: String, required: true, trim: true, maxlength: 120 },
    fieldOfStudy: { type: String, trim: true, maxlength: 120 },
    institution: { type: String, required: true, trim: true, maxlength: 150 },
    startYear: { type: Number, min: 1950 },
    endYear: { type: Number, min: 1950 },
    grade: { type: String, trim: true, maxlength: 50 },
    description: { type: String, maxlength: LIMITS.MAX_DESCRIPTION_LENGTH },
    source: sourceField,
  },
  { _id: true },
);

educationSchema.pre('validate', function validateYears(next) {
  const maxYear = new Date().getFullYear() + 10; // in-progress degrees have a future end
  if (this.endYear && this.endYear > maxYear) {
    this.invalidate('endYear', 'That end year is too far in the future');
  }
  if (this.startYear && this.endYear && this.endYear < this.startYear) {
    this.invalidate('endYear', 'End year cannot be before the start year');
  }
  return next();
});

export const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: LIMITS.MAX_DESCRIPTION_LENGTH },
    techStack: [{ type: String, trim: true, maxlength: 50 }],
    url: {
      type: String,
      trim: true,
      validate: { validator: (v) => !v || PATTERNS.URL.test(v), message: 'Enter a valid URL' },
    },
    repoUrl: {
      type: String,
      trim: true,
      validate: { validator: (v) => !v || PATTERNS.URL.test(v), message: 'Enter a valid URL' },
    },
    startDate: { type: Date },
    endDate: { type: Date },
    source: sourceField,
  },
  { _id: true },
);

export const certificationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    issuer: { type: String, trim: true, maxlength: 120 },
    issueDate: { type: Date },
    expiryDate: { type: Date },
    credentialId: { type: String, trim: true, maxlength: 100 },
    credentialUrl: {
      type: String,
      trim: true,
      validate: { validator: (v) => !v || PATTERNS.URL.test(v), message: 'Enter a valid URL' },
    },
    source: sourceField,
  },
  { _id: true },
);

export const candidateSkillSchema = new mongoose.Schema(
  {
    skill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', default: null },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    level: { type: String, enum: [...SKILL_LEVEL_VALUES, null], default: null },
    yearsOfExperience: { type: Number, min: 0, max: 60, default: null },
    source: sourceField,
  },
  { _id: false },
);

export const languageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    proficiency: {
      type: String,
      enum: ['BASIC', 'CONVERSATIONAL', 'PROFESSIONAL', 'NATIVE'],
      default: 'PROFESSIONAL',
    },
  },
  { _id: false },
);
