import { Router } from 'express';
import { ROLES } from '@verihire/shared';
import * as employerController from '../../controllers/employer.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { uploadLimiter } from '../../middlewares/rateLimit.middleware.js';
import {
  uploadImage,
  uploadDocuments,
  verifyFileSignature,
  requireFile,
  IMAGE_TYPES,
  DOCUMENT_TYPES,
} from '../../middlewares/upload.middleware.js';
import * as rules from '../../validators/employer.validator.js';
import { paginationRules, enumQuery, searchRule } from '../../validators/common.validator.js';

const router = Router();

/* ------------------------------------------------------------------ public */

router.get('/', validate(rules.publicCompanyRules), employerController.listPublicCompanies);

/* --------------------------------------------------------------- protected */

router.use(authenticate, authorize(ROLES.EMPLOYER));

router.get('/me', employerController.getMyCompany);
router.patch('/me', validate(rules.updateCompanyRules), employerController.updateMyCompany);

router.post(
  '/me/logo',
  uploadLimiter,
  uploadImage,
  requireFile,
  verifyFileSignature(IMAGE_TYPES),
  employerController.uploadLogo,
);

router.post(
  '/me/cover',
  uploadLimiter,
  uploadImage,
  requireFile,
  verifyFileSignature(IMAGE_TYPES),
  employerController.uploadCover,
);

router.post(
  '/me/documents',
  uploadLimiter,
  uploadDocuments,
  requireFile,
  verifyFileSignature(DOCUMENT_TYPES),
  validate(rules.documentTypeRules),
  employerController.uploadDocuments,
);

router.delete(
  '/me/documents/:docId',
  validate(rules.documentIdRules),
  employerController.deleteDocument,
);

/**
 * ★ Gate 1 entry point.
 *
 * Deliberately NOT behind `requireVerifiedEmployer` — this is the route an unverified
 * employer uses to become verified. Gating it would be a deadlock.
 */
router.post('/me/verification', employerController.submitVerification);
router.get('/me/verification', employerController.getVerificationStatus);

/** Their own jobs, at any status. Also reachable while unverified — drafting is allowed. */
router.get(
  '/me/jobs',
  validate([
    ...paginationRules(['createdAt', 'updatedAt', 'title', 'deadline']),
    enumQuery('status', ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']),
    searchRule(),
  ]),
  employerController.getMyJobs,
);

export default router;
