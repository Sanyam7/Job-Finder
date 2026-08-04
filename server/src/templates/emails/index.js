import { BRAND } from '@verihire/shared';
import env from '../../config/env.js';
import { renderLayout, escapeHtml, toPlainText, calloutBox } from './layout.js';

/**
 * @typedef {Object} RenderedEmail
 * @property {string} subject
 * @property {string} html
 * @property {string} text
 */

/** @param {string} path @param {Record<string,string>} [query] */
const clientUrl = (path, query) => {
  const url = new URL(path, env.CLIENT_URL);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
};

/** @param {{subject: string, title: string, preheader?: string, body: string,
 *           cta?: {label: string, url: string}, footerNote?: string}} params
 * @returns {RenderedEmail} */
const build = ({ subject, title, preheader, body, cta, footerNote }) => {
  const html = renderLayout({ title, preheader, body, cta, footerNote });
  return { subject, html, text: toPlainText(html) };
};

/* ------------------------------------------------------------------ account */

/** @param {{firstName: string, token: string}} p */
export const verifyEmail = ({ firstName, token }) =>
  build({
    subject: `Verify your email · ${BRAND.name}`,
    title: `Welcome, ${escapeHtml(firstName)}`,
    preheader: 'Confirm your email address to activate your account.',
    body: `<p>Thanks for joining ${BRAND.name}. Confirm your email address to activate your account.</p>`,
    cta: { label: 'Verify my email', url: clientUrl('/verify-email', { token }) },
    footerNote: 'This link expires in 24 hours. If you did not create an account, ignore this email.',
  });

/** @param {{firstName: string, token: string, ip?: string}} p */
export const resetPassword = ({ firstName, token, ip }) =>
  build({
    subject: `Reset your password · ${BRAND.name}`,
    title: 'Reset your password',
    preheader: 'A password reset was requested for your account.',
    body:
      `<p>Hi ${escapeHtml(firstName)}, we received a request to reset your ${BRAND.name} password.</p>` +
      calloutBox(
        'warning',
        `<strong>Didn't request this?</strong> You can safely ignore this email — your password will not change.` +
          (ip ? `<br>Request origin: ${escapeHtml(ip)}` : ''),
      ),
    cta: { label: 'Choose a new password', url: clientUrl('/reset-password', { token }) },
    footerNote: 'This link expires in 1 hour and can only be used once.',
  });

/** @param {{firstName: string, at: Date, ip?: string}} p */
export const passwordChanged = ({ firstName, at, ip }) =>
  build({
    subject: `Your password was changed · ${BRAND.name}`,
    title: 'Your password was changed',
    preheader: 'Confirming a recent security change on your account.',
    body:
      `<p>Hi ${escapeHtml(firstName)}, your ${BRAND.name} password was changed on ` +
      `${escapeHtml(at.toUTCString())}${ip ? ` from ${escapeHtml(ip)}` : ''}.</p>` +
      `<p>All other signed-in devices have been signed out.</p>` +
      calloutBox(
        'danger',
        `<strong>Wasn't you?</strong> Reset your password immediately and contact ` +
          `<a href="mailto:${BRAND.supportEmail}" style="color:inherit;">${BRAND.supportEmail}</a>.`,
      ),
    cta: { label: 'Review active sessions', url: clientUrl('/candidate/settings') },
  });

/** @param {{firstName: string, ip?: string, userAgent?: string}} p */
export const securityAlert = ({ firstName, ip, userAgent }) =>
  build({
    subject: `Security alert · ${BRAND.name}`,
    title: 'We ended your sessions as a precaution',
    preheader: 'Unusual session activity was detected on your account.',
    body:
      `<p>Hi ${escapeHtml(firstName)}, we detected a sign-in token being reused on your account, ` +
      `which can indicate it was copied. We signed out every device as a precaution.</p>` +
      calloutBox(
        'danger',
        `Detected from ${escapeHtml(ip ?? 'an unknown address')}` +
          (userAgent ? `<br>${escapeHtml(userAgent)}` : '') +
          `<br><br>Sign in again and change your password if you don't recognise this.`,
      ),
    cta: { label: 'Sign in securely', url: clientUrl('/login') },
  });

