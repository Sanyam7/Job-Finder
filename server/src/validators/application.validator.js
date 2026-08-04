import { body, query } from 'express-validator';
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_VALUES,
  CURRENCY_VALUES,
  INTERVIEW_MODE,
  INTERVIEW_MODE_VALUES,
  LIMITS,
  PATTERNS,
  SALARY_PERIOD_VALUES,
} from '@verihire/shared';
import {
  arrayQuery,
  dateQuery,
  idArrayBody,
  objectIdBody,
  objectIdParam,
  paginationRules,
  searchRule,
} from './common.validator.js';

const REJECTION_CATEGORIES = ['NOT_A_FIT', 'ROLE_FILLED', 'INCOMPLETE', 'OTHER'];

/* -------------------------------------------------------------------- apply */

export const applyRules = [
  objectIdBody('jobId'),

  body('coverLetter')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: LIMITS.MAX_COVER_LETTER_LENGTH })
    .withMessage(`Keep your cover letter under ${LIMITS.MAX_COVER_LETTER_LENGTH} characters`),

  body('expectedSalary.min').optional({ values: 'null' }).toFloat().isFloat({ min: 0 }),
  body('expectedSalary.max')
    .optional({ values: 'null' })
    .toFloat()
    .isFloat({ min: 0 })
    .custom((value, { req }) => {
      const min = req.body?.expectedSalary?.min;
      if (min != null && value != null && Number(value) < Number(min)) {
        throw new Error('Maximum expected salary cannot be below the minimum');
      }
      return true;
    }),
  body('expectedSalary.currency').optional().isIn(CURRENCY_VALUES),
  body('expectedSalary.period').optional().isIn(SALARY_PERIOD_VALUES),

  body('noticePeriodDays')
    .optional({ values: 'null' })
    .toInt()
    .isInt({ min: 0, max: LIMITS.MAX_NOTICE_PERIOD_DAYS })
    .withMessage(`Notice period must be between 0 and ${LIMITS.MAX_NOTICE_PERIOD_DAYS} days`),

  body('answers').optional().isArray({ max: 20 }),
  body('answers.*.question').optional().trim().isLength({ max: 300 }),
  body('answers.*.answer').optional().trim().isLength({ max: 1000 }),

  body('source').optional().isIn(['DIRECT', 'SEARCH', 'RECOMMENDATION']),
];

/* --------------------------------------------------------------------- ids */

export const applicationIdRules = [objectIdParam('id', 'application')];

/* ------------------------------------------------------------ status change */

/**
 * Rejection reason length is a floor, not just a ceiling.
 *
 * "no" is technically a reason. Requiring a real sentence is the difference between a
 * candidate learning something and a candidate being ghosted with extra steps — and the
 * whole product is a bet that a job board can be less hostile than that.
 */
const rejectionReasonRule = (field = 'rejectionReason') =>
  body(field)
    .if(body('status').equals(APPLICATION_STATUS.REJECTED))
    .trim()
    .notEmpty()
    .withMessage('A reason is required when rejecting an application')
    .isLength({
      min: LIMITS.MIN_REJECTION_REASON_LENGTH,
      max: LIMITS.MAX_REJECTION_REASON_LENGTH,
    })
    .withMessage(
      `Give the candidate at least ${LIMITS.MIN_REJECTION_REASON_LENGTH} characters of feedback`,
    );

export const changeStatusRules = [
  objectIdParam('id', 'application'),
  body('status')
    .isIn(APPLICATION_STATUS_VALUES)
    .withMessage(`Status must be one of: ${APPLICATION_STATUS_VALUES.join(', ')}`),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: LIMITS.MAX_EMPLOYER_NOTES_LENGTH }),
  rejectionReasonRule(),
  body('rejectionCategory').optional().isIn(REJECTION_CATEGORIES),
  body('isCandidateVisible').optional().isBoolean().toBoolean(),
];

export const rejectRules = [
  objectIdParam('id', 'application'),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('A reason is required when rejecting an application')
    .isLength({
      min: LIMITS.MIN_REJECTION_REASON_LENGTH,
      max: LIMITS.MAX_REJECTION_REASON_LENGTH,
    })
    .withMessage(
      `Give the candidate at least ${LIMITS.MIN_REJECTION_REASON_LENGTH} characters of feedback`,
    ),
  body('category').optional().isIn(REJECTION_CATEGORIES),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: LIMITS.MAX_EMPLOYER_NOTES_LENGTH }),
];

