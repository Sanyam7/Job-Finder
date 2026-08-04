import { body, param, query } from 'express-validator';
import {
  AVAILABILITY_VALUES,
  CURRENCY_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  LIMITS,
  PATTERNS,
  PROFILE_VISIBILITY_VALUES,
  SALARY_PERIOD_VALUES,
  SKILL_LEVEL_VALUES,
  WORK_MODE_VALUES,
} from '@verihire/shared';
import {
  arrayQuery,
  booleanQuery,
  objectIdParam,
  optionalUrl,
  paginationRules,
} from './common.validator.js';

/** Sections that can be edited item by item. Mirrors COLLECTIONS in the service. */
export const PROFILE_COLLECTIONS = [
  'experience',
  'education',
  'projects',
  'certifications',
  'languages',
];

export const collectionParam = param('collection')
  .isIn(PROFILE_COLLECTIONS)
  .withMessage(`Section must be one of: ${PROFILE_COLLECTIONS.join(', ')}`);

/* ------------------------------------------------------------------ profile */

export const updateProfileRules = [
  body('headline')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: LIMITS.MAX_HEADLINE_LENGTH })
    .withMessage(`Keep your headline under ${LIMITS.MAX_HEADLINE_LENGTH} characters`),

  body('bio').optional({ values: 'null' }).trim().isLength({ max: LIMITS.MAX_BIO_LENGTH }),
  body('currentCompany').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('currentDesignation').optional({ values: 'null' }).trim().isLength({ max: 120 }),

  body('totalExperienceMonths')
    .optional({ values: 'null' })
    .toInt()
    .isInt({ min: 0, max: LIMITS.MAX_TOTAL_EXPERIENCE_MONTHS })
    .withMessage('That is not a plausible amount of experience'),

  body('location.city').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('location.state').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('location.country').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('location.postalCode').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),

  optionalUrl('links.github', { label: 'GitHub URL', pattern: PATTERNS.GITHUB }),
  optionalUrl('links.linkedin', { label: 'LinkedIn URL', pattern: PATTERNS.LINKEDIN_PROFILE }),
  optionalUrl('links.portfolio', { label: 'portfolio URL' }),
  optionalUrl('links.twitter', { label: 'URL' }),

  body('achievements').optional().isArray({ max: LIMITS.MAX_ACHIEVEMENT_ENTRIES }),
  body('achievements.*').optional().trim().isLength({ max: LIMITS.MAX_ACHIEVEMENT_LENGTH }),
];

export const preferencesRules = [
  body('jobTypes').optional().isArray({ max: EMPLOYMENT_TYPE_VALUES.length }),
  body('jobTypes.*').optional().isIn(EMPLOYMENT_TYPE_VALUES),
  body('workModes').optional().isArray({ max: WORK_MODE_VALUES.length }),
  body('workModes.*').optional().isIn(WORK_MODE_VALUES),
  body('preferredLocations').optional().isArray({ max: 10 }),
  body('preferredLocations.*').optional().trim().isLength({ max: 100 }),

  body('expectedSalary.min').optional({ values: 'null' }).toFloat().isFloat({ min: 0 }),
  body('expectedSalary.max')
    .optional({ values: 'null' })
    .toFloat()
    .isFloat({ min: 0 })
    .custom((value, { req }) => {
      const min = req.body?.expectedSalary?.min;
      if (min != null && value != null && Number(value) < Number(min)) {
        throw new Error('Maximum cannot be below the minimum');
      }
      return true;
    }),
  body('expectedSalary.currency').optional().isIn(CURRENCY_VALUES),
  body('expectedSalary.period').optional().isIn(SALARY_PERIOD_VALUES),

  body('currentSalary.amount').optional({ values: 'null' }).toFloat().isFloat({ min: 0 }),
  body('currentSalary.currency').optional().isIn(CURRENCY_VALUES),
  body('currentSalary.isConfidential').optional().isBoolean().toBoolean(),

  body('noticePeriodDays')
    .optional({ values: 'null' })
    .toInt()
    .isInt({ min: 0, max: LIMITS.MAX_NOTICE_PERIOD_DAYS }),
  body('availability').optional().isIn(AVAILABILITY_VALUES),
  body('willingToRelocate').optional().isBoolean().toBoolean(),
];

export const visibilityRules = [
  body('openToWork').optional().isBoolean().toBoolean(),
  body('profileVisibility').optional().isIn(PROFILE_VISIBILITY_VALUES),
];

export const skillsRules = [
  body('skills')
    .isArray({ max: LIMITS.MAX_SKILLS })
    .withMessage(`At most ${LIMITS.MAX_SKILLS} skills`),
  body('skills.*.name').trim().notEmpty().withMessage('Every skill needs a name').isLength({ max: 60 }),
  body('skills.*.level').optional({ values: 'null' }).isIn(SKILL_LEVEL_VALUES),
  body('skills.*.yearsOfExperience').optional({ values: 'null' }).toFloat().isFloat({ min: 0, max: 60 }),
];

