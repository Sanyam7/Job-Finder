import { body } from 'express-validator';
import {
  COMPANY_SIZE_VALUES,
  DOCUMENT_TYPE_VALUES,
  EMPLOYER_REJECTION_CATEGORY,
  INDUSTRIES,
  LIMITS,
  PATTERNS,
} from '@verihire/shared';
import {
  objectIdParam,
  optionalUrl,
  pageLimitRules,
  paginationRules,
  searchRule,
  enumQuery,
} from './common.validator.js';

export const updateCompanyRules = [
  body('companyName')
    .optional()
    .trim()
    .isLength({ min: LIMITS.MIN_COMPANY_NAME_LENGTH, max: LIMITS.MAX_COMPANY_NAME_LENGTH })
    .withMessage('Company name is too short or too long'),

  body('tagline').optional({ values: 'falsy' }).trim().isLength({ max: LIMITS.MAX_TAGLINE_LENGTH }),

  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 50, max: LIMITS.MAX_COMPANY_DESCRIPTION_LENGTH })
    .withMessage('Describe your company in at least 50 characters'),

  body('industry').optional({ values: 'falsy' }).trim().isIn(INDUSTRIES).withMessage('Choose a valid industry'),

  body('foundedYear')
    .optional({ values: 'null' })
    .toInt()
    .isInt({ min: LIMITS.MIN_FOUNDED_YEAR, max: new Date().getFullYear() })
    .withMessage('Enter a valid founding year'),

  body('companySize').optional({ values: 'falsy' }).isIn(COMPANY_SIZE_VALUES),

  optionalUrl('website', { label: 'website URL' }),
  optionalUrl('linkedin', { label: 'LinkedIn company URL', pattern: PATTERNS.LINKEDIN_COMPANY }),

  body('contact.email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Enter a valid company email')
    .normalizeEmail({ gmail_remove_dots: false }),
  body('contact.phone').optional({ values: 'falsy' }).trim().matches(PATTERNS.PHONE).withMessage('Enter a valid phone number'),
  body('contact.hrName').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),

  body('address.city').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('address.state').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('address.country').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('address.line1').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('address.postalCode').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),

  body('gstNumber')
    .optional({ values: 'falsy' })
    .trim()
    .toUpperCase()
    .matches(PATTERNS.GST)
    .withMessage('Enter a valid GSTIN'),
];

export const documentTypeRules = [
  body('types')
    .optional()
    .customSanitizer((value) => (Array.isArray(value) ? value : [value]))
    .custom((values) => {
      const invalid = values.filter((v) => !DOCUMENT_TYPE_VALUES.includes(v));
      if (invalid.length) throw new Error(`Unknown document type: ${invalid[0]}`);
      return true;
    }),
];

export const documentIdRules = [objectIdParam('docId', 'document')];

/* ------------------------------------------------------------------- admin */

export const employerIdRules = [objectIdParam('id', 'employer')];

export const verifyEmployerRules = [
  ...employerIdRules,
  body('checklist').optional().isObject().withMessage('Checklist must be an object'),
  body('checklist.*').optional().isBoolean().withMessage('Each check must be true or false'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: LIMITS.MAX_ADMIN_NOTE_LENGTH }),
];

/**
 * A rejection reason is required and must be substantive.
 *
 * The minimum length is deliberate: "no" is technically a reason and is useless to the
 * employer, who then resubmits unchanged and generates another round of review.
 */
export const rejectEmployerRules = [
  ...employerIdRules,
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('A reason is required')
    .isLength({ min: LIMITS.MIN_REJECTION_REASON_LENGTH, max: LIMITS.MAX_REJECTION_REASON_LENGTH })
    .withMessage(
      `Explain what needs to change in at least ${LIMITS.MIN_REJECTION_REASON_LENGTH} characters`,
    ),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Choose a rejection category')
    .isIn(Object.values(EMPLOYER_REJECTION_CATEGORY)),
];

export const suspendEmployerRules = [
  ...employerIdRules,
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('A reason is required')
    .isLength({ min: LIMITS.MIN_REJECTION_REASON_LENGTH, max: LIMITS.MAX_REJECTION_REASON_LENGTH }),
];

export const employerQueueRules = [
  // `sort` is owned by the enumQuery below — the repository switches on 'newest'.
  ...pageLimitRules(),
  searchRule(),
  enumQuery('status', ['UNSUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED']),
  enumQuery('sort', ['oldest', 'newest']),
];

export const publicCompanyRules = [
  ...paginationRules(['companyName', 'createdAt']),
  searchRule(),
  enumQuery('industry', INDUSTRIES),
  enumQuery('companySize', COMPANY_SIZE_VALUES),
];