/* --------------------------------------------------- employer verification (gate 1) */

/** @param {{firstName: string, companyName: string}} p */
export const employerSubmitted = ({ firstName, companyName }) =>
  build({
    subject: `We're reviewing ${companyName} · ${BRAND.name}`,
    title: 'Your company is under review',
    preheader: 'We received your verification submission.',
    body:
      `<p>Hi ${escapeHtml(firstName)}, we received the verification submission for ` +
      `<strong>${escapeHtml(companyName)}</strong>.</p>` +
      `<p>A member of our team reviews every company by hand — that is what keeps fake ` +
      `listings off ${BRAND.name}. This usually takes 24–48 hours.</p>` +
      calloutBox(
        'info',
        `You can draft jobs while you wait. They will publish as soon as your company is approved.`,
      ),
    cta: { label: 'Check status', url: clientUrl('/employer/verification') },
  });

/** @param {{firstName: string, companyName: string}} p */
export const employerApproved = ({ firstName, companyName }) =>
  build({
    subject: `${companyName} is verified · ${BRAND.name}`,
    title: "You're verified",
    preheader: 'Your company passed verification. You can post jobs now.',
    body:
      `<p>Good news, ${escapeHtml(firstName)} — <strong>${escapeHtml(companyName)}</strong> ` +
      `has been verified.</p>` +
      calloutBox(
        'success',
        `Your company now carries a verified badge, and any approved jobs you already had ` +
          `are live for candidates.`,
      ) +
      `<p>Every job you post is still reviewed individually before it goes public. That second ` +
      `check is why candidates trust what they find here.</p>`,
    cta: { label: 'Post a job', url: clientUrl('/employer/jobs/new') },
  });

/** @param {{firstName: string, companyName: string, reason: string, category?: string}} p */
export const employerRejected = ({ firstName, companyName, reason, category }) =>
  build({
    subject: `Action needed on ${companyName} · ${BRAND.name}`,
    title: 'We could not verify your company yet',
    preheader: 'Your verification submission needs changes.',
    body:
      `<p>Hi ${escapeHtml(firstName)}, we reviewed <strong>${escapeHtml(companyName)}</strong> ` +
      `and could not approve it as submitted.</p>` +
      calloutBox(
        'danger',
        `<strong>Reason${category ? ` (${escapeHtml(category)})` : ''}:</strong><br>${escapeHtml(reason)}`,
      ) +
      `<p>Fix the issue above and resubmit — there is no limit on attempts, and resubmissions ` +
      `go to the front of the queue.</p>`,
    cta: { label: 'Update and resubmit', url: clientUrl('/employer/verification') },
  });

/** @param {{firstName: string, companyName: string, reason: string, jobCount: number}} p */
export const employerSuspended = ({ firstName, companyName, reason, jobCount }) =>
  build({
    subject: `${companyName} has been suspended · ${BRAND.name}`,
    title: 'Your company account is suspended',
    preheader: 'Your listings are no longer visible to candidates.',
    body:
      `<p>Hi ${escapeHtml(firstName)}, <strong>${escapeHtml(companyName)}</strong> has been ` +
      `suspended and ${jobCount} job${jobCount === 1 ? '' : 's'} ${jobCount === 1 ? 'is' : 'are'} ` +
      `no longer visible to candidates.</p>` +
      calloutBox('danger', `<strong>Reason:</strong><br>${escapeHtml(reason)}`) +
      `<p>Reply to this email or contact ${BRAND.supportEmail} if you believe this is a mistake.</p>`,
  });

/* --------------------------------------------------------------- jobs (gate 2) */

