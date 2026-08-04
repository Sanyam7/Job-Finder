import { Router } from 'express';
import { ROLES } from '@verihire/shared';
import * as applicationController from '../../controllers/application.controller.js';
import { authenticate, requireVerifiedEmail } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { applyLimiter } from '../../middlewares/rateLimit.middleware.js';
import * as rules from '../../validators/application.validator.js';

const router = Router();

router.use(authenticate);

/* ---------------------------------------------------------------- candidate */

/**
 * ★ Apply.
 *
 * `requireVerifiedEmail` is the candidate-side mirror of employer verification: an
 * unverified address is a throwaway address, and an employer who waited days for a human to
 * check their company should not have their inbox filled from one.
 *
 * The job's own eligibility is NOT checked here — it is re-read inside the service's
 * transaction, because a middleware check would be one more place for the gate to be
 * implemented slightly differently.
 */
router.post(
  '/',
  authorize(ROLES.CANDIDATE),
  requireVerifiedEmail,
  applyLimiter,
  validate(rules.applyRules),
  applicationController.apply,
);

router.get(
  '/me',
  authorize(ROLES.CANDIDATE),
  validate(rules.candidateListRules),
  applicationController.listMine,
);

router.get('/me/stats', authorize(ROLES.CANDIDATE), applicationController.myStats);

router.post(
  '/:id/withdraw',
  authorize(ROLES.CANDIDATE),
  validate(rules.withdrawRules),
  applicationController.withdraw,
);

/* ----------------------------------------------------------------- employer */

/**
 * Declared before `/:id` so "employer" is never parsed as an application id.
 * Express matches in declaration order, and an id-shaped route placed first silently
 * swallows every static sibling below it.
 */
router.get(
  '/employer',
  authorize(ROLES.EMPLOYER, ROLES.ADMIN),
  validate(rules.employerListRules),
  applicationController.listForEmployer,
);

router.get(
  '/employer/funnel',
  authorize(ROLES.EMPLOYER, ROLES.ADMIN),
  applicationController.employerFunnel,
);

router.get(
  '/job/:id',
  authorize(ROLES.EMPLOYER, ROLES.ADMIN),
  validate(rules.jobApplicationsRules),
  applicationController.listForJob,
);

router.patch(
  '/bulk/status',
  authorize(ROLES.EMPLOYER, ROLES.ADMIN),
  validate(rules.bulkStatusRules),
  applicationController.bulkChangeStatus,
);

/* -------------------------------------------------------------------- shared */

/** The DTO is chosen from the caller's proven relationship to the row, not from their role. */
router.get('/:id', validate(rules.applicationIdRules), applicationController.getOne);

router.get(
  '/:id/timeline',
  validate(rules.applicationIdRules),
  applicationController.getTimeline,
);

/** Audit-logged. A resume carries a home address and a phone number. */
router.get('/:id/resume', validate(rules.applicationIdRules), applicationController.getResume);

/* --------------------------------------------------- employer state changes */

const employerOnly = [authorize(ROLES.EMPLOYER, ROLES.ADMIN)];

router.patch(
  '/:id/status',
  ...employerOnly,
  validate(rules.changeStatusRules),
  applicationController.changeStatus,
);

router.post(
  '/:id/view',
  ...employerOnly,
  validate(rules.applicationIdRules),
  applicationController.markViewed,
);

router.post(
  '/:id/shortlist',
  ...employerOnly,
  validate(rules.shortlistRules),
  applicationController.shortlist,
);

router.post(
  '/:id/reject',
  ...employerOnly,
  validate(rules.rejectRules),
  applicationController.reject,
);

router.post('/:id/hire', ...employerOnly, validate(rules.hireRules), applicationController.hire);

router.post(
  '/:id/interview',
  ...employerOnly,
  validate(rules.interviewRules),
  applicationController.scheduleInterview,
);

router.patch(
  '/:id/notes',
  ...employerOnly,
  validate(rules.notesRules),
  applicationController.updateNotes,
);

export default router;
