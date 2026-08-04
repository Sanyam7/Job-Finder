import {
  ACCOUNT_STATUS,
  AUDIT_ACTION,
  AUDIT_ENTITY,
  ERROR_CODES,
  VERIFICATION_STATUS,
  emailDomainMatchesWebsite,
  isFreeEmailDomain,
  extractDomain,
} from '@verihire/shared';
import logger from '../config/logger.js';
import { employerRepository } from '../repositories/employer.repository.js';
import { jobRepository } from '../repositories/job.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { withTransaction } from '../database/transaction.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';
import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../constants/events.js';
import * as auditService from './audit.service.js';

/**
 * ★ GATE 1 — employer verification.
 *
 * This module is the reason the product exists. Everything here is written so that the only
 * way a company becomes publicly trusted is a human admin explicitly saying so.
 */

/** Checks that must be true before an admin may approve. GST is optional by design. */
const MANDATORY_CHECKS = [
  'companyNameMatches',
  'websiteLive',
  'emailDomainMatches',
  'documentsValid',
  'identityValid',
];

/**
 * Submits a company for review.
 * @param {string} employerId
 * @param {{id: string, role: string, email: string}} actor
 * @param {{ip?: string, userAgent?: string, requestId?: string}} [ctx]
 */
export const submitForVerification = async (employerId, actor, ctx = {}) => {
  const employer = await employerRepository.findById(employerId, { lean: false });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }

  if (employer.verificationStatus === VERIFICATION_STATUS.PENDING) {
    throw new ConflictError(
      ERROR_CODES.VERIFICATION_IN_PROGRESS,
      MESSAGES.EMPLOYER.ALREADY_PENDING,
    );
  }
  if (employer.verificationStatus === VERIFICATION_STATUS.VERIFIED) {
    throw new ConflictError(ERROR_CODES.ALREADY_VERIFIED, MESSAGES.EMPLOYER.ALREADY_VERIFIED);
  }
  if (employer.status !== ACCOUNT_STATUS.ACTIVE) {
    throw new ForbiddenError(ERROR_CODES.EMPLOYER_SUSPENDED, MESSAGES.EMPLOYER.SUSPENDED);
  }

  const readiness = employer.getSubmissionReadiness();
  if (!readiness.ready) {
    throw new BadRequestError(
      ERROR_CODES.MISSING_FIELD,
      MESSAGES.EMPLOYER.INCOMPLETE_PROFILE,
      readiness.missing.map((field) => ({ field, message: 'Required before submitting' })),
    );
  }

  employer.verificationStatus = VERIFICATION_STATUS.PENDING;
  employer.verification.submittedAt = new Date();
  employer.verification.attemptCount = (employer.verification.attemptCount ?? 0) + 1;
  employer.verification.rejectionReason = null;
  employer.verification.rejectionCategory = null;
  employer.verification.reviewedAt = null;
  employer.verification.reviewedBy = null;
  await employer.save();

  const owner = await userRepository.findById(String(employer.owner), {
    select: 'email firstName',
  });

  await auditService.record({
    actor: { id: actor.id, role: actor.role, email: actor.email },
    action: AUDIT_ACTION.EMPLOYER_SUBMITTED_VERIFICATION,
    entityType: AUDIT_ENTITY.EMPLOYER_PROFILE,
    entityId: employerId,
    entityLabel: employer.companyName,
    after: { attempt: employer.verification.attemptCount },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  eventBus.emit(EVENTS.EMPLOYER_SUBMITTED, {
    employerId,
    companyName: employer.companyName,
    ownerUserId: String(employer.owner),
    ownerEmail: owner?.email,
    ownerFirstName: owner?.firstName,
    attempt: employer.verification.attemptCount,
  });

  logger.info('Employer submitted for verification', {
    employerId,
    attempt: employer.verification.attemptCount,
  });

  return employer;
};

/**
 * ★ Approves a company.
 *
 * Runs in a transaction because two facts must become true together: the company is
 * verified, and its already-approved jobs are public. If the second half failed after the
 * first committed, the company would believe it was live while candidates saw nothing —
 * and nothing in the system would detect it until the nightly reconcile.
 *
 * @param {string} employerId
 * @param {{checklist?: Record<string, boolean>, note?: string}} decision
 * @param {{id: string, role: string, email: string}} actor
 * @param {{ip?: string, userAgent?: string, requestId?: string}} [ctx]
 */
export const approveEmployer = async (employerId, decision, actor, ctx = {}) => {
  const employer = await employerRepository.findById(employerId, { lean: false });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }
  if (employer.verificationStatus === VERIFICATION_STATUS.VERIFIED) {
    throw new ConflictError(ERROR_CODES.ALREADY_VERIFIED, MESSAGES.EMPLOYER.ALREADY_VERIFIED);
  }
  if (!employer.documents?.length) {
    throw new BadRequestError(
      ERROR_CODES.MISSING_FIELD,
      'This company has no supporting documents — it cannot be approved.',
    );
  }

  const checklist = { ...employer.verification.checks?.toObject?.(), ...decision.checklist };
  const unchecked = MANDATORY_CHECKS.filter((key) => !checklist[key]);
  if (unchecked.length) {
    throw new BadRequestError(
      ERROR_CODES.MISSING_FIELD,
      MESSAGES.ADMIN.CHECKLIST_INCOMPLETE,
      unchecked.map((field) => ({ field, message: 'This check must pass before approval' })),
    );
  }

  const before = {
    verificationStatus: employer.verificationStatus,
    status: employer.status,
  };

  const { jobsMadeVisible } = await withTransaction(
    async (session) => {
      employer.verificationStatus = VERIFICATION_STATUS.VERIFIED;
      employer.verification.reviewedAt = new Date();
      employer.verification.reviewedBy = actor.id;
      employer.verification.rejectionReason = null;
      employer.verification.rejectionCategory = null;
      employer.verification.checks = checklist;
      employer.verification.adminNotes = decision.note ?? employer.verification.adminNotes;
      await employer.save({ session });

      // Keep the denormalised snapshot on existing jobs in step with reality.
      await jobRepository.refreshCompanySnapshot(
        employerId,
        buildSnapshot(employer, true),
        { session },
      );

      // ★ Everything they already had approved becomes public in this same commit.
      const result = await jobRepository.setVisibilityForEmployer(employerId, true, { session });

      return { jobsMadeVisible: result.modifiedCount ?? 0 };
    },
    { name: 'approveEmployer' },
  );

  const owner = await userRepository.findById(String(employer.owner), {
    select: 'email firstName',
  });

  await auditService.record({
    actor,
    action: AUDIT_ACTION.EMPLOYER_VERIFIED,
    entityType: AUDIT_ENTITY.EMPLOYER_PROFILE,
    entityId: employerId,
    entityLabel: employer.companyName,
    before,
    after: { verificationStatus: VERIFICATION_STATUS.VERIFIED, jobsMadeVisible },
    reason: decision.note ?? null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  eventBus.emit(EVENTS.EMPLOYER_VERIFIED, {
    employerId,
    companyName: employer.companyName,
    ownerUserId: String(employer.owner),
    ownerEmail: owner?.email,
    ownerFirstName: owner?.firstName,
    jobsMadeVisible,
  });

  logger.info('Employer verified', { employerId, jobsMadeVisible, adminId: actor.id });

  return { employer, jobsMadeVisible };
};

/**
 * ★ Rejects a company.
 *
 * A reason is mandatory at three levels — validator, this guard, and the schema. Redundant
 * on purpose: an employer who is told "rejected" with no explanation cannot fix anything,
 * resubmits blindly, and generates another round of admin work.
 *
 * @param {string} employerId
 * @param {{reason: string, category: string}} decision
 * @param {{id: string, role: string, email: string}} actor
 * @param {{ip?: string, userAgent?: string, requestId?: string}} [ctx]
 */
export const rejectEmployer = async (employerId, decision, actor, ctx = {}) => {
  if (!decision.reason?.trim()) {
    throw new BadRequestError(ERROR_CODES.MISSING_FIELD, MESSAGES.ADMIN.REASON_REQUIRED, [
      { field: 'reason', message: 'Explain what the employer needs to change' },
    ]);
  }

  const employer = await employerRepository.findById(employerId, { lean: false });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }

  const before = { verificationStatus: employer.verificationStatus };

  const { jobsHidden } = await withTransaction(
    async (session) => {
      employer.verificationStatus = VERIFICATION_STATUS.REJECTED;
      employer.verification.reviewedAt = new Date();
      employer.verification.reviewedBy = actor.id;
      employer.verification.rejectionReason = decision.reason.trim();
      employer.verification.rejectionCategory = decision.category ?? 'OTHER';
      await employer.save({ session });

      // A previously-verified company that is now rejected must lose visibility.
      const result = await jobRepository.setVisibilityForEmployer(employerId, false, { session });
      return { jobsHidden: result.modifiedCount ?? 0 };
    },
    { name: 'rejectEmployer' },
  );

  const owner = await userRepository.findById(String(employer.owner), {
    select: 'email firstName',
  });

  await auditService.record({
    actor,
    action: AUDIT_ACTION.EMPLOYER_REJECTED,
    entityType: AUDIT_ENTITY.EMPLOYER_PROFILE,
    entityId: employerId,
    entityLabel: employer.companyName,
    before,
    after: { verificationStatus: VERIFICATION_STATUS.REJECTED, jobsHidden },
    reason: decision.reason,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  eventBus.emit(EVENTS.EMPLOYER_REJECTED, {
    employerId,
    companyName: employer.companyName,
    ownerUserId: String(employer.owner),
    ownerEmail: owner?.email,
    ownerFirstName: owner?.firstName,
    reason: decision.reason,
    category: decision.category,
  });

  logger.info('Employer rejected', { employerId, category: decision.category });

  return { employer, jobsHidden };
};

/**
 * ★ Suspends a verified company.
 *
 * The retroactive case the write-side gate cannot handle. A company that passed review and
 * later turns out to be fraudulent has live listings right now; suspension must remove them
 * from public results in this request, not at the next deploy or the next cron run.
 *
 * @param {string} employerId
 * @param {{reason: string}} decision
 * @param {{id: string, role: string, email: string}} actor
 * @param {{ip?: string, userAgent?: string, requestId?: string}} [ctx]
 */
export const suspendEmployer = async (employerId, decision, actor, ctx = {}) => {
  if (!decision.reason?.trim()) {
    throw new BadRequestError(ERROR_CODES.MISSING_FIELD, MESSAGES.ADMIN.REASON_REQUIRED, [
      { field: 'reason', message: 'A reason is required' },
    ]);
  }

  const employer = await employerRepository.findById(employerId, { lean: false });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }

  const before = { status: employer.status };

  const { jobsHidden } = await withTransaction(
    async (session) => {
      employer.status = ACCOUNT_STATUS.SUSPENDED;
      employer.suspension = { reason: decision.reason.trim(), by: actor.id, at: new Date() };
      await employer.save({ session });

      const result = await jobRepository.setVisibilityForEmployer(employerId, false, { session });
      return { jobsHidden: result.modifiedCount ?? 0 };
    },
    { name: 'suspendEmployer' },
  );

  const owner = await userRepository.findById(String(employer.owner), {
    select: 'email firstName',
  });

  await auditService.record({
    actor,
    action: AUDIT_ACTION.EMPLOYER_SUSPENDED,
    entityType: AUDIT_ENTITY.EMPLOYER_PROFILE,
    entityId: employerId,
    entityLabel: employer.companyName,
    before,
    after: { status: ACCOUNT_STATUS.SUSPENDED, jobsHidden },
    reason: decision.reason,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  eventBus.emit(EVENTS.EMPLOYER_SUSPENDED, {
    employerId,
    companyName: employer.companyName,
    ownerUserId: String(employer.owner),
    ownerEmail: owner?.email,
    ownerFirstName: owner?.firstName,
    reason: decision.reason,
    jobCount: jobsHidden,
  });

  logger.warn('Employer suspended', { employerId, jobsHidden, adminId: actor.id });

  return { employer, jobsHidden };
};

/**
 * Restores a suspended company; visibility returns only if they are still verified.
 * @param {string} employerId
 * @param {{id: string, role: string, email: string}} actor
 * @param {{ip?: string, userAgent?: string, requestId?: string}} [ctx]
 */
export const restoreEmployer = async (employerId, actor, ctx = {}) => {
  const employer = await employerRepository.findById(employerId, { lean: false });
  if (!employer) {
    throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING, MESSAGES.EMPLOYER.NOT_FOUND);
  }

  const { jobsRestored } = await withTransaction(
    async (session) => {
      employer.status = ACCOUNT_STATUS.ACTIVE;
      employer.suspension = { reason: null, by: null, at: null };
      await employer.save({ session });

      // Restoring an ACTIVE-but-unverified company must NOT publish anything.
      const shouldPublish = employer.verificationStatus === VERIFICATION_STATUS.VERIFIED;
      const result = await jobRepository.setVisibilityForEmployer(employerId, shouldPublish, {
        session,
      });
      return { jobsRestored: shouldPublish ? (result.modifiedCount ?? 0) : 0 };
    },
    { name: 'restoreEmployer' },
  );

  await auditService.record({
    actor,
    action: AUDIT_ACTION.EMPLOYER_RESTORED,
    entityType: AUDIT_ENTITY.EMPLOYER_PROFILE,
    entityId: employerId,
    entityLabel: employer.companyName,
    after: { status: ACCOUNT_STATUS.ACTIVE, jobsRestored },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  eventBus.emit(EVENTS.EMPLOYER_RESTORED, { employerId, companyName: employer.companyName });

  return { employer, jobsRestored };
};

/**
 * Automated signals shown beside the manual checklist.
 *
 * These do not decide anything — a human still clicks approve. They exist to make the
 * obvious frauds obvious: a "company" whose contact address is a free Gmail account, or
 * whose stated email domain has nothing to do with its stated website.
 *
 * @param {any} employer
 */
export const computeSignals = (employer) => {
  const website = employer.website ?? '';
  const email = employer.contact?.email ?? '';

  return {
    domainMatch: {
      pass: emailDomainMatchesWebsite(email, website),
      detail: `${email || '—'} vs ${extractDomain(website) ?? '—'}`,
    },
    freeEmailDomain: {
      pass: !isFreeEmailDomain(email),
      detail: isFreeEmailDomain(email)
        ? 'Contact address is a free/public mail provider'
        : 'Uses a company domain',
    },
    hasDocuments: {
      pass: (employer.documents?.length ?? 0) > 0,
      detail: `${employer.documents?.length ?? 0} document(s) uploaded`,
    },
    hasIdentityDoc: {
      pass: (employer.documents ?? []).some((d) => d.type === 'IDENTITY'),
      detail: 'Authorised signatory ID',
    },
    resubmission: {
      pass: (employer.verification?.attemptCount ?? 0) <= 1,
      detail: `Submission #${employer.verification?.attemptCount ?? 1}`,
    },
    profileComplete: {
      pass: employer.getSubmissionReadiness?.().ready ?? false,
      detail: 'All required fields present',
    },
  };
};

/** @param {any} employer @param {boolean} isVerified */
export const buildSnapshot = (employer, isVerified) => ({
  name: employer.companyName,
  slug: employer.slug,
  logo: employer.logo?.url ?? null,
  industry: employer.industry ?? null,
  companySize: employer.companySize ?? null,
  isVerified,
});

export default {
  submitForVerification,
  approveEmployer,
  rejectEmployer,
  suspendEmployer,
  restoreEmployer,
  computeSignals,
  buildSnapshot,
};
