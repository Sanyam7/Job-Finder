import {
  ACTOR_ROLE,
  APPLICATION_STATUS,
  APPLICATION_STATUS_META,
  APPLICATION_STATUS_TRANSITIONS,
  APPLICATION_TERMINAL_STATUSES,
  AUDIT_ACTION,
  AUDIT_ENTITY,
  ERROR_CODES,
  ROLES,
} from '@verihire/shared';
import logger from '../config/logger.js';
import { applicationRepository } from '../repositories/application.repository.js';
import { jobRepository, buildPublicJobFilter } from '../repositories/job.repository.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import { employerRepository } from '../repositories/employer.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { Application } from '../models/application.model.js';
import { withTransaction } from '../database/transaction.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors/index.js';
import { MESSAGES, format } from '../constants/messages.js';
import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../constants/events.js';
import * as auditService from './audit.service.js';

/**
 * The applications pipeline.
 *
 * Two invariants live here, and both are enforced in more than one place on purpose:
 *
 *  1. **You can only apply to a job that is publicly visible right now.** Re-checked inside
 *     the transaction, because a job can be pulled between the browse page rendering and the
 *     submit button being clicked — and on this platform "pulled" often means an admin just
 *     found something wrong with it.
 *  2. **One application per job per candidate.** Guaranteed by a unique index, not by a read.
 */

/**
 * The status changes worth an audit entry.
 *
 * Rejections and hires are the two a dispute actually turns on; auditing every "viewed" would
 * bury them. Annotated `string[]` so the membership test compares against the full status
 * union rather than these two literals.
 *
 * @type {string[]}
 */
const AUDITED_STATUSES = [APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.HIRED];

/**
 * Which role is allowed to *initiate* each transition.
 *
 * The transition map in `shared/` answers "is this move legal?"; this answers "may *you*
 * make it?". They are genuinely different questions — APPLIED → WITHDRAWN is a legal move,
 * but an employer performing it on a candidate's behalf would be falsifying the record to
 * make their own funnel look better.
 */
const ACTOR_TRANSITIONS = Object.freeze({
  [ACTOR_ROLE.CANDIDATE]: [APPLICATION_STATUS.WITHDRAWN],
  [ACTOR_ROLE.EMPLOYER]: [
    APPLICATION_STATUS.VIEWED,
    APPLICATION_STATUS.SHORTLISTED,
    APPLICATION_STATUS.INTERVIEW,
    APPLICATION_STATUS.REJECTED,
    APPLICATION_STATUS.HIRED,
  ],
});

/* ------------------------------------------------------------------- guards */

/**
 * @param {string} from
 * @param {string} to
 */
const assertTransition = (from, to) => {
  if (from === to) {
    throw new ConflictError(
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      `This application is already marked "${APPLICATION_STATUS_META[to]?.label ?? to}".`,
      { from, to },
    );
  }

  const allowed = APPLICATION_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    const isTerminal = APPLICATION_TERMINAL_STATUSES.includes(from);
    throw new ConflictError(
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      isTerminal
        ? `This application is closed (${APPLICATION_STATUS_META[from]?.label ?? from}) and cannot be changed.`
        : format(MESSAGES.APPLICATION.INVALID_TRANSITION, { from, to }),
      { from, to, allowed },
    );
  }
};

/**
 * @param {string} actorRole
 * @param {string} to
 */
const assertActorMayTransition = (actorRole, to) => {
  if (actorRole === ACTOR_ROLE.ADMIN) return; // admins act on abuse reports and disputes
  const allowed = ACTOR_TRANSITIONS[actorRole] ?? [];
  if (!allowed.includes(to)) {
    throw new ForbiddenError(
      ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      `You cannot move an application to "${APPLICATION_STATUS_META[to]?.label ?? to}".`,
      { role: actorRole, attempted: to, allowed },
    );
  }
};

/**
 * ★ Loads an application and proves the caller is allowed to act on it.
 *
 * Ownership is resolved from the database on every call — the application's `employer` is
 * compared with the employer profile that this user actually owns. Nothing is read from the
 * request body, which is what keeps this out of the IDOR class.
 *
 * @param {string} applicationId
 * @param {{id: string, role: string}} actor
 * @param {{as: 'candidate'|'employer'|'any', lean?: boolean}} opts
 */
