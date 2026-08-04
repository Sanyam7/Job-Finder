import { Router } from 'express';
import { ROLES } from '@verihire/shared';
import * as adminController from '../../controllers/admin.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as adminRules from '../../validators/admin.validator.js';
import * as employerRules from '../../validators/employer.validator.js';

const router = Router();

/**
 * Every route here is admin-only.
 *
 * The guard is applied once at the router level rather than per route — a new endpoint
 * added below is protected by default, which is the safe direction to fail. Forgetting to
 * add `authorize(ADMIN)` to one route in a list of twenty is how moderation endpoints end
 * up publicly reachable.
 */
router.use(authenticate, authorize(ROLES.ADMIN));

/* ------------------------------------------------------------- dashboard */

router.get('/dashboard', adminController.getDashboard);
router.get('/audit-logs', validate(adminRules.auditQueryRules), adminController.getAuditLogs);

/* ------------------------------------------------------------- analytics */

const rangeRules = validate(adminRules.analyticsRangeRules);

router.get('/analytics/overview', rangeRules, adminController.getOverview);
router.get('/analytics/users', rangeRules, adminController.getUserAnalytics);
router.get('/analytics/jobs', rangeRules, adminController.getJobAnalytics);
router.get('/analytics/applications', rangeRules, adminController.getApplicationAnalytics);

/** ★ Gate-1 and gate-2 throughput — is manual review keeping up, or is it the bottleneck? */
router.get('/analytics/moderation', rangeRules, adminController.getModerationAnalytics);

/**
 * ★ On-demand invariant check.
 *
 * Runs the nightly reconciliation in dry-run mode. A non-zero result means a write path let
 * the visibility flag drift from the truth, and an admin should not have to wait for the
 * small hours to ask that question.
 */
router.get('/health/visibility', adminController.checkVisibilityDrift);

/* ---------------------------------------- ★ GATE 1 — employer verification */

router.get('/employers', validate(employerRules.employerQueueRules), adminController.listEmployers);
router.get('/employers/:id', validate(employerRules.employerIdRules), adminController.getEmployerDetail);
router.get(
  '/employers/:id/documents/:docId',
  validate(adminRules.documentViewRules),
  adminController.viewEmployerDocument,
);

router.post(
  '/employers/:id/verify',
  validate(employerRules.verifyEmployerRules),
  adminController.verifyEmployer,
);
router.post(
  '/employers/:id/reject',
  validate(employerRules.rejectEmployerRules),
  adminController.rejectEmployer,
);
router.post(
  '/employers/:id/suspend',
  validate(employerRules.suspendEmployerRules),
  adminController.suspendEmployer,
);
router.post(
  '/employers/:id/restore',
  validate(employerRules.employerIdRules),
  adminController.restoreEmployer,
);

/* ------------------------------------------------- ★ GATE 2 — job approval */

// Bulk route is declared before `/jobs/:id` so "bulk" is not parsed as an id.
router.post('/jobs/bulk/approve', validate(adminRules.bulkApproveRules), adminController.bulkApproveJobs);

router.get('/jobs', validate(adminRules.jobQueueRules), adminController.listJobs);
router.get('/jobs/:id', validate(adminRules.jobIdRules), adminController.getJobDetail);
router.post('/jobs/:id/approve', validate(adminRules.approveJobRules), adminController.approveJob);
router.post('/jobs/:id/reject', validate(adminRules.rejectJobRules), adminController.rejectJob);

/* ------------------------------------------------------------------ users */

router.get('/users', validate(adminRules.userQueryRules), adminController.listUsers);
router.post('/users/:id/suspend', validate(adminRules.suspendUserRules), adminController.suspendUser);
router.post('/users/:id/restore', validate(adminRules.userIdRules), adminController.restoreUser);

export default router;
