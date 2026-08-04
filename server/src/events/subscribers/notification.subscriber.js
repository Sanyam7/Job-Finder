import { NOTIFICATION_TYPE, ROLES } from '@verihire/shared';
import { eventBus } from '../eventBus.js';
import { EVENTS } from '../../constants/events.js';
import * as notificationService from '../../services/notification.service.js';

/**
 * Turns domain events into in-app notifications.
 *
 * ★ ADR-008 in practice: `verification.service` emits `employer.verified` and knows nothing
 * about a bell icon. Everything a user is told in-app is decided here, in one file, which is
 * also the only place to look when someone asks "why did I get that?".
 *
 * `eventBus.subscribe` swallows and logs exceptions, so nothing below can fail the business
 * action that triggered it.
 */

/** Resolves an employer profile id to the user who owns it. */
const ownerOf = async (employerId) => {
  const { employerRepository } = await import('../../repositories/employer.repository.js');
  const employer = await employerRepository.findById(employerId, { select: 'owner companyName' });
  return employer ? { userId: String(employer.owner), companyName: employer.companyName } : null;
};

/** Every admin, for queue alerts. */
const admins = async () => {
  const { userRepository } = await import('../../repositories/user.repository.js');
  const rows = await userRepository.find(
    { role: ROLES.ADMIN, status: 'ACTIVE', deletedAt: null },
    { select: '_id' },
  );
  return rows.map((u) => String(u._id));
};

