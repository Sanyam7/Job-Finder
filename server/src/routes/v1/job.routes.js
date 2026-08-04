import { Router } from 'express';
import { ROLES } from '@verihire/shared';
import * as jobController from '../../controllers/job.controller.js';
import * as applicationController from '../../controllers/application.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';
import { requireVerifiedEmployer } from '../../middlewares/verifiedEmployer.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { jobCreateLimiter } from '../../middlewares/rateLimit.middleware.js';
import * as rules from '../../validators/job.validator.js';
import * as applicationRules from '../../validators/application.validator.js';

const router = Router();

router.use(authenticate, authorize(ROLES.EMPLOYER, ROLES.ADMIN));

/**
 * ★ THE USP GATE, applied route by route.
 *
 * Note what is NOT gated: creating and editing a draft. An employer waiting on verification
 * can write their listings, so the moment they are approved they are ready to publish —
 * blocking that would cost us employers for no safety benefit, because a draft is invisible
 * either way.
 *
 * What IS gated is `submit` — the only transition that can ever lead to a public listing.
 */
router.post(
  '/',
  jobCreateLimiter,
  requireVerifiedEmployer,
  validate(rules.createJobRules),
  jobController.createJob,
);

router.get('/:id', validate(rules.jobIdRules), jobController.getJobForOwner);

/**
 * Applicants for one job, plus that job's funnel.
 *
 * Lives here as well as under `/applications/job/:id` because this is where an employer
 * looks for it; both paths run the identical controller, so there is one implementation and
 * two names rather than two implementations.
 */
router.get(
  '/:id/applications',
  validate(applicationRules.jobApplicationsRules),
  applicationController.listForJob,
);

router.patch(
  '/:id',
  requireVerifiedEmployer,
  validate(rules.updateJobRules),
  jobController.updateJob,
);

/** ★ The single transition that can make a listing public. */
router.post(
  '/:id/submit',
  requireVerifiedEmployer,
  validate(rules.jobIdRules),
  jobController.submitJob,
);

router.post('/:id/archive', validate(rules.jobIdRules), jobController.archiveJob);
router.post(
  '/:id/clone',
  requireVerifiedEmployer,
  validate(rules.jobIdRules),
  jobController.cloneJob,
);
router.delete('/:id', validate(rules.jobIdRules), jobController.deleteJob);

export default router;
