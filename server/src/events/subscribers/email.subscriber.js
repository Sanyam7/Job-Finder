import { eventBus } from '../eventBus.js';
import { EVENTS } from '../../constants/events.js';
import { sendTemplate } from '../../services/email.service.js';

/**
 * Turns domain events into outbound email.
 *
 * Nothing here can fail a business operation — `eventBus.subscribe` swallows and logs
 * exceptions by design. An SMTP outage must not prevent a job from being approved.
 */
export const registerEmailSubscribers = () => {
  // No USER_REGISTERED handler: there is no verification step to email anybody about.
  // Registration completes an account outright, so nothing is pending on delivery.

  eventBus.subscribe(
    EVENTS.PASSWORD_RESET_REQUESTED,
    async ({ email, firstName, resetToken, ip }) => {
      await sendTemplate('resetPassword', email, { firstName, token: resetToken, ip });
    },
    { name: 'sendResetEmail' },
  );

  eventBus.subscribe(
    EVENTS.PASSWORD_CHANGED,
    async ({ email, firstName, ip }) => {
      await sendTemplate('passwordChanged', email, { firstName, at: new Date(), ip });
    },
    { name: 'sendPasswordChangedEmail' },
  );

  eventBus.subscribe(
    EVENTS.PASSWORD_RESET_COMPLETED,
    async ({ email, firstName, ip }) => {
      await sendTemplate('passwordChanged', email, { firstName, at: new Date(), ip });
    },
    { name: 'sendPasswordResetConfirmation' },
  );

  eventBus.subscribe(
    EVENTS.SECURITY_TOKEN_REUSE,
    async ({ userId, ip, userAgent }) => {
      const { userRepository } = await import('../../repositories/user.repository.js');
      const user = await userRepository.findById(userId, { select: 'email firstName' });
      if (!user) return;
      await sendTemplate('securityAlert', user.email, {
        firstName: user.firstName,
        ip,
        userAgent,
      });
    },
    { name: 'sendSecurityAlert' },
  );

  /* ---- employer verification (gate 1) ---- */

  eventBus.subscribe(
    EVENTS.EMPLOYER_SUBMITTED,
    async ({ ownerEmail, ownerFirstName, companyName }) => {
      if (!ownerEmail) return;
      await sendTemplate('employerSubmitted', ownerEmail, {
        firstName: ownerFirstName,
        companyName,
      });
    },
    { name: 'sendEmployerSubmittedEmail' },
  );

  eventBus.subscribe(
    EVENTS.EMPLOYER_VERIFIED,
    async ({ ownerEmail, ownerFirstName, companyName }) => {
      if (!ownerEmail) return;
      await sendTemplate('employerApproved', ownerEmail, {
        firstName: ownerFirstName,
        companyName,
      });
    },
    { name: 'sendEmployerApprovedEmail' },
  );

  eventBus.subscribe(
    EVENTS.EMPLOYER_REJECTED,
    async ({ ownerEmail, ownerFirstName, companyName, reason, category }) => {
      if (!ownerEmail) return;
      await sendTemplate('employerRejected', ownerEmail, {
        firstName: ownerFirstName,
        companyName,
        reason,
        category,
      });
    },
    { name: 'sendEmployerRejectedEmail' },
  );

  eventBus.subscribe(
    EVENTS.EMPLOYER_SUSPENDED,
    async ({ ownerEmail, ownerFirstName, companyName, reason, jobCount = 0 }) => {
      if (!ownerEmail) return;
      await sendTemplate('employerSuspended', ownerEmail, {
        firstName: ownerFirstName,
        companyName,
        reason,
        jobCount,
      });
    },
    { name: 'sendEmployerSuspendedEmail' },
  );

  /* ---- jobs (gate 2) ---- */

  eventBus.subscribe(
    EVENTS.JOB_APPROVED,
    async ({ ownerEmail, ownerFirstName, jobTitle, jobSlug }) => {
      if (!ownerEmail) return;
      await sendTemplate('jobApproved', ownerEmail, {
        firstName: ownerFirstName,
        jobTitle,
        jobSlug,
      });
    },
    { name: 'sendJobApprovedEmail' },
  );

  eventBus.subscribe(
    EVENTS.JOB_REJECTED,
    async ({ ownerEmail, ownerFirstName, jobTitle, jobId, reason, category }) => {
      if (!ownerEmail) return;
      await sendTemplate('jobRejected', ownerEmail, {
        firstName: ownerFirstName,
        jobTitle,
        jobId,
        reason,
        category,
      });
    },
    { name: 'sendJobRejectedEmail' },
  );

  eventBus.subscribe(
    EVENTS.JOB_EXPIRING_SOON,
    async ({ ownerEmail, ownerFirstName, jobTitle, jobId, daysLeft }) => {
      if (!ownerEmail) return;
      await sendTemplate('jobExpiringSoon', ownerEmail, {
        firstName: ownerFirstName,
        jobTitle,
        jobId,
        daysLeft,
      });
    },
    { name: 'sendJobExpiringEmail' },
  );

  /* ---- applications ---- */

  /**
   * Notifies the employer that someone applied.
   *
   * The owner's address is resolved here rather than being carried on the event: the apply
   * transaction should not do two extra reads to decorate a payload for a subscriber that
   * may be disabled. Emitters describe what happened; subscribers fetch what they need.
   */
  eventBus.subscribe(
    EVENTS.APPLICATION_CREATED,
    async ({ employerId, jobId, jobTitle, candidateName, applicationId }) => {
      const { employerRepository } = await import('../../repositories/employer.repository.js');
      const { userRepository } = await import('../../repositories/user.repository.js');

      const employer = await employerRepository.findById(employerId, { select: 'owner' });
      if (!employer?.owner) return;

      const owner = await userRepository.findById(String(employer.owner), {
        select: 'email firstName',
      });
      if (!owner?.email) return;

      await sendTemplate('applicationReceived', owner.email, {
        firstName: owner.firstName,
        candidateName: candidateName || 'A candidate',
        jobTitle,
        jobId,
        applicationId,
      });
    },
    { name: 'sendApplicationReceivedEmail' },
  );

  eventBus.subscribe(
    EVENTS.APPLICATION_SHORTLISTED,
    async ({ candidateEmail, candidateFirstName, jobTitle, companyName, applicationId }) => {
      if (!candidateEmail) return;
      await sendTemplate('applicationShortlisted', candidateEmail, {
        firstName: candidateFirstName,
        jobTitle,
        companyName,
        applicationId,
      });
    },
    { name: 'sendShortlistedEmail' },
  );

  eventBus.subscribe(
    EVENTS.APPLICATION_INTERVIEW,
    async (payload) => {
      if (!payload.candidateEmail) return;
      await sendTemplate('interviewScheduled', payload.candidateEmail, {
        firstName: payload.candidateFirstName,
        jobTitle: payload.jobTitle,
        companyName: payload.companyName,
        scheduledAt: new Date(payload.scheduledAt),
        mode: payload.mode,
        meetingLink: payload.meetingLink,
        round: payload.round,
        applicationId: payload.applicationId,
      });
    },
    { name: 'sendInterviewEmail' },
  );

  eventBus.subscribe(
    EVENTS.APPLICATION_REJECTED,
    async ({ candidateEmail, candidateFirstName, jobTitle, companyName }) => {
      if (!candidateEmail) return;
      await sendTemplate('applicationRejected', candidateEmail, {
        firstName: candidateFirstName,
        jobTitle,
        companyName,
      });
    },
    { name: 'sendApplicationRejectedEmail' },
  );

  eventBus.subscribe(
    EVENTS.APPLICATION_HIRED,
    async ({ candidateEmail, candidateFirstName, jobTitle, companyName }) => {
      if (!candidateEmail) return;
      await sendTemplate('applicationHired', candidateEmail, {
        firstName: candidateFirstName,
        jobTitle,
        companyName,
      });
    },
    { name: 'sendHiredEmail' },
  );
};

export default registerEmailSubscribers;