const loadAuthorised = async (applicationId, actor, { as, lean = false }) => {
  const application = await applicationRepository.findById(applicationId, { lean });
  if (!application) {
    throw new NotFoundError(ERROR_CODES.APPLICATION_NOT_FOUND, MESSAGES.APPLICATION.NOT_FOUND);
  }

  if (actor.role === ROLES.ADMIN) return { application, viewerRole: ACTOR_ROLE.ADMIN };

  const isApplicant = String(application.applicant) === String(actor.id);

  if (isApplicant && (as === 'candidate' || as === 'any')) {
    return { application, viewerRole: ACTOR_ROLE.CANDIDATE };
  }

  if (as === 'employer' || as === 'any') {
    const employer = await employerRepository.findByOwner(actor.id, {
      select: '_id status verificationStatus companyName owner',
    });
    if (employer && String(application.employer) === String(employer._id)) {
      return { application, viewerRole: ACTOR_ROLE.EMPLOYER, employer };
    }
  }

  /**
   * 404 rather than 403.
   *
   * Returning "forbidden" would confirm that this application id exists — enough to
   * enumerate how many people applied to a competitor's listing.
   */
  throw new NotFoundError(ERROR_CODES.APPLICATION_NOT_FOUND, MESSAGES.APPLICATION.NOT_FOUND);
};

/**
 * ★ A suspended or unverified company cannot touch applications.
 *
 * The platform's promise does not stop at the listing. If an admin suspends a company
 * because it turned out to be a scam, that company must not still be able to schedule
 * "interviews" with the people who already applied — which is exactly where the harm in a
 * fake-job scam actually happens.
 *
 * @param {any} employer
 */
const assertEmployerMayManage = (employer) => {
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }
  if (employer.status === 'SUSPENDED') {
    throw new ForbiddenError(ERROR_CODES.EMPLOYER_SUSPENDED, MESSAGES.EMPLOYER.SUSPENDED);
  }
  if (employer.verificationStatus !== 'VERIFIED') {
    throw new ForbiddenError(ERROR_CODES.EMPLOYER_NOT_VERIFIED, MESSAGES.EMPLOYER.NOT_VERIFIED, {
      verificationStatus: employer.verificationStatus,
    });
  }
};

/* -------------------------------------------------------------------- apply */

/**
 * Builds the point-in-time snapshots stored on the application.
 * @param {any} job
 * @param {any} user
 * @param {any} profile
 */
const buildSnapshots = (job, user, profile) => ({
  jobSnapshot: {
    title: job.title,
    slug: job.slug,
    companyName: job.companySnapshot?.name,
    companySlug: job.companySnapshot?.slug ?? null,
    companyLogo: job.companySnapshot?.logo ?? null,
    employmentType: job.employmentType,
    workMode: job.workMode,
    location: {
      city: job.location?.city ?? null,
      state: job.location?.state ?? null,
      country: job.location?.country ?? null,
    },
    salary: job.salary?.isDisclosed === false ? null : job.salary ?? null,
    deadline: job.deadline ?? null,
  },
  candidateSnapshot: {
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    email: user?.email ?? null,
    phone: user?.phone ?? null,
    headline: profile?.headline ?? null,
    currentCompany: profile?.currentCompany ?? null,
    currentDesignation: profile?.currentDesignation ?? null,
    totalExperienceMonths: profile?.totalExperienceMonths ?? 0,
    skills: (profile?.skills ?? []).map((s) => s.name).slice(0, 25),
    location: {
      city: profile?.location?.city ?? null,
      state: profile?.location?.state ?? null,
      country: profile?.location?.country ?? null,
    },
    profileCompleteness: profile?.profileCompleteness ?? 0,
  },
  resumeSnapshot: {
    publicId: profile?.resume?.publicId ?? null,
    originalName: profile?.resume?.originalName ?? null,
    format: profile?.resume?.format ?? null,
    sizeBytes: profile?.resume?.sizeBytes ?? null,
    version: profile?.resume?.version ?? 0,
    uploadedAt: profile?.resume?.uploadedAt ?? null,
  },
});

/**
 * ★ Submits an application.
 *
 * @param {{jobId: string, coverLetter?: string, expectedSalary?: object,
 *          noticePeriodDays?: number, answers?: {question: string, answer: string}[],
 *          source?: string}} dto
 * @param {{id: string, role: string, email: string}} actor
 */
