import { Router } from 'express';
import { LIMITS, ROLES } from '@verihire/shared';
import * as candidateController from '../../controllers/candidate.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { searchLimiter, uploadLimiter } from '../../middlewares/rateLimit.middleware.js';
import {
  uploadImage,
  uploadResume,
  verifyFileSignature,
  requireFile,
  handleUploadErrors,
  IMAGE_TYPES,
  RESUME_TYPES,
} from '../../middlewares/upload.middleware.js';
import * as rules from '../../validators/candidate.validator.js';

const router = Router();

router.use(authenticate);

/* ------------------------------------------------------------------ own profile */

const ownProfile = [authorize(ROLES.CANDIDATE)];

router.get('/me', ...ownProfile, candidateController.getMyProfile);
router.get('/me/dashboard', ...ownProfile, candidateController.getDashboard);

router.patch(
  '/me',
  ...ownProfile,
  validate(rules.updateProfileRules),
  candidateController.updateMyProfile,
);

router.patch(
  '/me/preferences',
  ...ownProfile,
  validate(rules.preferencesRules),
  candidateController.updatePreferences,
);

/** ★ The candidate's own discoverability switch — the mirror of employer verification. */
router.patch(
  '/me/visibility',
  ...ownProfile,
  validate(rules.visibilityRules),
  candidateController.updateVisibility,
);

router.put('/me/skills', ...ownProfile, validate(rules.skillsRules), candidateController.setSkills);

/* ------------------------------------------------------------------ avatar */

router.post(
  '/me/avatar',
  ...ownProfile,
  uploadLimiter,
  uploadImage,
  handleUploadErrors(LIMITS.MAX_IMAGE_BYTES),
  requireFile,
  // Bytes, not the Content-Type header — a renamed .exe is rejected here.
  verifyFileSignature(IMAGE_TYPES),
  candidateController.uploadAvatar,
);

router.delete('/me/avatar', ...ownProfile, candidateController.removeAvatar);

/* ------------------------------------------------------------------ resume */

router.post(
  '/me/resume',
  ...ownProfile,
  uploadLimiter,
  uploadResume,
  handleUploadErrors(LIMITS.MAX_RESUME_BYTES),
  requireFile,
  verifyFileSignature(RESUME_TYPES),
  candidateController.uploadResume,
);

router.delete('/me/resume', ...ownProfile, candidateController.removeResume);
router.get('/me/resume/url', ...ownProfile, candidateController.getMyResumeUrl);

/* --------------------------------------------------- ★ the parsed draft (ADR-006) */

/**
 * Extraction never writes to the live profile. These three endpoints are the only path from
 * `parsedDraft` into it, and the apply route requires an explicit list of field paths — there
 * is deliberately no request shape meaning "apply everything you found".
 */
router.get('/me/resume/draft', ...ownProfile, candidateController.getParsedDraft);

router.post(
  '/me/resume/draft/apply',
  ...ownProfile,
  validate(rules.applyDraftRules),
  candidateController.applyParsedDraft,
);

router.delete('/me/resume/draft', ...ownProfile, candidateController.discardParsedDraft);

/* -------------------------------------------------------------- collections */

router.post(
  '/me/:collection',
  ...ownProfile,
  validate(rules.addItemRules),
  candidateController.addItem,
);

router.patch(
  '/me/:collection/:itemId',
  ...ownProfile,
  validate(rules.updateItemRules),
  candidateController.updateItem,
);

router.delete(
  '/me/:collection/:itemId',
  ...ownProfile,
  validate(rules.removeItemRules),
  candidateController.removeItem,
);

/* ------------------------------------------------------------ employer view */

/**
 * ★ The candidate database.
 *
 * Declared before `/:id` so "search" is not parsed as an id. Every result composes
 * `buildDiscoverableFilter()` in the repository — an employer cannot reach a candidate who
 * did not opt in, and the card shape carries no contact details at all.
 */
router.get(
  '/search',
  authorize(ROLES.EMPLOYER, ROLES.ADMIN),
  searchLimiter,
  validate(rules.candidateSearchRules),
  candidateController.searchCandidates,
);

/**
 * Declared last so none of the `/me/...` routes above can be swallowed by `:id`.
 * Access is proved in the service: opted into search, or applied to one of your jobs.
 */
router.get(
  '/:id',
  authorize(ROLES.EMPLOYER, ROLES.ADMIN),
  validate(rules.candidateIdRules),
  candidateController.getForEmployer,
);

export default router;
