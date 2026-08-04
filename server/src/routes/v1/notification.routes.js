import { Router } from 'express';
import * as notificationController from '../../controllers/notification.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as rules from '../../validators/notification.validator.js';

const router = Router();

/**
 * Every route is scoped to the signed-in user inside the service — the recipient is part of
 * the query filter, never an `if` after loading a row. A filter that cannot match someone
 * else's notification is a stronger guarantee than a check a refactor could drop.
 */
router.use(authenticate);

router.get('/', validate(rules.listNotificationRules), notificationController.list);

/** Polled by the bell; deliberately cheap. */
router.get('/summary', notificationController.summary);

/** The delivery table, so the preferences UI and the server agree by construction. */
router.get('/config', notificationController.config);

router.patch('/read-all', notificationController.markAllRead);
router.delete('/read', notificationController.clearRead);

router.patch('/:id/read', validate(rules.notificationIdRules), notificationController.markRead);
router.delete('/:id', validate(rules.notificationIdRules), notificationController.remove);

export default router;
