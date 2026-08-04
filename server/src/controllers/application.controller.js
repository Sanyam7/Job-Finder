import { ACTOR_ROLE, ROLES } from '@verihire/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { MESSAGES, format } from '../constants/messages.js';
import * as applicationService from '../services/application.service.js';
import { applicationRepository } from '../repositories/application.repository.js';
import { employerRepository } from '../repositories/employer.repository.js';
import {
  toCandidateRow,
  toCandidateView,
  toEmployerRow,
  toEmployerView,
  toViewerShape,
} from '../dtos/response/application.response.dto.js';

const actorOf = (req) => ({ id: req.user.id, role: req.user.role, email: req.user.email });

const ctxOf = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
  requestId: req.id,
});

/** @param {Record<string, any>} v */
const toEmployerCriteria = (v = {}) => ({
  job: v.job,
  status: v.status,
  search: v.search,
  minExperienceMonths: v.minExpYears, // already months — converted by the validator
  minRating: v.minRating,
  from: v.from,
  to: v.to,
  sort: v.sort,
  page: v.page,
  limit: v.limit,
});

/* ---------------------------------------------------------------- candidate */

/** ★ The apply endpoint. The gate is re-checked inside the service's transaction. */
export const apply = asyncHandler(async (req, res) => {
  const application = await applicationService.applyToJob(req.validated, actorOf(req));
  return ApiResponse.created(res, toCandidateView(application), MESSAGES.APPLICATION.CREATED);
});

export const listMine = asyncHandler(async (req, res) => {
  const result = await applicationService.listForCandidate(req.user.id, {
    status: req.validated.status,
    search: req.validated.search,
    sort: req.validated.sort,
    page: req.validated.page,
    limit: req.validated.limit,
  });

  return ApiResponse.paginated(
    res,
    { ...result, items: result.items.map(toCandidateRow) },
    MESSAGES.APPLICATION.LIST_FETCHED,
  );
});

/** Counters for the candidate dashboard's status tabs. */
export const myStats = asyncHandler(async (req, res) => {
  const counts = await applicationRepository.countForCandidate(req.user.id);
  return ApiResponse.ok(res, counts, MESSAGES.APPLICATION.LIST_FETCHED);
});

export const withdraw = asyncHandler(async (req, res) => {
  const { id, ...payload } = req.validated;
  const application = await applicationService.withdraw(id, payload, actorOf(req));
  return ApiResponse.ok(res, toCandidateView(application), MESSAGES.APPLICATION.WITHDRAWN);
});

/* ----------------------------------------------------------------- shared */

/**
 * One endpoint, two shapes.
 *
 * The service decides which side of the relationship the caller is on and the DTO is chosen
 * from that — never from a role claim in the request, and never by handing the caller
 * everything and letting the UI hide the rest.
 */
export const getOne = asyncHandler(async (req, res) => {
  const { application, viewerRole } = await applicationService.getForViewer(
    req.validated.id,
    actorOf(req),
  );

  return ApiResponse.ok(
    res,
    toViewerShape(application, viewerRole),
    MESSAGES.APPLICATION.FETCHED,
  );
});

export const getTimeline = asyncHandler(async (req, res) => {
  const timeline = await applicationService.getTimeline(req.validated.id, actorOf(req));
  return ApiResponse.ok(res, timeline, MESSAGES.APPLICATION.TIMELINE_FETCHED);
});

/** Audited on every employer/admin call — see `getResumeUrl`. */
export const getResume = asyncHandler(async (req, res) => {
  const result = await applicationService.getResumeUrl(
    req.validated.id,
    actorOf(req),
    ctxOf(req),
  );
  return ApiResponse.ok(res, result, MESSAGES.RESUME.DRAFT_FETCHED);
});

/* ----------------------------------------------------------------- employer */

export const listForEmployer = asyncHandler(async (req, res) => {
  const result = await applicationService.listForEmployer(
    req.user.id,
    toEmployerCriteria(req.validated),
  );

  return ApiResponse.paginated(
    res,
    { ...result, items: result.items.map(toEmployerRow) },
    MESSAGES.APPLICATION.LIST_FETCHED,
  );
});