export const applyToJob = async (dto, actor) => {
  const profile = await candidateRepository.findByUser(actor.id);
  if (!profile) {
    throw new NotFoundError(
      ERROR_CODES.CANDIDATE_PROFILE_MISSING,
      'Complete your profile before applying.',
    );
  }

  /**
   * A resume is required.
   *
   * This is a product decision, not a technical one: an employer who has manually verified
   * their company and waited for a human review of their listing should not receive blank
   * applications. It is also what makes "applications" a meaningful metric for them.
   */
  if (!profile.resume?.publicId) {
    throw new ConflictError(ERROR_CODES.RESUME_REQUIRED, MESSAGES.RESUME.REQUIRED);
  }

  const user = await userRepository.findById(actor.id, {
    select: 'firstName lastName email phone',
  });

  const application = await withTransaction(
    async (session) => {
      /**
       * ★★ The gate, re-read inside the transaction.
       *
       * `buildPublicJobFilter()` is the same predicate the browse page used. Re-running it
       * here closes the window between "candidate loaded the page" and "candidate clicked
       * apply" — a window in which an admin may have rejected the listing or suspended the
       * company. Without this, the two-gate promise would hold for reads and quietly leak on
       * writes.
       */
      const job = await jobRepository.findOne(buildPublicJobFilter({ _id: dto.jobId }), {
        session,
        lean: true,
      });

      if (!job) {
        // Deliberately does not distinguish "expired" from "pulled by an admin" from
        // "never existed" — the candidate's next action is the same in all three cases.
        throw new ConflictError(
          ERROR_CODES.JOB_NOT_ACCEPTING_APPLICATIONS,
          MESSAGES.JOB.NOT_ACCEPTING,
        );
      }

      const doc = new Application({
        job: job._id,
        employer: job.employer,
        applicant: actor.id,
        candidateProfile: profile._id,
        ...buildSnapshots(job, user, profile),
        coverLetter: dto.coverLetter ?? null,
        expectedSalary: dto.expectedSalary ?? profile.preferences?.expectedSalary ?? null,
        noticePeriodDays: dto.noticePeriodDays ?? profile.preferences?.noticePeriodDays ?? null,
        answers: dto.answers ?? [],
        source: dto.source ?? 'DIRECT',
        status: APPLICATION_STATUS.APPLIED,
        statusChangedAt: new Date(),
      });

      doc.pushTimeline({
        status: APPLICATION_STATUS.APPLIED,
        actor: actor.id,
        actorRole: ACTOR_ROLE.CANDIDATE,
        note: 'Application submitted',
      });

      await doc.save({ session });

      // Counters move in the same commit as the row they count, so the employer's inbox
      // badge can never disagree with the list it opens.
      await jobRepository.incrementApplications(String(job._id), 1, { session });
      await employerRepository.bumpStats(
        String(job.employer),
        { 'stats.totalApplications': 1 },
        { session },
      );
      await candidateRepository.updateByUser(
        actor.id,
        { $inc: { 'stats.applicationsSent': 1 } },
        { session },
      );

      return doc;
    },
    { name: 'applyToJob' },
  ).catch((error) => {
    /**
     * The unique index did its job. Two rapid clicks, two tabs, or a retried request all
     * land here, and all of them mean the same thing to the candidate.
     */
    if (/** @type {any} */ (error)?.code === 11000) {
      throw new ConflictError(ERROR_CODES.ALREADY_APPLIED, MESSAGES.APPLICATION.ALREADY_APPLIED);
    }
    throw error;
  });

  eventBus.emit(EVENTS.APPLICATION_CREATED, {
    applicationId: String(application._id),
    jobId: String(application.job),
    employerId: String(application.employer),
    applicantId: actor.id,
    jobTitle: application.jobSnapshot?.title,
    candidateName: [user?.firstName, user?.lastName].filter(Boolean).join(' '),
  });

  logger.info('Application submitted', {
    applicationId: String(application._id),
    jobId: String(application.job),
  });

  return application;
};

/* ----------------------------------------------------------------- lifecycle */

/**
 * ★ The one function that changes an application's status.
 *
 * Every convenience wrapper below routes through here, so the transition map, the actor
 * check, the timeline entry and the notification are impossible to skip by adding a new
 * endpoint later.
 *
 * @param {string} applicationId
 * @param {{status: string, note?: string, isCandidateVisible?: boolean,
 *          rejectionReason?: string, rejectionCategory?: string,
 *          withdrawalReason?: string, interview?: Record<string, any>}} change
 * @param {{id: string, role: string, email: string}} actor
 * @param {{ip?: string, userAgent?: string, requestId?: string}} [ctx]
 */
