import { Router } from 'express';
import * as bookmarkController from '../../controllers/bookmark.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as rules from '../../validators/notification.validator.js';

const router = Router();

router.use(authenticate);

/**
 * Role is checked in the service, not here.
 *
 * Whether you may save a thing depends on *what* it is — candidates save jobs, employers
 * save candidates — so it is one check against the entity type rather than two routers that
 * would each need the visibility gate reimplemented.
 */
router.post('/', validate(rules.toggleBookmarkRules), bookmarkController.toggle);

router.get('/', validate(rules.listBookmarkRules), bookmarkController.list);

// Declared before `/:id` so "collections" is never parsed as a bookmark id.
router.get(
  '/collections',
  validate(rules.bookmarkCollectionsRules),
  bookmarkController.collections,
);

router.patch('/:id', validate(rules.updateBookmarkRules), bookmarkController.update);

export default router;
