import { APPLICATION_STATUS, BOOKMARK_ENTITY } from '@verihire/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { MESSAGES } from '../constants/messages.js';
import * as candidateService from '../services/candidate.service.js';
import * as bookmarkService from '../services/bookmark.service.js';
import { applicationRepository } from '../repositories/application.repository.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import { jobRepository } from '../repositories/job.repository.js';
import {
  toOwnProfile,
  toEmployerProfile,
  toCandidateCard,
} from '../dtos/response/candidate.response.dto.js';
import { toJobCard } from '../dtos/response/job.response.dto.js';

const actorOf = (req) => ({ id: req.user.id, role: req.user.role, email: req.user.email });

/* ------------------------------------------------------------------ profile */

/** Creates the profile if this is the candidate's first visit. */
export const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await candidateService.ensureProfile(req.user.id);
  await profile.populate('user', 'firstName lastName email phone avatar');
  return ApiResponse.ok(res, toOwnProfile(profile), MESSAGES.CANDIDATE.PROFILE_FETCHED);
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const { profile, touched } = await candidateService.updateProfile(req.user.id, req.validated);
  return ApiResponse.ok(
    res,
    { profile: toOwnProfile(profile), touched },
    MESSAGES.CANDIDATE.PROFILE_UPDATED,
  );
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const profile = await candidateService.updatePreferences(req.user.id, req.validated);
  return ApiResponse.ok(res, toOwnProfile(profile), MESSAGES.CANDIDATE.PREFERENCES_UPDATED);
});

export const updateVisibility = asyncHandler(async (req, res) => {
  const profile = await candidateService.updateVisibility(req.user.id, req.validated);
  return ApiResponse.ok(
    res,
    {
      openToWork: profile.openToWork,
      profileVisibility: profile.profileVisibility,
      isDiscoverable: profile.isDiscoverable,
    },
    MESSAGES.CANDIDATE.VISIBILITY_UPDATED,
  );
});

export const setSkills = asyncHandler(async (req, res) => {
  const profile = await candidateService.setSkills(req.user.id, req.validated.skills);
  return ApiResponse.ok(res, toOwnProfile(profile), MESSAGES.CANDIDATE.SKILLS_UPDATED);
});

/* -------------------------------------------------------------- collections */

export const addItem = asyncHandler(async (req, res) => {
  const { collection, ...item } = req.validated;
  const profile = await candidateService.addItem(req.user.id, collection, item);
  return ApiResponse.created(res, toOwnProfile(profile), MESSAGES.CANDIDATE.ITEM_ADDED);
});

export const updateItem = asyncHandler(async (req, res) => {
  const { collection, itemId, ...patch } = req.validated;
  const profile = await candidateService.updateItem(req.user.id, collection, itemId, patch);
  return ApiResponse.ok(res, toOwnProfile(profile), MESSAGES.CANDIDATE.ITEM_UPDATED);
});

export const removeItem = asyncHandler(async (req, res) => {
  const { collection, itemId } = req.validated;
  const profile = await candidateService.removeItem(req.user.id, collection, itemId);
  return ApiResponse.ok(res, toOwnProfile(profile), MESSAGES.CANDIDATE.ITEM_REMOVED);
});

/* ------------------------------------------------------------------ avatar */

export const uploadAvatar = asyncHandler(async (req, res) => {
  const profile = await candidateService.updateAvatar(
    req.user.id,
    req.file.buffer,
    req.file.originalname,
  );
  return ApiResponse.ok(res, toOwnProfile(profile), MESSAGES.CANDIDATE.AVATAR_UPDATED);
});

export const removeAvatar = asyncHandler(async (req, res) => {
  const profile = await candidateService.removeAvatar(req.user.id);
  return ApiResponse.ok(res, toOwnProfile(profile), MESSAGES.CANDIDATE.AVATAR_REMOVED);
});

/* ------------------------------------------------------------------ resume */

/**
 * ★ 202, not 201.
 *
 * The file is stored, but reading it is queued. Saying "created" would imply the extracted
 * fields are ready, and the client would poll for a draft that does not exist yet.
 */
export const uploadResume = asyncHandler(async (req, res) => {
  const profile = await candidateService.uploadResume(req.user.id, req.file.buffer, {
    originalName: req.file.originalname,
    sizeBytes: req.file.size,
  });
  return ApiResponse.accepted(res, toOwnProfile(profile), MESSAGES.RESUME.UPLOADED);
});

export const removeResume = asyncHandler(async (req, res) => {
  const profile = await candidateService.removeResume(req.user.id);
  return ApiResponse.ok(res, toOwnProfile(profile), MESSAGES.RESUME.DELETED);
});

export const getMyResumeUrl = asyncHandler(async (req, res) => {
  const result = await candidateService.getOwnResumeUrl(req.user.id);
  return ApiResponse.ok(res, result, MESSAGES.RESUME.DRAFT_FETCHED);
});

/* ------------------------------------------------------------ parsed draft */

/** ★ Side-by-side review data. Nothing here is applied until the candidate says so. */
export const getParsedDraft = asyncHandler(async (req, res) => {
  const draft = await candidateService.getParsedDraft(req.user.id);
  return ApiResponse.ok(res, draft, MESSAGES.RESUME.DRAFT_FETCHED);
});