export const shortlistRules = [
  objectIdParam('id', 'application'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: LIMITS.MAX_EMPLOYER_NOTES_LENGTH }),
];

export const hireRules = shortlistRules;

export const withdrawRules = [
  objectIdParam('id', 'application'),
  body('reason').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

export const interviewRules = [
  objectIdParam('id', 'application'),

  body('scheduledAt')
    .isISO8601()
    .withMessage('Enter a valid date and time')
    .toDate()
    .custom((value) => {
      // A small grace window rather than `> now`: an employer logging an interview they
      // just agreed on the phone should not be refused because the clock moved.
      if (value.getTime() < Date.now() - 60 * 60 * 1000) {
        throw new Error('The interview time cannot be in the past');
      }
      const oneYearAhead = Date.now() + 365 * 86_400_000;
      if (value.getTime() > oneYearAhead) throw new Error('That date is too far in the future');
      return true;
    }),

  body('mode').isIn(INTERVIEW_MODE_VALUES).withMessage('Choose online, on-site or phone'),

  /**
   * An online interview without a link is the single most common way a candidate misses
   * one. Conditionally required rather than "optional and hope".
   */
  body('meetingLink')
    .if(body('mode').equals(INTERVIEW_MODE.ONLINE))
    .trim()
    .notEmpty()
    .withMessage('Add the meeting link for an online interview')
    .custom((value) => {
      if (!PATTERNS.URL.test(value)) throw new Error('Enter a valid meeting URL');
      return true;
    }),

  body('location')
    .if(body('mode').equals(INTERVIEW_MODE.ONSITE))
    .trim()
    .notEmpty()
    .withMessage('Add the address for an on-site interview')
    .isLength({ max: 300 }),

  body('round').optional().toInt().isInt({ min: 1, max: 10 }),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: LIMITS.MAX_EMPLOYER_NOTES_LENGTH }),
];

export const notesRules = [
  objectIdParam('id', 'application'),
  body('notes')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: LIMITS.MAX_EMPLOYER_NOTES_LENGTH }),
  body('rating').optional({ values: 'null' }).toInt().isInt({ min: 1, max: 5 }),
  body('tags').optional().isArray({ max: 10 }),
  body('tags.*').optional().trim().isLength({ min: 1, max: 40 }),
];

export const bulkStatusRules = [
  idArrayBody('ids'),
  body('status')
    .isIn([
      APPLICATION_STATUS.VIEWED,
      APPLICATION_STATUS.SHORTLISTED,
      APPLICATION_STATUS.REJECTED,
    ])
    .withMessage('Bulk actions support viewing, shortlisting and rejecting'),
  body('reason')
    .if(body('status').equals(APPLICATION_STATUS.REJECTED))
    .trim()
    .notEmpty()
    .withMessage('A reason is required when rejecting applications')
    .isLength({
      min: LIMITS.MIN_REJECTION_REASON_LENGTH,
      max: LIMITS.MAX_REJECTION_REASON_LENGTH,
    }),
  body('category').optional().isIn(REJECTION_CATEGORIES),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: LIMITS.MAX_EMPLOYER_NOTES_LENGTH }),
];

/* -------------------------------------------------------------------- lists */

export const candidateListRules = [
  ...paginationRules(['createdAt', 'statusChangedAt']),
  arrayQuery('status', { max: 7, allowed: APPLICATION_STATUS_VALUES }),
  query('sort').optional().isIn(['newest', 'oldest']),
  searchRule(),
];

export const employerListRules = [
  ...paginationRules(['createdAt', 'statusChangedAt']),
  arrayQuery('status', { max: 7, allowed: APPLICATION_STATUS_VALUES }),
  query('job').optional().trim().matches(PATTERNS.OBJECT_ID).withMessage('Not a valid job'),
  query('minExpYears')
    .optional()
    .toInt()
    .isInt({ min: 0, max: LIMITS.MAX_EXPERIENCE_YEARS_FILTER })
    // Converted at the boundary so nothing downstream has to wonder about the unit.
    .customSanitizer((v) => (v == null ? v : v * 12)),
  query('minRating').optional().toInt().isInt({ min: 1, max: 5 }),
  query('sort').optional().isIn(['newest', 'oldest', 'experience', 'match', 'rating']),
  dateQuery('from'),
  dateQuery('to'),
  searchRule(),
];

export const jobApplicationsRules = [objectIdParam('id', 'job'), ...employerListRules];