/* -------------------------------------------------------------- collections */

/**
 * One rule set covering every section.
 *
 * The alternative — five near-identical rule sets — is where a field quietly ends up
 * validated on `experience` and unvalidated on `projects`. Mongoose enforces each section's
 * required fields, so this layer's job is bounds and types.
 */
const itemFields = [
  body('title').optional({ values: 'null' }).trim().isLength({ max: 150 }),
  body('company').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('employmentType').optional({ values: 'null' }).isIn(EMPLOYMENT_TYPE_VALUES),
  body('workMode').optional({ values: 'null' }).isIn(WORK_MODE_VALUES),
  body('location').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('startDate').optional({ values: 'null' }).isISO8601().toDate(),
  body('endDate').optional({ values: 'null' }).isISO8601().toDate(),
  body('isCurrent').optional().isBoolean().toBoolean(),
  body('description').optional({ values: 'null' }).trim().isLength({ max: LIMITS.MAX_DESCRIPTION_LENGTH }),

  body('degree').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('fieldOfStudy').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('institution').optional({ values: 'null' }).trim().isLength({ max: 150 }),
  body('startYear').optional({ values: 'null' }).toInt().isInt({ min: 1950, max: 2100 }),
  body('endYear').optional({ values: 'null' }).toInt().isInt({ min: 1950, max: 2100 }),
  body('grade').optional({ values: 'null' }).trim().isLength({ max: 50 }),

  body('name').optional({ values: 'null' }).trim().isLength({ max: 150 }),
  body('techStack').optional().isArray({ max: 25 }),
  body('techStack.*').optional().trim().isLength({ max: 50 }),
  optionalUrl('url'),
  optionalUrl('repoUrl'),
  optionalUrl('credentialUrl'),

  body('issuer').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('issueDate').optional({ values: 'null' }).isISO8601().toDate(),
  body('expiryDate').optional({ values: 'null' }).isISO8601().toDate(),
  body('credentialId').optional({ values: 'null' }).trim().isLength({ max: 100 }),

  body('proficiency')
    .optional({ values: 'null' })
    .isIn(['BASIC', 'CONVERSATIONAL', 'PROFESSIONAL', 'NATIVE']),
];

export const addItemRules = [collectionParam, ...itemFields];
export const updateItemRules = [collectionParam, objectIdParam('itemId', 'entry'), ...itemFields];
export const removeItemRules = [collectionParam, objectIdParam('itemId', 'entry')];

/* ------------------------------------------------------------ parsed draft */

/**
 * ★ Applying a parsed draft requires an explicit list of paths.
 *
 * `isArray({min: 1})` is the rule that makes "never force AI extracted values" enforceable:
 * there is no request shape that means "apply whatever you found".
 */
export const applyDraftRules = [
  body('paths')
    .isArray({ min: 1, max: 60 })
    .withMessage('Choose at least one field to apply'),
  body('paths.*')
    .trim()
    .notEmpty()
    // Dot paths only, no `$` and no array indices — this string is fed to `profile.set()`.
    .matches(/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/)
    .withMessage('Not a valid field path'),
];

export const candidateIdRules = [objectIdParam('id', 'candidate')];

/* --------------------------------------------------------- candidate search */

/**
 * Employer-facing search filters.
 *
 * Experience arrives in YEARS and is converted to MONTHS here, at the boundary — the same
 * convention as job search, so nothing below this line has to wonder about the unit.
 */
export const candidateSearchRules = [
  ...paginationRules(['updatedAt', 'totalExperienceMonths', 'profileCompleteness']),
  query('q').optional().trim().isLength({ max: LIMITS.MAX_SEARCH_LENGTH }).escape(),
  query('location').optional().trim().isLength({ max: 100 }).escape(),
  arrayQuery('skills', { max: 15 }),
  arrayQuery('availability', { max: AVAILABILITY_VALUES.length, allowed: AVAILABILITY_VALUES }),
  arrayQuery('workModes', { max: WORK_MODE_VALUES.length, allowed: WORK_MODE_VALUES }),
  booleanQuery('willingToRelocate'),

  query('minExpYears')
    .optional()
    .toInt()
    .isInt({ min: 0, max: LIMITS.MAX_EXPERIENCE_YEARS_FILTER })
    .customSanitizer((v) => (v == null ? v : v * 12)),
  query('maxExpYears')
    .optional()
    .toInt()
    .isInt({ min: 0, max: LIMITS.MAX_EXPERIENCE_YEARS_FILTER })
    .customSanitizer((v) => (v == null ? v : v * 12)),

  query('maxSalary').optional().toInt().isInt({ min: 0 }),
  query('maxNoticePeriodDays')
    .optional()
    .toInt()
    .isInt({ min: 0, max: LIMITS.MAX_NOTICE_PERIOD_DAYS }),
  query('sort').optional().isIn(['-updatedAt', '-totalExperienceMonths', '-profileCompleteness']),
];