export const applyParsedDraft = asyncHandler(async (req, res) => {
  const { profile, applied, skipped } = await candidateService.applyParsedDraft(
    req.user.id,
    req.validated.paths,
  );
  return ApiResponse.ok(
    res,
    { profile: toOwnProfile(profile), applied, skipped },
    MESSAGES.RESUME.DRAFT_APPLIED,
  );
});

export const discardParsedDraft = asyncHandler(async (req, res) => {
  const profile = await candidateService.discardParsedDraft(req.user.id);
  return ApiResponse.ok(res, toOwnProfile(profile), MESSAGES.RESUME.DRAFT_DISCARDED);
});

/* --------------------------------------------------------------- dashboard */

/**
 * Everything the candidate home screen needs, in one round trip.
 *
 * Four sequential requests here would each show their own spinner and make a fast page feel
 * slow; the queries are independent, so they run together.
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const profile = await candidateService.ensureProfile(req.user.id);

  const [counts, recent, recommended] = await Promise.all([
    applicationRepository.countForCandidate(req.user.id),
    applicationRepository.findForCandidate(req.user.id, { limit: 5 }),
    recommendJobs(profile),
  ]);

  return ApiResponse.ok(
    res,
    {
      profileCompleteness: profile.profileCompleteness,
      hasResume: Boolean(profile.resume?.publicId),
      openToWork: profile.openToWork,
      hasPendingDraft: Boolean(profile.parsedDraft?.fields),
      applications: {
        total: counts.total,
        active:
          counts.total -
          counts[APPLICATION_STATUS.REJECTED] -
          counts[APPLICATION_STATUS.WITHDRAWN],
        byStatus: counts,
      },
      recentApplications: recent.items.map((a) => ({
        id: String(a._id),
        status: a.status,
        title: a.jobSnapshot?.title,
        companyName: a.jobSnapshot?.companyName,
        appliedAt: a.createdAt,
      })),
      recommendedJobs: recommended,
    },
    MESSAGES.CANDIDATE.PROFILE_FETCHED,
  );
});

/**
 * Skill-overlap recommendations, drawn only from publicly visible jobs.
 *
 * Uses the same `search()` path as the browse page, so a recommendation can never surface a
 * listing the candidate would not be allowed to open.
 *
 * @param {any} profile
 */
const recommendJobs = async (profile) => {
  const skills = (profile.skills ?? []).map((s) => s.name).slice(0, 8);
  if (!skills.length) return [];

  const result = await jobRepository.search(
    { skills, limit: 6, workMode: profile.preferences?.workModes },
    { publicOnly: true },
  );
  return result.items.map(toJobCard);
};

/* --------------------------------------------------------- candidate search */

/**
 * ★ The employer-facing candidate database.
 *
 * Every result comes from `searchDiscoverable()`, which composes `buildDiscoverableFilter()`
 * — there is no code path that lets an employer query candidates who did not opt in. This is
 * the candidate-side mirror of `buildPublicJobFilter()`.
 *
 * Contact details are absent from the card shape entirely, so a search result set cannot be
 * scraped for phone numbers however many pages are walked.
 */
export const searchCandidates = asyncHandler(async (req, res) => {
  const v = req.validated ?? {};

  const result = await candidateRepository.searchDiscoverable({
    keyword: v.q,
    skills: v.skills,
    location: v.location,
    availability: v.availability,
    workModes: v.workModes,
    willingToRelocate: v.willingToRelocate,
    minExpMonths: v.minExpYears, // converted to months by the validator
    maxExpMonths: v.maxExpYears,
    maxSalary: v.maxSalary,
    maxNoticePeriodDays: v.maxNoticePeriodDays,
    page: v.page,
    limit: v.limit,
    sort: v.sort,
  });

  // One query for the whole page, so the "saved" star renders without N+1 lookups.
  const savedIds = await bookmarkService.findSavedIds(
    req.user.id,
    BOOKMARK_ENTITY.CANDIDATE,
    result.items.map((c) => c._id),
  );

  return ApiResponse.paginated(
    res,
    {
      ...result,
      items: result.items.map((candidate) => ({
        ...toCandidateCard(candidate),
        isSaved: savedIds.has(String(candidate._id)),
      })),
    },
    MESSAGES.SEARCH.CANDIDATES_FETCHED,
  );
});

/* ------------------------------------------------------------ employer view */

/**
 * ★ An employer reading one candidate.
 *
 * Contact details unlock only for a candidate who reached SHORTLISTED with this employer —
 * browsing the candidate database never reveals them, however complete the profile is.
 */
export const getForEmployer = asyncHandler(async (req, res) => {
  const { profile, via } = await candidateService.getForEmployer(req.validated.id, actorOf(req));

  const contactUnlocked = await hasShortlistedRelationship(req, profile);

  return ApiResponse.ok(
    res,
    toEmployerProfile(profile, { contactUnlocked, via }),
    MESSAGES.CANDIDATE.PROFILE_FETCHED,
  );
});

/**
 * @param {import('express').Request} req
 * @param {any} profile
 */
const hasShortlistedRelationship = async (req, profile) => {
  const { employerRepository } = await import('../repositories/employer.repository.js');
  const employer = await employerRepository.findByOwner(req.user.id, { select: '_id' });
  if (!employer) return false;

  return applicationRepository.exists({
    candidateProfile: profile._id ?? profile.id,
    employer: employer._id,
    shortlistedAt: { $ne: null },
    deletedAt: null,
  });
};
