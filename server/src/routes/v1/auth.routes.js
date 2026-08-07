import { Router } from 'express';
import * as authController from '../../controllers/auth.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
} from '../../middlewares/rateLimit.middleware.js';
import * as rules from '../../validators/auth.validator.js';

const router = Router();

/* ------------------------------------------------------------------- public */

router.post('/register', registerLimiter, validate(rules.registerRules), authController.register);
router.post('/login', loginLimiter, validate(rules.loginRules), authController.login);

// No rate limiter: a legitimate SPA refreshes routinely, and the rotation logic already
// makes a stolen token single-use.
router.post('/refresh', authController.refresh);

// No /verify-email or /resend-verification: accounts are usable the moment they are
// created, so there is nothing to verify or re-send.
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate(rules.forgotPasswordRules),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  passwordResetLimiter,
  validate(rules.resetPasswordRules),
  authController.resetPassword,
);

/* ---------------------------------------------------------------- protected */

router.use(authenticate);

router.get('/me', authController.me);
router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAll);
router.patch(
  '/change-password',
  validate(rules.changePasswordRules),
  authController.changePassword,
);
router.get('/sessions', authController.listSessions);
router.delete('/sessions/:sessionId', validate(rules.sessionIdRules), authController.revokeSession);

export default router;