export const registerNotificationSubscribers = () => {
  /* ------------------------------------------------ gate 1 — employers */

  eventBus.subscribe(
    EVENTS.EMPLOYER_SUBMITTED,
    async ({ employerId, companyName }) => {
      const owner = await ownerOf(employerId);
      if (owner) {
        await notificationService.push({
          recipient: owner.userId,
          type: NOTIFICATION_TYPE.EMPLOYER_SUBMITTED,
          title: 'Company submitted for review',
          body: 'We usually complete verification within 24–48 hours.',
          link: '/employer/verification',
          entity: { type: 'EMPLOYER_PROFILE', id: employerId, label: companyName },
        });
      }

      /**
       * ★ The queue alert. Manual verification is the product; an admin team that does not
       * know a company is waiting *is* the bottleneck, and the whole promise degrades into
       * "your listing goes live in a week".
       */
      await notificationService.pushMany(await admins(), {
        type: NOTIFICATION_TYPE.ADMIN_NEW_EMPLOYER_PENDING,
        title: `${companyName} is waiting for verification`,
        link: '/admin/employers?status=PENDING',
        entity: { type: 'EMPLOYER_PROFILE', id: employerId, label: companyName },
        // One alert per submission, not one per admin page load or retry.
        dedupeKey: `employer-pending:${employerId}`,
      });
    },
    { name: 'notifyEmployerSubmitted' },
  );

  eventBus.subscribe(
    EVENTS.EMPLOYER_VERIFIED,
    async ({ employerId, companyName, publishedJobs = 0 }) => {
      const owner = await ownerOf(employerId);
      if (!owner) return;

      await notificationService.push({
        recipient: owner.userId,
        type: NOTIFICATION_TYPE.EMPLOYER_APPROVED,
        title: 'Your company is verified',
        body: publishedJobs
          ? `${publishedJobs} of your approved job(s) are now live.`
          : 'You can now post jobs.',
        link: '/employer/dashboard',
        entity: { type: 'EMPLOYER_PROFILE', id: employerId, label: companyName },
      });
    },
    { name: 'notifyEmployerVerified' },
  );

  eventBus.subscribe(
    EVENTS.EMPLOYER_REJECTED,
    async ({ employerId, companyName, reason }) => {
      const owner = await ownerOf(employerId);
      if (!owner) return;

      await notificationService.push({
        recipient: owner.userId,
        type: NOTIFICATION_TYPE.EMPLOYER_REJECTED,
        title: 'Your company was not approved',
        // The reason travels with the notification: making them open a page to find out why
        // is how a rejection becomes a support ticket.
        body: reason,
        link: '/employer/verification',
        entity: { type: 'EMPLOYER_PROFILE', id: employerId, label: companyName },
      });
    },
    { name: 'notifyEmployerRejected' },
  );

  eventBus.subscribe(
    EVENTS.EMPLOYER_SUSPENDED,
    async ({ employerId, companyName, reason, jobCount = 0 }) => {
      const owner = await ownerOf(employerId);
      if (!owner) return;

      await notificationService.push({
        recipient: owner.userId,
        type: NOTIFICATION_TYPE.EMPLOYER_SUSPENDED,
        title: 'Your company account is suspended',
        body: `${reason} ${jobCount} listing(s) have been hidden.`.trim(),
        link: '/employer/dashboard',
        entity: { type: 'EMPLOYER_PROFILE', id: employerId, label: companyName },
      });
    },
    { name: 'notifyEmployerSuspended' },
  );

  /* ----------------------------------------------------- gate 2 — jobs */

  eventBus.subscribe(
    EVENTS.JOB_SUBMITTED,
    async ({ jobId, title, isRevision = false }) => {
      await notificationService.pushMany(await admins(), {
        type: NOTIFICATION_TYPE.ADMIN_NEW_JOB_PENDING,
        title: isRevision ? `Revised listing needs re-review: ${title}` : `New listing: ${title}`,
        // A revision is a job that was approved and then materially edited — the exact
        // fraud vector the material-edit rule closes, so it is worth calling out.
        body: isRevision ? 'This job was edited after approval and is hidden until reviewed.' : null,
        link: '/admin/jobs?status=PENDING',
        entity: { type: 'JOB', id: jobId, label: title },
        dedupeKey: `job-pending:${jobId}`,
      });
    },
    { name: 'notifyJobSubmitted' },
  );

  eventBus.subscribe(
    EVENTS.JOB_APPROVED,
    async ({ jobId, jobTitle, jobSlug, ownerUserId, isPubliclyVisible }) => {
      if (!ownerUserId) return;

      await notificationService.push({
        recipient: ownerUserId,
        type: NOTIFICATION_TYPE.JOB_APPROVED,
        title: `${jobTitle} was approved`,
        // An approved-but-hidden job confuses everyone; say so rather than claiming it is live.
        body: isPubliclyVisible
          ? 'It is now visible to candidates.'
          : 'It will go live as soon as your company is verified and active.',
        link: isPubliclyVisible ? `/jobs/${jobSlug}` : '/employer/jobs',
        entity: { type: 'JOB', id: jobId, label: jobTitle },
      });
    },
    { name: 'notifyJobApproved' },
  );

  eventBus.subscribe(
    EVENTS.JOB_REJECTED,
    async ({ jobId, jobTitle, employerId, reason }) => {
      const owner = await ownerOf(employerId);
      if (!owner) return;

      await notificationService.push({
        recipient: owner.userId,
        type: NOTIFICATION_TYPE.JOB_REJECTED,
        title: `${jobTitle} was not approved`,
        body: reason,
        link: `/employer/jobs/${jobId}/edit`,
        entity: { type: 'JOB', id: jobId, label: jobTitle },
      });
    },
    { name: 'notifyJobRejected' },
  );

  eventBus.subscribe(
    EVENTS.JOB_EXPIRING_SOON,
    async ({ jobId, jobTitle, ownerUserId, daysLeft }) => {
      if (!ownerUserId) return;

      await notificationService.push({
        recipient: ownerUserId,
        type: NOTIFICATION_TYPE.JOB_EXPIRING_SOON,
        title: `${jobTitle} expires in ${daysLeft} day(s)`,
        link: `/employer/jobs/${jobId}/edit`,
        entity: { type: 'JOB', id: jobId, label: jobTitle },
        // ★ Day-scoped: the cron runs daily, and without this the same warning would be
        // posted every morning for three mornings running.
        dedupeKey: `job-expiring:${jobId}:${daysLeft}`,
      });
    },
    { name: 'notifyJobExpiringSoon' },
  );

  /* ------------------------------------------------------ applications */

  eventBus.subscribe(
    EVENTS.APPLICATION_CREATED,
    async ({ applicationId, employerId, jobTitle, candidateName }) => {
      const owner = await ownerOf(employerId);
      if (!owner) return;

      await notificationService.push({
        recipient: owner.userId,
        type: NOTIFICATION_TYPE.APPLICATION_RECEIVED,
        title: `New applicant for ${jobTitle}`,
        body: candidateName || null,
        link: `/employer/applications/${applicationId}`,
        entity: { type: 'APPLICATION', id: applicationId, label: jobTitle },
      });
    },
    { name: 'notifyApplicationReceived' },
  );

  /**
   * Candidate-facing status changes.
   *
   * One handler for five events: the message copy differs but the shape does not, and five
   * near-identical subscribers is where one of them quietly gets the wrong link.
   */
  const CANDIDATE_STATUS_EVENTS = [
    [EVENTS.APPLICATION_VIEWED, NOTIFICATION_TYPE.APPLICATION_VIEWED, 'Your application was viewed'],
    [EVENTS.APPLICATION_SHORTLISTED, NOTIFICATION_TYPE.APPLICATION_SHORTLISTED, "You've been shortlisted"],
    [EVENTS.APPLICATION_INTERVIEW, NOTIFICATION_TYPE.INTERVIEW_SCHEDULED, 'An interview has been scheduled'],
    [EVENTS.APPLICATION_REJECTED, NOTIFICATION_TYPE.APPLICATION_REJECTED, 'An update on your application'],
    [EVENTS.APPLICATION_HIRED, NOTIFICATION_TYPE.APPLICATION_HIRED, 'Congratulations — you got the role'],
  ];

  for (const [event, type, title] of CANDIDATE_STATUS_EVENTS) {
    eventBus.subscribe(
      event,
      async ({ applicationId, applicantId, jobTitle, companyName, reason }) => {
        if (!applicantId) return;

        await notificationService.push({
          recipient: applicantId,
          type,
          title,
          body: [companyName && `${companyName} · ${jobTitle}`, reason].filter(Boolean).join(' — '),
          link: `/candidate/applications/${applicationId}`,
          entity: { type: 'APPLICATION', id: applicationId, label: jobTitle },
        });
      },
      { name: `notify${type}` },
    );
  }

  /* ----------------------------------------------------------- resume */

  eventBus.subscribe(
    EVENTS.RESUME_PARSED,
    async ({ userId, fieldCount }) => {
      if (!userId) return;

      await notificationService.push({
        recipient: userId,
        type: NOTIFICATION_TYPE.RESUME_PARSED,
        title: 'We finished reading your resume',
        // The wording is deliberate: nothing has been applied, and the notification must not
        // imply their profile changed while they were away.
        body: `${fieldCount} detail(s) are ready for you to review and accept.`,
        link: '/candidate/profile/import',
      });
    },
    { name: 'notifyResumeParsed' },
  );

  eventBus.subscribe(
    EVENTS.RESUME_PARSE_FAILED,
    async ({ userId }) => {
      if (!userId) return;

      await notificationService.push({
        recipient: userId,
        type: NOTIFICATION_TYPE.RESUME_PARSE_FAILED,
        title: "We couldn't read that resume",
        body: 'Your resume is still attached to applications. You can fill in your profile manually.',
        link: '/candidate/profile',
      });
    },
    { name: 'notifyResumeParseFailed' },
  );

  /* --------------------------------------------------------- security */

  eventBus.subscribe(
    EVENTS.SECURITY_TOKEN_REUSE,
    async ({ userId }) => {
      if (!userId) return;

      await notificationService.push({
        recipient: userId,
        type: NOTIFICATION_TYPE.SECURITY_ALERT,
        title: 'You were signed out for security reasons',
        body: 'A session token was reused, so every session was ended. Sign in again to continue.',
        link: '/settings/security',
      });
    },
    { name: 'notifyTokenReuse' },
  );
};

export default registerNotificationSubscribers;