/** @param {{firstName: string, jobTitle: string, jobSlug: string}} p */
export const jobApproved = ({ firstName, jobTitle, jobSlug }) =>
  build({
    subject: `"${jobTitle}" is live · ${BRAND.name}`,
    title: 'Your job is live',
    preheader: 'Your listing passed review and is now visible to candidates.',
    body:
      `<p>Hi ${escapeHtml(firstName)}, <strong>${escapeHtml(jobTitle)}</strong> passed review ` +
      `and is now visible to candidates.</p>` +
      calloutBox('success', `Candidates can find and apply to it right now.`),
    cta: { label: 'View your listing', url: clientUrl(`/jobs/${jobSlug}`) },
  });

/** @param {{firstName: string, jobTitle: string, jobId: string, reason: string,
 *           category?: string}} p */
export const jobRejected = ({ firstName, jobTitle, jobId, reason, category }) =>
  build({
    subject: `"${jobTitle}" needs changes · ${BRAND.name}`,
    title: 'Your job needs changes before it can go live',
    preheader: 'A reviewer left specific feedback on your listing.',
    body:
      `<p>Hi ${escapeHtml(firstName)}, we reviewed <strong>${escapeHtml(jobTitle)}</strong> and ` +
      `it cannot be published as written.</p>` +
      calloutBox(
        'danger',
        `<strong>Reason${category ? ` (${escapeHtml(category)})` : ''}:</strong><br>${escapeHtml(reason)}`,
      ) +
      `<p>Edit the listing and resubmit — it will go back into the review queue.</p>`,
    cta: { label: 'Edit this job', url: clientUrl(`/employer/jobs/${jobId}/edit`) },
  });

/** @param {{firstName: string, jobTitle: string, daysLeft: number, jobId: string}} p */
export const jobExpiringSoon = ({ firstName, jobTitle, daysLeft, jobId }) =>
  build({
    subject: `"${jobTitle}" closes in ${daysLeft} days · ${BRAND.name}`,
    title: 'A listing is about to close',
    preheader: `${jobTitle} stops accepting applications soon.`,
    body:
      `<p>Hi ${escapeHtml(firstName)}, <strong>${escapeHtml(jobTitle)}</strong> stops accepting ` +
      `applications in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.</p>` +
      `<p>Extend the deadline if you are still hiring.</p>`,
    cta: { label: 'Extend deadline', url: clientUrl(`/employer/jobs/${jobId}/edit`) },
  });

/* ------------------------------------------------------------------ applications */

/**
 * Employer-facing: someone applied.
 *
 * Carries no candidate contact details on purpose. Contact information unlocks at
 * SHORTLISTED in the API, and an email that leaked it would route straight around that rule
 * — email is the easiest place in a system to forget a permission boundary exists.
 *
 * @param {{firstName: string, candidateName: string, jobTitle: string, jobId: string,
 *          applicationId: string, totalApplications?: number}} p
 */
export const applicationReceived = ({
  firstName,
  candidateName,
  jobTitle,
  jobId,
  totalApplications,
}) =>
  build({
    subject: `New application for ${jobTitle} · ${BRAND.name}`,
    title: 'You have a new applicant',
    preheader: `${candidateName} applied for ${jobTitle}.`,
    body:
      `<p>Hi ${escapeHtml(firstName)}, <strong>${escapeHtml(candidateName)}</strong> applied for ` +
      `<strong>${escapeHtml(jobTitle)}</strong>.</p>` +
      (totalApplications
        ? calloutBox('info', `This role now has ${totalApplications} application(s).`)
        : ''),
    cta: { label: 'Review applicant', url: clientUrl(`/employer/jobs/${jobId}/applicants`) },
    footerNote: 'You receive this because you posted the role. Manage alerts in your settings.',
  });

