import { Router } from 'express';
import * as jobController from '../../controllers/job.controller.js';
import * as employerController from '../../controllers/employer.controller.js';
import * as publicController from '../../controllers/public.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { searchLimiter, contactLimiter } from '../../middlewares/rateLimit.middleware.js';
import * as jobRules from '../../validators/job.validator.js';
import * as employerRules from '../../validators/employer.validator.js';

/**
 * Unauthenticated surface.
 *
 * Everything below composes a gate filter in its repository — `buildPublicJobFilter()` for
 * jobs, `buildPublicEmployerFilter()` for companies. There is no endpoint in this router
 * that can return a pending, rejected, archived or suspended record.
 */
const router = Router();

/* -------------------------------------------------------------------- jobs */

router.get('/jobs', searchLimiter, validate(jobRules.jobSearchRules), jobController.searchPublicJobs);
router.get('/jobs/filters', searchLimiter, validate(jobRules.jobSearchRules), jobController.getJobFacets);
router.get('/jobs/:slug', jobController.getPublicJob);
router.get('/jobs/:slug/similar', jobController.getSimilarJobs);

/* --------------------------------------------------------------- companies */

router.get(
  '/companies',
  searchLimiter,
  validate(employerRules.publicCompanyRules),
  employerController.listPublicCompanies,
);
router.get('/companies/:slug', employerController.getPublicCompany);

/* ------------------------------------------------------------------- meta */

router.get('/stats', publicController.getPlatformStats);
router.post('/contact', contactLimiter, validate(publicController.contactRules), publicController.submitContact);

export default router;