export const changeStatus = async (applicationId, change, actor, ctx = {}) => {
  const as =
    actor.role === ROLES.CANDIDATE ? 'candidate' : actor.role === ROLES.EMPLOYER ? 'employer' : 'any';

  const { application, viewerRole, employer } = await loadAuthorised(applicationId, actor, {
    as,
    lean: false,
  });

  /**
   * Order matters: eligibility before legality.
   *
   * A suspended company asking to schedule an interview should be told it is suspended, not
   * handed a state-machine complaint about the transition — the first answer is the true
   * one, and the second leaks the pipeline's shape to an actor who has no business in it.
   */
  assertActorMayTransition(viewerRole, change.status);
  if (viewerRole === ACTOR_ROLE.EMPLOYER) assertEmployerMayManage(employer);
  assertTransition(application.status, change.status);

  if (change.status === APPLICATION_STATUS.REJECTED && !change.rejectionReason?.trim()) {
    throw new BadRequestError(ERROR_CODES.MISSING_FIELD, MESSAGES.APPLICATION.REASON_REQUIRED, [
      { field: 'rejectionReason', message: 'Tell the candidate why, even briefly' },
    ]);
  }

  const before = { status: application.status };
  const now = new Date();

  application.status = change.status;
  application.statusChangedAt = now;

  switch (change.status) {
    case APPLICATION_STATUS.VIEWED:
      application.viewedAt = application.viewedAt ?? now;
      break;
    case APPLICATION_STATUS.SHORTLISTED:
      application.shortlistedAt = application.shortlistedAt ?? now;
      // An employer can shortlist straight from APPLIED; backfill so the funnel is honest
      // about the fact that they did look at it.
      application.viewedAt = application.viewedAt ?? now;
      break;
    case APPLICATION_STATUS.INTERVIEW:
      application.interview = {
        ...(application.interview?.toObject?.() ?? application.interview ?? {}),
        ...change.interview,
      };
      application.viewedAt = application.viewedAt ?? now;
      application.shortlistedAt = application.shortlistedAt ?? now;
      break;
    case APPLICATION_STATUS.REJECTED:
      application.rejection = {
        reason: change.rejectionReason.trim(),
        category: change.rejectionCategory ?? 'NOT_A_FIT',
        at: now,
      };
      application.decidedAt = now;
      break;
    case APPLICATION_STATUS.HIRED:
      application.decidedAt = now;
      break;
    case APPLICATION_STATUS.WITHDRAWN:
      application.withdrawal = { reason: change.withdrawalReason ?? null, at: now };
      application.decidedAt = now;
      break;
    default:
      break;
  }

  application.pushTimeline({
    status: change.status,
    note: change.note ?? change.rejectionReason ?? change.withdrawalReason ?? null,
    actor: actor.id,
    actorRole: viewerRole,
    // Employer notes default to internal; the candidate-facing copy comes from
    // APPLICATION_STATUS_META so it is consistent and never leaks a private remark.
    isCandidateVisible: change.isCandidateVisible ?? viewerRole !== ACTOR_ROLE.EMPLOYER,
  });

  await application.save();

  if (change.status === APPLICATION_STATUS.HIRED) {
    await employerRepository.bumpStats(String(application.employer), { 'stats.totalHires': 1 });
  }
  if (change.status === APPLICATION_STATUS.SHORTLISTED) {
    await candidateRepository
      .updateByUser(String(application.applicant), { $inc: { 'stats.shortlistedCount': 1 } })
      .catch(() => {});
  }

  await emitStatusEvent(application, change, viewerRole);

  // Only moderation-relevant decisions are audited. Logging every "viewed" would bury the
  // rejections and hires that a dispute actually turns on.
  if (AUDITED_STATUSES.includes(change.status)) {
    await auditService.record({
      actor: { ...actor, role: viewerRole },
      action: AUDIT_ACTION.APPLICATION_STATUS_CHANGED,
      entityType: AUDIT_ENTITY.APPLICATION,
      entityId: applicationId,
      entityLabel: application.jobSnapshot?.title ?? null,
      before,
      after: { status: change.status },
      reason: change.rejectionReason ?? change.note ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }

  return application;
};

/**
 * Fans a status change out to the notification/email subscribers.
 * @param {any} application
 * @param {Record<string, any>} change
 * @param {string} viewerRole
 */
const emitStatusEvent = async (application, change, viewerRole) => {
  const EVENT_BY_STATUS = {
    [APPLICATION_STATUS.VIEWED]: EVENTS.APPLICATION_VIEWED,
    [APPLICATION_STATUS.SHORTLISTED]: EVENTS.APPLICATION_SHORTLISTED,
    [APPLICATION_STATUS.INTERVIEW]: EVENTS.APPLICATION_INTERVIEW,
    [APPLICATION_STATUS.REJECTED]: EVENTS.APPLICATION_REJECTED,
    [APPLICATION_STATUS.HIRED]: EVENTS.APPLICATION_HIRED,
    [APPLICATION_STATUS.WITHDRAWN]: EVENTS.APPLICATION_WITHDRAWN,
  };

  const event = EVENT_BY_STATUS[change.status];
  if (!event) return;

  // The candidate withdrawing does not need an email about their own click.
  const candidate =
    viewerRole === ACTOR_ROLE.CANDIDATE
      ? null
      : await userRepository.findById(String(application.applicant), {
          select: 'email firstName',
        });

  eventBus.emit(event, {
    applicationId: String(application._id),
    jobId: String(application.job),
    employerId: String(application.employer),
    applicantId: String(application.applicant),
    jobTitle: application.jobSnapshot?.title,
    companyName: application.jobSnapshot?.companyName,
    candidateEmail: candidate?.email,
    candidateFirstName: candidate?.firstName,
    status: change.status,
    reason: change.rejectionReason ?? null,
    ...(change.status === APPLICATION_STATUS.INTERVIEW
      ? {
          scheduledAt: application.interview?.scheduledAt,
          mode: application.interview?.mode,
          meetingLink: application.interview?.meetingLink,
          round: application.interview?.round,
        }
      : {}),
  });
};

/* ------------------------------------------------------- convenience wrappers */

/**
 * Marks an application as viewed. Idempotent by design — the employer's UI fires this on
 * every open, and the second open must not 409.
 *
 * @param {string} applicationId
 * @param {{id: string, role: string, email: string}} actor
 */
export const markViewed = async (applicationId, actor) => {
  const { application } = await loadAuthorised(applicationId, actor, {
    as: 'employer',
    lean: false,
  });

  if (application.status !== APPLICATION_STATUS.APPLIED) return application;
  return changeStatus(applicationId, { status: APPLICATION_STATUS.VIEWED }, actor);
};

/**
 * @param {string} applicationId
 * @param {{note?: string}} payload
 * @param {{id: string, role: string, email: string}} actor
 */
export const shortlist = (applicationId, payload, actor) =>
  changeStatus(
    applicationId,
    { status: APPLICATION_STATUS.SHORTLISTED, note: payload.note },
    actor,
  );

/**
 * @param {string} applicationId
 * @param {{reason: string, category?: string, note?: string}} payload
 * @param {{id: string, role: string, email: string}} actor
 * @param {Record<string, any>} [ctx]
 */
export const reject = (applicationId, payload, actor, ctx) =>
  changeStatus(
    applicationId,
    {
      status: APPLICATION_STATUS.REJECTED,
      rejectionReason: payload.reason,
      rejectionCategory: payload.category,
      note: payload.note,
    },
    actor,
    ctx,
  );

/**
 * @param {string} applicationId
 * @param {{note?: string}} payload
 * @param {{id: string, role: string, email: string}} actor
 * @param {Record<string, any>} [ctx]
 */
export const hire = (applicationId, payload, actor, ctx) =>
  changeStatus(applicationId, { status: APPLICATION_STATUS.HIRED, note: payload.note }, actor, ctx);

/**
 * @param {string} applicationId
 * @param {{scheduledAt: Date, mode: string, meetingLink?: string, location?: string,
 *          round?: number, notes?: string}} payload
 * @param {{id: string, role: string, email: string}} actor
 */
export const scheduleInterview = (applicationId, payload, actor) =>
  changeStatus(
    applicationId,
    {
      status: APPLICATION_STATUS.INTERVIEW,
      interview: {
        scheduledAt: payload.scheduledAt,
        mode: payload.mode,
        meetingLink: payload.meetingLink ?? null,
        location: payload.location ?? null,
        round: payload.round ?? 1,
        notes: payload.notes ?? null,
      },
      // The interview details themselves are for the candidate; the internal note is not.
      note: `Interview scheduled for ${new Date(payload.scheduledAt).toISOString()}`,
      isCandidateVisible: true,
    },
    actor,
  );

/**
 * @param {string} applicationId
 * @param {{reason?: string}} payload
 * @param {{id: string, role: string, email: string}} actor
 */
export const withdraw = (applicationId, payload, actor) =>
  changeStatus(
    applicationId,
    { status: APPLICATION_STATUS.WITHDRAWN, withdrawalReason: payload.reason },
    actor,
  );

/**
 * Employer-private notes and rating.
 *
 * Never writes a timeline entry: this is the employer's own scratchpad, and a note is not a
 * decision. Timeline entries are the record the candidate can be shown.
 *
 * @param {string} applicationId
 * @param {{notes?: string, rating?: number, tags?: string[]}} payload
 * @param {{id: string, role: string, email: string}} actor
 */
export const updateNotes = async (applicationId, payload, actor) => {
  const { application, employer } = await loadAuthorised(applicationId, actor, {
    as: 'employer',
    lean: false,
  });
  if (employer) assertEmployerMayManage(employer);

  if (payload.notes !== undefined) application.employerNotes = payload.notes;
  if (payload.rating !== undefined) application.rating = payload.rating;
  if (payload.tags !== undefined) application.tags = payload.tags;

  await application.save();
  return application;
};

/**
 * Bulk status change from the employer's inbox.
 *
 * Deliberately **not** one transaction across every id. Rejecting 40 candidates where one
 * is already withdrawn should reject the other 39, not fail the whole batch and leave the
 * employer guessing which row was the problem. Each result is reported individually.
 *
 * @param {{ids: string[], status: string, reason?: string, category?: string, note?: string}} payload
 * @param {{id: string, role: string, email: string}} actor
 * @param {Record<string, any>} [ctx]
 */
export const bulkChangeStatus = async (payload, actor, ctx = {}) => {
  /** @type {{id: string, ok: boolean, error?: string, code?: string}[]} */
  const results = [];

  for (const id of payload.ids) {
    try {
      // Sequential rather than Promise.all: a bulk reject fans out emails, and 50 parallel
      // SMTP sends is how an outbound mail provider decides you are a spammer.
      // eslint-disable-next-line no-await-in-loop
      await changeStatus(
        id,
        {
          status: payload.status,
          note: payload.note,
          rejectionReason: payload.reason,
          rejectionCategory: payload.category,
        },
        actor,
        ctx,
      );
      results.push({ id, ok: true });
    } catch (error) {
      const err = /** @type {any} */ (error);
      results.push({ id, ok: false, error: err.message, code: err.code });
    }
  }

  const updated = results.filter((r) => r.ok).length;
  logger.info('Bulk application status change', {
    status: payload.status,
    requested: payload.ids.length,
    updated,
  });

  return { updated, failed: results.length - updated, results };
};

/* --------------------------------------------------------------------- reads */

/**
 * @param {string} applicationId
 * @param {{id: string, role: string}} actor
 */
export const getForViewer = async (applicationId, actor) => {
  const { application, viewerRole } = await loadAuthorised(applicationId, actor, { as: 'any' });
  return { application, viewerRole };
};

/**
 * ★ The timeline, filtered for the viewer.
 *
 * A candidate sees the stages; the employer's internal remarks stay internal. The filtering
 * happens here rather than in the DTO because the timeline is the one field where hiding a
 * row changes the meaning of the list, and that decision deserves to be visible in the
 * service.
 *
 * @param {string} applicationId
 * @param {{id: string, role: string}} actor
 */
export const getTimeline = async (applicationId, actor) => {
  const { application, viewerRole } = await loadAuthorised(applicationId, actor, { as: 'any' });

  const events = (application.timeline ?? [])
    .filter((event) => viewerRole !== ACTOR_ROLE.CANDIDATE || event.isCandidateVisible)
    .map((event) => ({
      id: String(event._id),
      status: event.status,
      label: APPLICATION_STATUS_META[event.status]?.label ?? event.status,
      tone: APPLICATION_STATUS_META[event.status]?.tone ?? 'neutral',
      message:
        viewerRole === ACTOR_ROLE.CANDIDATE
          ? APPLICATION_STATUS_META[event.status]?.candidateMessage ?? null
          : event.note,
      note: viewerRole === ACTOR_ROLE.CANDIDATE ? null : event.note,
      actorRole: event.actorRole,
      at: event.at,
    }))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return { events, currentStatus: application.status, viewerRole };
};

/**
 * @param {string} applicantId
 * @param {Record<string, any>} criteria
 */
export const listForCandidate = (applicantId, criteria) =>
  applicationRepository.findForCandidate(applicantId, criteria);

/**
 * @param {string} userId owner of the employer profile
 * @param {Record<string, any>} criteria
 */
export const listForEmployer = async (userId, criteria) => {
  const employer = await employerRepository.findByOwner(userId, { select: '_id' });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }
  return applicationRepository.findForEmployer(String(employer._id), criteria);
};

/**
 * Applicants for one job, plus that job's funnel.
 * @param {string} jobId
 * @param {{id: string, role: string}} actor
 * @param {Record<string, any>} criteria
 */
export const listForJob = async (jobId, actor, criteria) => {
  const job = await jobRepository.findById(jobId, { select: 'employer title' });
  if (!job) throw new NotFoundError(ERROR_CODES.JOB_NOT_FOUND, MESSAGES.JOB.NOT_FOUND);

  if (actor.role !== ROLES.ADMIN) {
    const employer = await employerRepository.findByOwner(actor.id, { select: '_id' });
    if (!employer || String(job.employer) !== String(employer._id)) {
      throw new ForbiddenError(
        ERROR_CODES.NOT_RESOURCE_OWNER,
        'This job belongs to another company.',
      );
    }
  }

  const [page, funnel] = await Promise.all([
    applicationRepository.findForEmployer(String(job.employer), { ...criteria, job: jobId }),
    applicationRepository.getFunnel({ job: jobId }),
  ]);

  return { ...page, funnel, jobTitle: job.title };
};

/**
 * ★ Mints a signed URL for an applicant's resume — and records who opened it.
 *
 * Access is not "the employer has the id"; it is "this candidate applied to a job at this
 * company". The audit entry exists because a resume carries a phone number and a home
 * address, and on a platform that promises verified employers, being able to answer "who
 * downloaded my CV" is part of that promise.
 *
 * @param {string} applicationId
 * @param {{id: string, role: string, email: string}} actor
 * @param {Record<string, any>} [ctx]
 */
export const getResumeUrl = async (applicationId, actor, ctx = {}) => {
  const { application, viewerRole, employer } = await loadAuthorised(applicationId, actor, {
    as: 'any',
  });

  if (viewerRole === ACTOR_ROLE.EMPLOYER) assertEmployerMayManage(employer);

  const publicId = application.resumeSnapshot?.publicId;
  if (!publicId) {
    throw new NotFoundError(ERROR_CODES.NOT_FOUND, MESSAGES.RESUME.NONE);
  }

  const { getSignedUrl } = await import('./upload.service.js');
  const url = getSignedUrl(publicId, {
    download: true,
    filename: application.resumeSnapshot.originalName ?? 'resume.pdf',
  });

  if (viewerRole !== ACTOR_ROLE.CANDIDATE) {
    await applicationRepository.updateById(applicationId, {
      $set: { resumeDownloadedAt: new Date() },
    });

    await auditService.record({
      actor: { ...actor, role: viewerRole },
      action: AUDIT_ACTION.RESUME_DOWNLOADED,
      entityType: AUDIT_ENTITY.APPLICATION,
      entityId: applicationId,
      entityLabel: application.jobSnapshot?.title ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    eventBus.emit(EVENTS.RESUME_DOWNLOADED, {
      applicationId,
      applicantId: String(application.applicant),
      employerId: String(application.employer),
    });
  }

  return { url, expiresInSeconds: 300, filename: application.resumeSnapshot.originalName };
};

export default {
  applyToJob,
  changeStatus,
  markViewed,
  shortlist,
  reject,
  hire,
  scheduleInterview,
  withdraw,
  updateNotes,
  bulkChangeStatus,
  getForViewer,
  getTimeline,
  listForCandidate,
  listForEmployer,
  listForJob,
  getResumeUrl,
};
