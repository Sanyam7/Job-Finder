import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { MESSAGES } from '../constants/messages.js';
import * as employerService from '../services/employer.service.js';
import * as verificationService from '../services/verification.service.js';
import { employerRepository } from '../repositories/employer.repository.js';
import { jobRepository } from '../repositories/job.repository.js';
import {
  toOwnerEmployer,
  toPublicEmployer,
} from '../dtos/response/employer.response.dto.js';

/** @param {import('express').Request} req */
const actorOf = (req) => ({ id: req.user.id, role: req.user.role, email: req.user.email });
/** @param {import('express').Request} req */
const ctxOf = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? undefined,
  requestId: req.id,
});

export const getMyCompany = asyncHandler(async (req, res) => {
  const employer = await employerService.getOwnProfile(req.user.id);
  return ApiResponse.ok(res, toOwnerEmployer(employer), MESSAGES.EMPLOYER.PROFILE_FETCHED);
});

export const updateMyCompany = asyncHandler(async (req, res) => {
  const { employer, requiresReVerification, changedCore } = await employerService.updateProfile(
    req.user.id,
    req.validated,
  );

  return ApiResponse.ok(
    res,
    { company: toOwnerEmployer(employer), requiresReVerification, changedCore },
    requiresReVerification
      ? MESSAGES.EMPLOYER.PROFILE_UPDATED_REVERIFY
      : MESSAGES.EMPLOYER.PROFILE_UPDATED,
  );
});

export const uploadLogo = asyncHandler(async (req, res) => {
  const employer = await employerService.updateBranding(req.user.id, req.file.buffer, {
    originalName: req.file.originalname,
    kind: 'logo',
  });
  return ApiResponse.ok(res, toOwnerEmployer(employer), MESSAGES.EMPLOYER.LOGO_UPDATED);
});

export const uploadCover = asyncHandler(async (req, res) => {
  const employer = await employerService.updateBranding(req.user.id, req.file.buffer, {
    originalName: req.file.originalname,
    kind: 'cover',
  });
  return ApiResponse.ok(res, toOwnerEmployer(employer), MESSAGES.EMPLOYER.LOGO_UPDATED);
});

export const uploadDocuments = asyncHandler(async (req, res) => {
  const types = req.body.types ? [].concat(req.body.types) : [];
  const employer = await employerService.addDocuments(req.user.id, req.files, types);
  return ApiResponse.created(res, toOwnerEmployer(employer), MESSAGES.EMPLOYER.DOCUMENT_UPLOADED);
});

export const deleteDocument = asyncHandler(async (req, res) => {
  const employer = await employerService.removeDocument(req.user.id, req.validated.docId);
  return ApiResponse.ok(res, toOwnerEmployer(employer), MESSAGES.EMPLOYER.DOCUMENT_REMOVED);
});

/** ★ Enters the company into the admin verification queue. */
export const submitVerification = asyncHandler(async (req, res) => {
  const employer = await employerService.getOwnProfile(req.user.id);
  const updated = await verificationService.submitForVerification(
    String(employer._id),
    actorOf(req),
    ctxOf(req),
  );
  return ApiResponse.ok(
    res,
    toOwnerEmployer(updated),
    MESSAGES.EMPLOYER.VERIFICATION_SUBMITTED,
  );
});

/**
 * Status endpoint the locked dashboard polls.
 * Includes the readiness checklist so the UI can show exactly what is still missing.
 */
export const getVerificationStatus = asyncHandler(async (req, res) => {
  const employer = await employerService.getOwnProfile(req.user.id);
  const readiness = employer.getSubmissionReadiness();

  return ApiResponse.ok(
    res,
    {
      verificationStatus: employer.verificationStatus,
      verification: toOwnerEmployer(employer).verification,
      canPostJobs: employer.canPostJobs,
      readiness,
    },
    MESSAGES.EMPLOYER.VERIFICATION_FETCHED,
  );
});

/** The employer's own jobs — every status, including ones the public cannot see. */
export const getMyJobs = asyncHandler(async (req, res) => {
  const employer = await employerService.getOwnProfile(req.user.id);
  const result = await jobRepository.findByEmployer(String(employer._id), req.validated ?? {});
  return ApiResponse.paginated(res, result, MESSAGES.JOB.LIST_FETCHED);
});

/* ------------------------------------------------------------------ public */

export const getPublicCompany = asyncHandler(async (req, res) => {
  const employer = await employerService.getPublicBySlug(req.params.slug);
  return ApiResponse.ok(res, toPublicEmployer(employer), MESSAGES.EMPLOYER.PROFILE_FETCHED);
});

export const listPublicCompanies = asyncHandler(async (req, res) => {
  const result = await employerRepository.searchPublic(req.validated ?? {});
  return ApiResponse.paginated(
    res,
    { ...result, items: result.items.map(toPublicEmployer) },
    MESSAGES.SEARCH.COMPANIES_FETCHED,
  );
});
