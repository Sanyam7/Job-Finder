import { ACCOUNT_STATUS, ERROR_CODES, ROLES, VERIFICATION_STATUS } from '@verihire/shared';
import { employerRepository } from '../repositories/employer.repository.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';
import logger from '../config/logger.js';

/**
 * ★★★ THE USP WRITE-GATE ★★★
 *
 * Every route that lets an employer affect what candidates see sits behind this. An
 * employer account exists from sign-up and can edit its company profile and draft jobs
 * freely; nothing beyond that unlocks until a human admin has approved the company.
 *
 * The rejection carries enough context (`verificationStatus`, `rejectionReason`,
 * `canResubmit`) for the SPA to render the correct locked state immediately, rather than
 * showing a bare 403 and then making a second request to find out why.
 *
 * @type {import('express').RequestHandler}
 */
export const requireVerifiedEmployer = asyncHandler(async (req, _res, next) => {
  if (!req.user) {
    throw new UnauthorizedError(ERROR_CODES.TOKEN_MISSING, MESSAGES.ERROR.UNAUTHORIZED);
  }

  // Admins are moderators, not employers — they never pass through this gate.
  if (req.user.role !== ROLES.EMPLOYER) {
    throw new ForbiddenError(ERROR_CODES.INSUFFICIENT_PERMISSIONS, MESSAGES.ERROR.FORBIDDEN);
  }

  const employer = await employerRepository.findByOwner(req.user.id, {
    select:
      '_id companyName slug verificationStatus status verification.rejectionReason ' +
      'verification.rejectionCategory verification.submittedAt suspension.reason logo',
  });

  if (!employer) {
    throw new NotFoundError(
      ERROR_CODES.EMPLOYER_PROFILE_MISSING,
      'Complete your company profile before continuing.',
    );
  }

  if (employer.status === ACCOUNT_STATUS.SUSPENDED) {
    throw new ForbiddenError(ERROR_CODES.EMPLOYER_SUSPENDED, MESSAGES.EMPLOYER.SUSPENDED, {
      status: employer.status,
      reason: employer.suspension?.reason ?? null,
    });
  }

  if (employer.verificationStatus !== VERIFICATION_STATUS.VERIFIED) {
    logger.debug('Blocked unverified employer', {
      requestId: req.id,
      employerId: String(employer._id),
      status: employer.verificationStatus,
      path: req.originalUrl,
    });

    throw new ForbiddenError(ERROR_CODES.EMPLOYER_NOT_VERIFIED, MESSAGES.EMPLOYER.NOT_VERIFIED, {
      verificationStatus: employer.verificationStatus,
      rejectionReason: employer.verification?.rejectionReason ?? null,
      rejectionCategory: employer.verification?.rejectionCategory ?? null,
      submittedAt: employer.verification?.submittedAt ?? null,
      canResubmit: employer.verificationStatus !== VERIFICATION_STATUS.PENDING,
    });
  }

  // Downstream handlers get the company for free — no second lookup.
  req.employer = employer;
  return next();
});

/**
 * Loads the caller's company without gating on verification.
 *
 * For routes an unverified employer must still reach: the company profile editor, the
 * verification wizard, the status page, and their own draft jobs.
 *
 * @type {import('express').RequestHandler}
 */
export const loadEmployer = asyncHandler(async (req, _res, next) => {
  if (!req.user || req.user.role !== ROLES.EMPLOYER) {
    throw new ForbiddenError(ERROR_CODES.INSUFFICIENT_PERMISSIONS, MESSAGES.ERROR.FORBIDDEN);
  }

  const employer = await employerRepository.findByOwner(req.user.id, { lean: false });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }

  req.employer = employer;
  return next();
});

export default requireVerifiedEmployer;