export const listForJob = asyncHandler(async (req, res) => {
  const { id, ...criteria } = req.validated;
  const result = await applicationService.listForJob(
    id,
    actorOf(req),
    toEmployerCriteria(criteria),
  );

  return ApiResponse.paginated(
    res,
    { ...result, items: result.items.map(toEmployerRow) },
    MESSAGES.APPLICATION.LIST_FETCHED,
    { funnel: result.funnel, jobTitle: result.jobTitle },
  );
});

/** Funnel + unviewed count for the employer dashboard. */
export const employerFunnel = asyncHandler(async (req, res) => {
  const employer = await employerRepository.findByOwner(req.user.id, { select: '_id' });
  if (!employer) {
    return ApiResponse.ok(res, { funnel: null, unviewed: 0 }, MESSAGES.APPLICATION.LIST_FETCHED);
  }

  const [funnel, unviewed] = await Promise.all([
    applicationRepository.getFunnel({ employer: employer._id }),
    applicationRepository.countUnviewed(String(employer._id)),
  ]);

  return ApiResponse.ok(res, { funnel, unviewed }, MESSAGES.APPLICATION.LIST_FETCHED);
});

export const changeStatus = asyncHandler(async (req, res) => {
  const { id, ...change } = req.validated;
  const application = await applicationService.changeStatus(
    id,
    change,
    actorOf(req),
    ctxOf(req),
  );

  return ApiResponse.ok(
    res,
    shapeFor(application, req),
    MESSAGES.APPLICATION.STATUS_UPDATED,
  );
});

export const markViewed = asyncHandler(async (req, res) => {
  const application = await applicationService.markViewed(req.validated.id, actorOf(req));
  return ApiResponse.ok(res, toEmployerView(application), MESSAGES.APPLICATION.VIEWED);
});

export const shortlist = asyncHandler(async (req, res) => {
  const { id, ...payload } = req.validated;
  const application = await applicationService.shortlist(id, payload, actorOf(req));
  return ApiResponse.ok(res, toEmployerView(application), MESSAGES.APPLICATION.SHORTLISTED);
});

export const reject = asyncHandler(async (req, res) => {
  const { id, ...payload } = req.validated;
  const application = await applicationService.reject(id, payload, actorOf(req), ctxOf(req));
  return ApiResponse.ok(res, toEmployerView(application), MESSAGES.APPLICATION.REJECTED);
});

export const hire = asyncHandler(async (req, res) => {
  const { id, ...payload } = req.validated;
  const application = await applicationService.hire(id, payload, actorOf(req), ctxOf(req));
  return ApiResponse.ok(res, toEmployerView(application), MESSAGES.APPLICATION.HIRED);
});

export const scheduleInterview = asyncHandler(async (req, res) => {
  const { id, ...payload } = req.validated;
  const application = await applicationService.scheduleInterview(id, payload, actorOf(req));
  return ApiResponse.ok(
    res,
    toEmployerView(application),
    MESSAGES.APPLICATION.INTERVIEW_SCHEDULED,
  );
});

export const updateNotes = asyncHandler(async (req, res) => {
  const { id, ...payload } = req.validated;
  const application = await applicationService.updateNotes(id, payload, actorOf(req));
  return ApiResponse.ok(res, toEmployerView(application), MESSAGES.APPLICATION.NOTES_UPDATED);
});

/**
 * Bulk status change.
 *
 * Returns 200 with a per-id result list rather than failing the batch, so an employer who
 * rejects 40 people and hits one already-withdrawn row still gets the other 39 done and can
 * see exactly which one did not apply.
 */
export const bulkChangeStatus = asyncHandler(async (req, res) => {
  const result = await applicationService.bulkChangeStatus(
    req.validated,
    actorOf(req),
    ctxOf(req),
  );

  return ApiResponse.ok(
    res,
    result,
    format(MESSAGES.APPLICATION.BULK_UPDATED, { count: result.updated }),
  );
});

/**
 * Picks the projection matching the caller's side of the relationship.
 * @param {any} application
 * @param {import('express').Request} req
 */
const shapeFor = (application, req) =>
  toViewerShape(
    application,
    req.user.role === ROLES.CANDIDATE ? ACTOR_ROLE.CANDIDATE : ACTOR_ROLE.EMPLOYER,
  );
