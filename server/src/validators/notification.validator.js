import { body, query } from 'express-validator';
import { BOOKMARK_ENTITY_VALUES, NOTIFICATION_TYPE_VALUES } from '@verihire/shared';
import {
  booleanQuery,
  enumQuery,
  objectIdBody,
  objectIdParam,
  paginationRules,
} from './common.validator.js';

/* --------------------------------------------------------- notifications */

export const listNotificationRules = [
  ...paginationRules(['createdAt']),
  booleanQuery('unreadOnly'),
  enumQuery('type', NOTIFICATION_TYPE_VALUES),
];

export const notificationIdRules = [objectIdParam('id', 'notification')];

/* ------------------------------------------------------------ bookmarks */

export const toggleBookmarkRules = [
  body('entityType')
    .isIn(BOOKMARK_ENTITY_VALUES)
    .withMessage(`Must be one of: ${BOOKMARK_ENTITY_VALUES.join(', ')}`),
  objectIdBody('entityId'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  body('collectionName').optional({ values: 'falsy' }).trim().isLength({ max: 60 }),
];

export const listBookmarkRules = [
  ...paginationRules(['createdAt']),
  enumQuery('entityType', BOOKMARK_ENTITY_VALUES),
  query('collectionName').optional().trim().isLength({ max: 60 }).escape(),
];

export const updateBookmarkRules = [
  objectIdParam('id', 'bookmark'),
  body('note').optional({ values: 'null' }).trim().isLength({ max: 500 }),
  body('collectionName').optional({ values: 'null' }).trim().isLength({ max: 60 }),
];

export const bookmarkCollectionsRules = [enumQuery('entityType', BOOKMARK_ENTITY_VALUES)];
