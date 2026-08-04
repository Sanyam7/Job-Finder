/**
 * Every user-facing string the API can produce.
 *
 * Centralised so copy review is one file, and so an i18n layer can be added later without
 * hunting through 40 services for string literals.
 */
export const MESSAGES = Object.freeze({
  AUTH: {
    REGISTERED: 'Account created. Check your email to verify your address.',
    LOGIN_SUCCESS: 'Signed in successfully.',
    LOGOUT_SUCCESS: 'Signed out successfully.',
    LOGOUT_ALL_SUCCESS: 'Signed out of all devices.',
    TOKEN_REFRESHED: 'Session refreshed.',
    EMAIL_VERIFIED: 'Email verified. Welcome aboard.',
    VERIFICATION_SENT: 'If that account exists and is unverified, a new link is on its way.',
    RESET_LINK_SENT: 'If an account exists for that email, a reset link is on its way.',
    PASSWORD_RESET: 'Password reset. Please sign in with your new password.',
    PASSWORD_CHANGED: 'Password changed. Other devices have been signed out.',
    SESSIONS_FETCHED: 'Active sessions fetched.',
    SESSION_REVOKED: 'Session revoked.',
    PROFILE_FETCHED: 'Account fetched.',

    INVALID_CREDENTIALS: 'That email and password combination is not correct.',
    ACCOUNT_LOCKED: 'Too many failed attempts. Try again in {{minutes}} minutes.',
    ACCOUNT_SUSPENDED: 'This account has been suspended. Contact support for details.',
    EMAIL_TAKEN: 'An account with that email already exists.',
    EMAIL_NOT_VERIFIED: 'Please verify your email address to continue.',
    ALREADY_VERIFIED: 'That email is already verified.',
    INVALID_TOKEN: 'That link is invalid or has already been used.',
    EXPIRED_TOKEN: 'That link has expired. Please request a new one.',
    CURRENT_PASSWORD_WRONG: 'Your current password is not correct.',
    SAME_PASSWORD: 'Your new password must be different from your current one.',
    ADMIN_SIGNUP_BLOCKED: 'Admin accounts cannot be created through sign-up.',
  },

  USER: {
    FETCHED: 'User fetched.',
    UPDATED: 'Profile updated.',
    SUSPENDED: 'User suspended.',
    RESTORED: 'User restored.',
    DELETED: 'Account deleted.',
    PROMOTED: 'User promoted to admin.',
    NOT_FOUND: 'We could not find that user.',
  },

  CANDIDATE: {
    PROFILE_FETCHED: 'Profile fetched.',
    PROFILE_UPDATED: 'Profile updated.',
    PREFERENCES_UPDATED: 'Job preferences updated.',
    VISIBILITY_UPDATED: 'Profile visibility updated.',
    OPEN_TO_WORK_UPDATED: 'Open to work setting updated.',
    AVATAR_UPDATED: 'Profile picture updated.',
    AVATAR_REMOVED: 'Profile picture removed.',
    ITEM_ADDED: 'Added to your profile.',
    ITEM_UPDATED: 'Updated.',
    ITEM_REMOVED: 'Removed from your profile.',
    SKILLS_UPDATED: 'Skills updated.',
    NOT_FOUND: 'We could not find that candidate profile.',
    NOT_VISIBLE: 'This candidate profile is not available.',
  },

  RESUME: {
    UPLOADED: "Resume uploaded. We're reading it now — this usually takes a few seconds.",
    PARSED: 'We finished reading your resume.',
    PARSE_FAILED: "We couldn't read that resume. You can still fill in your profile manually.",
    DELETED: 'Resume removed.',
    DRAFT_FETCHED: 'Extracted details fetched.',
    DRAFT_APPLIED: 'Selected details saved to your profile.',
    DRAFT_DISCARDED: 'Extracted details discarded. Your profile is unchanged.',
    REPARSE_QUEUED: 'Re-reading your resume.',
    REQUIRED: 'Upload a resume before applying to jobs.',
    NONE: 'No resume on file.',
    ACCESS_DENIED: 'You do not have access to this resume.',
  },

  EMPLOYER: {
    PROFILE_FETCHED: 'Company profile fetched.',
    PROFILE_UPDATED: 'Company profile updated.',
    PROFILE_UPDATED_REVERIFY:
      'Company profile updated. Because you changed verified details, your company has been ' +
      'sent back for review.',
    LOGO_UPDATED: 'Company logo updated.',
    DOCUMENT_UPLOADED: 'Document uploaded.',
    DOCUMENT_REMOVED: 'Document removed.',
    VERIFICATION_SUBMITTED:
      'Submitted for review. We usually complete verification within 24–48 hours.',
    VERIFICATION_FETCHED: 'Verification status fetched.',
    NOT_FOUND: 'We could not find that company.',

    NOT_VERIFIED:
      'Your company is still being verified. You can post jobs once an admin approves it.',
    SUSPENDED: 'This company account has been suspended.',
    ALREADY_PENDING: 'Your submission is already under review.',
    ALREADY_VERIFIED: 'Your company is already verified.',
    DOCUMENTS_REQUIRED: 'Upload at least one supporting document before submitting.',
    INCOMPLETE_PROFILE: 'Complete the required company details before submitting.',
    DOCUMENTS_LOCKED: 'Documents cannot be changed while your submission is under review.',
  },

  JOB: {
    CREATED: 'Job saved as a draft.',
    UPDATED: 'Job updated.',
    UPDATED_REVERIFY:
      'Job updated. Because you changed key details, it has been sent back for review and is ' +
      'temporarily hidden from candidates.',
    SUBMITTED: 'Submitted for review. It will go live once an admin approves it.',
    APPROVED: 'Job approved and published.',
    REJECTED: 'Job rejected.',
    ARCHIVED: 'Job archived and removed from search.',
    REOPENED: 'Job reopened and sent for review.',
    CLONED: 'Job duplicated as a new draft.',
    DELETED: 'Job deleted.',
    FETCHED: 'Job fetched.',
    LIST_FETCHED: 'Jobs fetched.',
    STATS_FETCHED: 'Job statistics fetched.',
    NOT_FOUND: 'We could not find that job.',
    DEADLINE_PASSED: 'The application deadline for this job has passed.',
    NOT_ACCEPTING: 'This job is no longer accepting applications.',
    ALREADY_PENDING: 'This job is already awaiting review.',
    NOTHING_TO_SUBMIT: 'Only drafts and rejected jobs can be submitted for review.',
  },

  APPLICATION: {
    CREATED: 'Application submitted.',
    FETCHED: 'Application fetched.',
    LIST_FETCHED: 'Applications fetched.',
    TIMELINE_FETCHED: 'Timeline fetched.',
    STATUS_UPDATED: 'Application status updated.',
    VIEWED: 'Marked as viewed.',
    SHORTLISTED: 'Candidate shortlisted.',
    REJECTED: 'Application rejected.',
    INTERVIEW_SCHEDULED: 'Interview scheduled.',
    HIRED: 'Candidate marked as hired.',
    WITHDRAWN: 'Application withdrawn.',
    NOTES_UPDATED: 'Notes updated.',
    BULK_UPDATED: '{{count}} applications updated.',
    NOT_FOUND: 'We could not find that application.',
    ALREADY_APPLIED: "You've already applied to this job.",
    CANNOT_WITHDRAW: 'This application can no longer be withdrawn.',
    INVALID_TRANSITION: 'You cannot move an application from {{from}} to {{to}}.',
    REASON_REQUIRED: 'A reason is required when rejecting an application.',
  },

  ADMIN: {
    DASHBOARD_FETCHED: 'Dashboard fetched.',
    ANALYTICS_FETCHED: 'Analytics fetched.',
    QUEUE_FETCHED: 'Queue fetched.',
    EMPLOYER_VERIFIED: '{{company}} verified. Their approved jobs are now public.',
    EMPLOYER_REJECTED: '{{company}} rejected and notified.',
    EMPLOYER_SUSPENDED: '{{company}} suspended. {{count}} jobs were hidden.',
    EMPLOYER_RESTORED: '{{company}} restored.',
    JOB_APPROVED: 'Job approved and now visible to candidates.',
    JOB_REJECTED: 'Job rejected and the employer has been notified.',
    BULK_APPROVED: '{{count}} jobs approved.',
    REPORT_RESOLVED: 'Report resolved.',
    AUDIT_FETCHED: 'Audit log fetched.',
    REASON_REQUIRED: 'A reason is required when rejecting.',
    CANNOT_MODIFY_SELF: 'You cannot perform that action on your own account.',
    CHECKLIST_INCOMPLETE: 'Complete every required verification check before approving.',
  },

  NOTIFICATION: {
    LIST_FETCHED: 'Notifications fetched.',
    COUNT_FETCHED: 'Unread count fetched.',
    MARKED_READ: 'Marked as read.',
    ALL_MARKED_READ: 'All notifications marked as read.',
    DELETED: 'Notification removed.',
    CLEARED: 'Read notifications cleared.',
  },

  BOOKMARK: {
    CREATED: 'Saved.',
    REMOVED: 'Removed.',
    LIST_FETCHED: 'Saved items fetched.',
    ALREADY_EXISTS: 'Already saved.',
  },

  SEARCH: {
    JOBS_FETCHED: 'Jobs fetched.',
    CANDIDATES_FETCHED: 'Candidates fetched.',
    COMPANIES_FETCHED: 'Companies fetched.',
    SUGGESTIONS_FETCHED: 'Suggestions fetched.',
  },

  PUBLIC: {
    STATS_FETCHED: 'Platform statistics fetched.',
    CONTACT_RECEIVED: "Thanks for reaching out — we'll get back to you shortly.",
    REPORT_RECEIVED: 'Thanks for the report. Our team will review it.',
  },

  UPLOAD: {
    SUCCESS: 'File uploaded.',
    DELETED: 'File deleted.',
    FAILED: 'Upload failed. Please try again.',
    NO_FILE: 'No file was provided.',
    TOO_LARGE: 'That file is larger than the {{limit}} limit.',
    INVALID_TYPE: 'Only {{types}} files are accepted.',
    CORRUPTED: "That file appears to be corrupted or isn't the type it claims to be.",
  },

  ERROR: {
    INTERNAL: 'Something went wrong on our end. Please try again.',
    NOT_FOUND: 'We could not find what you were looking for.',
    ROUTE_NOT_FOUND: 'No route matches {{method}} {{path}}.',
    FORBIDDEN: "You don't have permission to do that.",
    UNAUTHORIZED: 'You need to sign in to do that.',
    VALIDATION: 'Please correct the highlighted fields.',
    RATE_LIMITED: 'Too many requests. Please slow down and try again shortly.',
    INVALID_ID: 'That identifier is not valid.',
    DB_UNAVAILABLE: 'The database is temporarily unavailable.',
  },
});

/**
 * Fills `{{placeholders}}` in a message template.
 * @param {string} template
 * @param {Record<string, string|number>} values
 * @returns {string}
 */
export const format = (template, values = {}) =>
  template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    values[key] !== undefined ? String(values[key]) : match,
  );

export default MESSAGES;