/** @param {{firstName: string, jobTitle: string, companyName: string, applicationId: string}} p */
export const applicationShortlisted = ({ firstName, jobTitle, companyName, applicationId }) =>
  build({
    subject: `You've been shortlisted for ${jobTitle} · ${BRAND.name}`,
    title: "You've been shortlisted",
    preheader: `${companyName} shortlisted your application.`,
    body:
      `<p>Hi ${escapeHtml(firstName)} — <strong>${escapeHtml(companyName)}</strong> shortlisted ` +
      `your application for <strong>${escapeHtml(jobTitle)}</strong>.</p>` +
      calloutBox('success', `Keep an eye on your inbox: they may reach out about next steps.`),
    cta: { label: 'View application', url: clientUrl(`/candidate/applications/${applicationId}`) },
  });

/** @param {{firstName: string, jobTitle: string, companyName: string, scheduledAt: Date,
 *           mode: string, meetingLink?: string, round?: number, applicationId: string}} p */
export const interviewScheduled = ({
  firstName,
  jobTitle,
  companyName,
  scheduledAt,
  mode,
  meetingLink,
  round,
  applicationId,
}) =>
  build({
    subject: `Interview scheduled — ${jobTitle} · ${BRAND.name}`,
    title: 'Your interview is scheduled',
    preheader: `${companyName} scheduled an interview with you.`,
    body:
      `<p>Hi ${escapeHtml(firstName)}, <strong>${escapeHtml(companyName)}</strong> scheduled an ` +
      `interview for <strong>${escapeHtml(jobTitle)}</strong>.</p>` +
      calloutBox(
        'info',
        `<strong>When:</strong> ${escapeHtml(scheduledAt.toUTCString())}<br>` +
          `<strong>Format:</strong> ${escapeHtml(mode)}` +
          (round ? `<br><strong>Round:</strong> ${round}` : '') +
          (meetingLink ? `<br><strong>Link:</strong> ${escapeHtml(meetingLink)}` : ''),
      ),
    cta: { label: 'View details', url: clientUrl(`/candidate/applications/${applicationId}`) },
  });

/** @param {{firstName: string, jobTitle: string, companyName: string}} p */
export const applicationRejected = ({ firstName, jobTitle, companyName }) =>
  build({
    subject: `Update on your ${jobTitle} application · ${BRAND.name}`,
    title: 'An update on your application',
    preheader: `${companyName} has made a decision.`,
    body:
      `<p>Hi ${escapeHtml(firstName)}, ${escapeHtml(companyName)} has decided to move forward ` +
      `with other candidates for <strong>${escapeHtml(jobTitle)}</strong>.</p>` +
      `<p>That is a hard email to get, and it says nothing about your work. There are verified ` +
      `roles on ${BRAND.name} looking for your skills right now.</p>`,
    cta: { label: 'See matching jobs', url: clientUrl('/candidate/recommended') },
  });

/** @param {{firstName: string, jobTitle: string, companyName: string}} p */
export const applicationHired = ({ firstName, jobTitle, companyName }) =>
  build({
    subject: `Congratulations — ${companyName} · ${BRAND.name}`,
    title: 'Congratulations',
    preheader: 'You got the role.',
    body:
      `<p>${escapeHtml(companyName)} marked you as hired for ` +
      `<strong>${escapeHtml(jobTitle)}</strong>. Congratulations, ${escapeHtml(firstName)}.</p>` +
      calloutBox('success', `Remember to update your profile so the right roles keep finding you.`),
    cta: { label: 'Update your profile', url: clientUrl('/candidate/profile') },
  });

export default {
  verifyEmail,
  resetPassword,
  passwordChanged,
  securityAlert,
  employerSubmitted,
  employerApproved,
  employerRejected,
  employerSuspended,
  jobApproved,
  jobRejected,
  jobExpiringSoon,
  applicationReceived,
  applicationShortlisted,
  interviewScheduled,
  applicationRejected,
  applicationHired,
};
