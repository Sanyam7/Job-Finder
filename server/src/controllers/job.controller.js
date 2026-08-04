import { ERROR_CODES } from '@verihire/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { MESSAGES } from '../constants/messages.js';
import { NotFoundError, ForbiddenError } from '../errors/index.js';
import * as jobService from '../services/job.service.js';
import { jobRepository } from '../repositories/job.repository.js';
import { employerRepository } from '../repositories/employer.repository.js';
import { toOwnerJob, toJobCard, toPublicJob } from '../dtos/response/job.response.dto.js';

const actorOf = (req) => ({ id: req.user.id, role: req.user.role, email: req.user.email });

/**
 * Maps the UI's year-based filter names onto the repository's month-based criteria.
 * @param {Record<string, any>} v
 */
const toSearchCriteria = (v = {}) => ({
  keyword: v.q,
  location: v.location,
  skills: v.skills,
  workMode: v.workMode,
  employmentType: v.employmentType,
  industry: v.industry,
  educationLevel: v.educationLevel,
  minSalary: v.minSalary,
  maxSalary: v.maxSalary,
  minExpMonths: v.minExpYears, // already converted to months by the validator
  maxExpMonths: v.maxExpYears,
  postedWithinDays: v.postedWithinDays,
  sort: v.sort,
  page: v.page,
  limit: v.limit,
});

/* ------------------------------------------------------------ employer side */

export const createJob = asyncHandler(async (req, res) => {
  const job = await jobService.createJob(req.validated, actorOf(req));
  return ApiResponse.created(res, toOwnerJob(job), MESSAGES.JOB.CREATED);
});

export const updateJob = asyncHandler(async (req, res) => {
  const { id, ...dto } = req.validated;
  const { job, requiresReReview, changedMaterialFields } = await jobService.updateJob(
    id,
    dto,
    actorOf(req),
  );

  return ApiResponse.ok(
    res,
    { job: toOwnerJob(job), requiresReReview, changedMaterialFields },
    requiresReReview ? MESSAGES.JOB.UPDATED_REVERIFY : MESSAGES.JOB.UPDATED,
  );
});

/** ★ Gate 2 entry point — sits behind `requireVerifiedEmployer` in the router. */
export const submitJob = asyncHandler(async (req, res) => {
  const job = await jobService.submitForReview(req.validated.id, actorOf(req));
  return ApiResponse.ok(res, toOwnerJob(job), MESSAGES.JOB.SUBMITTED);
});

export const archiveJob = asyncHandler(async (req, res) => {
  const job = await jobService.archiveJob(req.validated.id, actorOf(req));
  return ApiResponse.ok(res, toOwnerJob(job), MESSAGES.JOB.ARCHIVED);
});

export const cloneJob = asyncHandler(async (req, res) => {
  const job = await jobService.cloneJob(req.validated.id, actorOf(req));
  return ApiResponse.created(res, toOwnerJob(job), MESSAGES.JOB.CLONED);
});

/**
 * Owner/admin detail view — reachable at any status.
 *
 * Ownership is checked against the database, never against a client-supplied employer id.
 */
export const getJobForOwner = asyncHandler(async (req, res) => {
  const job = await jobRepository.findById(req.validated.id);
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  if (req.user.role !== 'ADMIN') {
    const employer = await employerRepository.findByOwner(req.user.id, { select: '_id' });
    if (!employer || String(job.employer) !== String(employer._id)) {
      throw new ForbiddenError(ERROR_CODES.NOT_RESOURCE_OWNER, 'This job belongs to another company.');
    }
  }

  return ApiResponse.ok(res, toOwnerJob(job), MESSAGES.JOB.FETCHED);
});

export const deleteJob = asyncHandler(async (req, res) => {
  const job = await jobRepository.findById(req.validated.id);
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  if (req.user.role !== 'ADMIN') {
    const employer = await employerRepository.findByOwner(req.user.id, { select: '_id' });
    if (!employer || String(job.employer) !== String(employer._id)) {
      throw new ForbiddenError(ERROR_CODES.NOT_RESOURCE_OWNER, 'This job belongs to another company.');
    }
  }

  await jobRepository.softDelete(req.validated.id, req.user.id);
  return ApiResponse.ok(res, null, MESSAGES.JOB.DELETED);
});

/* -------------------------------------------------------------- public side */

/** ★ Every result here passes through `buildPublicJobFilter()` inside the repository. */
export const searchPublicJobs = asyncHandler(async (req, res) => {
  const result = await jobRepository.search(toSearchCriteria(req.validated), {
    publicOnly: true,
  });

  return ApiResponse.paginated(
    res,
    { ...result, items: result.items.map(toJobCard) },
    MESSAGES.JOB.LIST_FETCHED,
  );
});

/**
 * Public detail by slug.
 *
 * A job that fails either gate returns **404, not 403**. Distinguishing "hidden" from
 * "nonexistent" would let anyone confirm that a specific pending or rejected listing
 * exists — which is exactly the information a scraper building a target list wants.
 */
export const getPublicJob = asyncHandler(async (req, res) => {
  const job = await jobRepository.findPublicBySlug(req.params.slug);
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  // Fire and forget — a view counter must never delay or fail the page.
  jobRepository.incrementViews(String(job._id)).catch(() => {});

  return ApiResponse.ok(res, toPublicJob(job), MESSAGES.JOB.FETCHED);
});

export const getSimilarJobs = asyncHandler(async (req, res) => {
  const job = await jobRepository.findPublicBySlug(req.params.slug);
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  const skills = (job.skillsRequired ?? []).map((s) => s.name);
  const result = await jobRepository.search(
    { skills: skills.slice(0, 5), limit: 7 },
    { publicOnly: true },
  );

  return ApiResponse.ok(
    res,
    result.items.filter((j) => String(j._id) !== String(job._id)).slice(0, 6).map(toJobCard),
    MESSAGES.JOB.LIST_FETCHED,
  );
});

export const getJobFacets = asyncHandler(async (req, res) => {
  const facets = await jobRepository.getFacets(toSearchCriteria(req.validated));
  return ApiResponse.ok(res, facets, MESSAGES.SEARCH.JOBS_FETCHED);
});
