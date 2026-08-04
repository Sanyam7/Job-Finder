import { body } from 'express-validator';
import {
  CURRENCY_VALUES,
  EDUCATION_LEVEL_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  INDUSTRIES,
  JOB_SORT_VALUES,
  LIMITS,
  SALARY_PERIOD_VALUES,
  WORK_MODE_VALUES,
} from '@verihire/shared';
import {
  arrayQuery,
  enumQuery,
  objectIdParam,
  paginationRules,
  searchRule,
} from './common.validator.js';
import { query } from 'express-validator';

const stringList = (field, label) =>
  body(field)
    .optional()
    .isArray({ max: LIMITS.MAX_JOB_LIST_ITEMS })
    .withMessage(`At most ${LIMITS.MAX_JOB_LIST_ITEMS} ${label}`)
    .custom((items) => {
      const tooLong = items.find((i) => String(i).length > LIMITS.MAX_JOB_LIST_ITEM_LENGTH);
      if (tooLong) throw new Error(`Each ${label.slice(0, -1)} must be under 300 characters`);
      return true;
    });

const coreJobRules = (required = true) => {
  const opt = (chain) => (required ? chain : chain.optional());

  return [
    opt(
      body('title')
        .trim()
        .notEmpty()
        .withMessage('Job title is required')
        .isLength({ min: LIMITS.MIN_JOB_TITLE_LENGTH, max: LIMITS.MAX_JOB_TITLE_LENGTH }),
    ),

    opt(
      body('description')
        .trim()
        .notEmpty()
        .withMessage('A job description is required')
        .isLength({
          min: LIMITS.MIN_JOB_DESCRIPTION_LENGTH,
          max: LIMITS.MAX_JOB_DESCRIPTION_LENGTH,
        })
        .withMessage(`Describe the role in at least ${LIMITS.MIN_JOB_DESCRIPTION_LENGTH} characters`),
    ),

    opt(body('employmentType').isIn(EMPLOYMENT_TYPE_VALUES).withMessage('Choose an employment type')),
    opt(body('workMode').isIn(WORK_MODE_VALUES).withMessage('Choose remote, hybrid or on-site')),

    opt(
      body('deadline')
        .isISO8601()
        .withMessage('Enter a valid deadline')
        .toDate()
        .custom((value) => {
          if (value <= new Date()) throw new Error('The deadline must be in the future');
          const maxAhead = new Date(Date.now() + LIMITS.MAX_DEADLINE_DAYS_AHEAD * 86_400_000);
          if (value > maxAhead) throw new Error('The deadline is too far in the future');
          return true;
        }),
    ),

    stringList('responsibilities', 'responsibilities'),
    stringList('requirements', 'requirements'),
    stringList('niceToHave', 'items'),
    stringList('benefits', 'benefits'),

    body('skillsRequired')
      .optional()
      .isArray({ max: LIMITS.MAX_JOB_SKILLS })
      .withMessage(`At most ${LIMITS.MAX_JOB_SKILLS} skills`),
    body('skillsRequired.*.name').optional().trim().notEmpty().isLength({ max: 60 }),
    body('skillsRequired.*.isMandatory').optional().isBoolean(),

    body('experience.minMonths')
      .optional({ values: 'null' })
      .toInt()
      .isInt({ min: 0, max: LIMITS.MAX_TOTAL_EXPERIENCE_MONTHS }),
    body('experience.maxMonths')
      .optional({ values: 'null' })
      .toInt()
      .isInt({ min: 0, max: LIMITS.MAX_TOTAL_EXPERIENCE_MONTHS })
      .custom((value, { req }) => {
        const min = req.body?.experience?.minMonths;
        if (min != null && value != null && Number(value) < Number(min)) {
          throw new Error('Maximum experience cannot be below the minimum');
        }
        return true;
      }),

    body('education.level').optional().isIn(EDUCATION_LEVEL_VALUES),
    body('education.fields').optional().isArray({ max: 10 }),

    body('location.city').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('location.state').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('location.country').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('location.isRemoteAnywhere').optional().isBoolean().toBoolean(),

    body('salary.min').optional({ values: 'null' }).toFloat().isFloat({ min: 0 }),
    body('salary.max')
      .optional({ values: 'null' })
      .toFloat()
      .isFloat({ min: 0 })
      .custom((value, { req }) => {
        const min = req.body?.salary?.min;
        if (min != null && value != null && Number(value) < Number(min)) {
          throw new Error('Maximum salary cannot be below the minimum');
        }
        return true;
      }),
    body('salary.currency').optional().isIn(CURRENCY_VALUES),
    body('salary.period').optional().isIn(SALARY_PERIOD_VALUES),
    body('salary.isDisclosed').optional().isBoolean().toBoolean(),

    body('openings')
      .optional()
      .toInt()
      .isInt({ min: LIMITS.MIN_OPENINGS, max: LIMITS.MAX_OPENINGS }),
    body('industry').optional({ values: 'falsy' }).isIn(INDUSTRIES),
    body('department').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  ];
};

export const createJobRules = coreJobRules(true);
export const updateJobRules = [objectIdParam('id', 'job'), ...coreJobRules(false)];
export const jobIdRules = [objectIdParam('id', 'job')];
export const jobSlugRules = [];

/**
 * Public search filters.
 *
 * Experience arrives in YEARS from the UI and is converted to MONTHS here, at the boundary,
 * so nothing below this line ever has to wonder which unit it is holding.
 */
export const jobSearchRules = [
  ...paginationRules(['publishedAt', 'createdAt', 'salary.max']),
  query('q').optional().trim().isLength({ max: LIMITS.MAX_SEARCH_LENGTH }).escape(),
  query('location').optional().trim().isLength({ max: 100 }).escape(),
  arrayQuery('skills', { max: 15 }),
  arrayQuery('workMode', { max: 3, allowed: WORK_MODE_VALUES }),
  arrayQuery('employmentType', { max: 5, allowed: EMPLOYMENT_TYPE_VALUES }),
  arrayQuery('industry', { max: 10 }),
  enumQuery('educationLevel', EDUCATION_LEVEL_VALUES),
  enumQuery('sort', JOB_SORT_VALUES),

  query('minSalary').optional().toInt().isInt({ min: 0 }),
  query('maxSalary').optional().toInt().isInt({ min: 0 }),

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

  query('postedWithinDays').optional().toInt().isInt({ min: 1, max: 90 }),
  searchRule(),
];
