import { body } from 'express-validator';
import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUS_VALUES,
  AUDIT_ACTION_VALUES,
  AUDIT_ENTITY_VALUES,
  JOB_REJECTION_CATEGORY,
  JOB_STATUS_VALUES,
  LIMITS,
} from '@verihire/shared';
import {
  dateQuery,
  enumQuery,
  idArrayBody,
  objectIdParam,
  pageLimitRules,
  paginationRules,
  searchRule,
} from './common.validator.js';

export const jobIdRules = [objectIdParam('id', 'job')];

export const jobQueueRules = [
  // `sort` is owned by the enumQuery below — the repository switches on 'newest'.
  ...pageLimitRules(),
  enumQuery('status', JOB_STATUS_VALUES),
  enumQuery('sort', ['oldest', 'newest']),
];

export const approveJobRules = [
  ...jobIdRules,
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: LIMITS.MAX_ADMIN_NOTE_LENGTH }),
];

export const rejectJobRules = [
  ...jobIdRules,
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
    .isIn(Object.values(JOB_REJECTION_CATEGORY)),
];

export const bulkApproveRules = [
  idArrayBody('ids'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: LIMITS.MAX_ADMIN_NOTE_LENGTH }),
];

export const userQueryRules = [
  ...paginationRules(['createdAt', 'lastLoginAt', 'email']),
  searchRule(),
  enumQuery('role', ACCOUNT_ROLES),
  enumQuery('status', ACCOUNT_STATUS_VALUES),
];

export const userIdRules = [objectIdParam('id', 'user')];

export const suspendUserRules = [
  ...userIdRules,
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('A reason is required')
    .isLength({ min: LIMITS.MIN_REJECTION_REASON_LENGTH, max: LIMITS.MAX_ADMIN_NOTE_LENGTH }),
];

export const auditQueryRules = [
  ...paginationRules(['at']),
  enumQuery('entityType', AUDIT_ENTITY_VALUES),
  enumQuery('action', AUDIT_ACTION_VALUES),
  dateQuery('from'),
  dateQuery('to'),
];

export const documentViewRules = [
  objectIdParam('id', 'employer'),
  objectIdParam('docId', 'document'),
];

/* ------------------------------------------------------------- analytics */

/**
 * Range is an allowlist, not a free-form number.
 *
 * An unbounded `?range=100000d` is an unindexed scan of every collection on an admin-only
 * endpoint — cheap to fire, expensive to serve.
 */
export const analyticsRangeRules = [enumQuery('range', ['7d', '30d', '90d', '180d', '365d'])];
