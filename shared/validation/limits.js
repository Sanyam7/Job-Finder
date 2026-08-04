/**
 * Every numeric bound in the product lives here.
 *
 * The Yup schemas on the client and the express-validator rules on the server both import
 * these, so `MIN_PASSWORD_LENGTH` can never drift between the two sides.
 */
export const LIMITS = Object.freeze({
  /* auth */
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 50,
  MAX_LOGIN_ATTEMPTS: 5,
  ACCOUNT_LOCK_MINUTES: 15,

  /* candidate profile */
  MAX_HEADLINE_LENGTH: 120,
  MAX_BIO_LENGTH: 2000,
  MAX_SKILLS: 50,
  MAX_EXPERIENCE_ENTRIES: 30,
  MAX_EDUCATION_ENTRIES: 15,
  MAX_PROJECT_ENTRIES: 20,
  MAX_CERTIFICATION_ENTRIES: 30,
  MAX_ACHIEVEMENT_ENTRIES: 20,
  MAX_LANGUAGE_ENTRIES: 10,
  MAX_ACHIEVEMENT_LENGTH: 300,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_NOTICE_PERIOD_DAYS: 180,
  MAX_TOTAL_EXPERIENCE_MONTHS: 720, // 60 years

  /* employer profile */
  MIN_COMPANY_NAME_LENGTH: 2,
  MAX_COMPANY_NAME_LENGTH: 100,
  MAX_COMPANY_DESCRIPTION_LENGTH: 5000,
  MAX_TAGLINE_LENGTH: 150,
  MAX_COMPANY_DOCUMENTS: 8,
  MIN_FOUNDED_YEAR: 1800,

  /* job */
  MIN_JOB_TITLE_LENGTH: 3,
  MAX_JOB_TITLE_LENGTH: 120,
  MIN_JOB_DESCRIPTION_LENGTH: 50,
  MAX_JOB_DESCRIPTION_LENGTH: 10000,
  MAX_JOB_LIST_ITEMS: 25,
  MAX_JOB_LIST_ITEM_LENGTH: 300,
  MAX_JOB_SKILLS: 25,
  MIN_OPENINGS: 1,
  MAX_OPENINGS: 999,
  MAX_DEADLINE_DAYS_AHEAD: 365,

  /* application */
  MAX_COVER_LETTER_LENGTH: 3000,
  MAX_EMPLOYER_NOTES_LENGTH: 2000,
  MAX_REJECTION_REASON_LENGTH: 1000,
  MIN_REJECTION_REASON_LENGTH: 10,
  MAX_BULK_IDS: 50,

  /* uploads (bytes) */
  MAX_RESUME_BYTES: 5 * 1024 * 1024,
  MAX_IMAGE_BYTES: 2 * 1024 * 1024,
  MAX_DOCUMENT_BYTES: 5 * 1024 * 1024,

  /* pagination */
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
  MAX_PAGE: 500,

  /* search */
  MIN_SEARCH_LENGTH: 2,
  MAX_SEARCH_LENGTH: 100,
  MAX_EXPERIENCE_YEARS_FILTER: 40,

  /* misc */
  MAX_CONTACT_MESSAGE_LENGTH: 2000,
  MAX_REPORT_DESCRIPTION_LENGTH: 1000,
  MAX_ADMIN_NOTE_LENGTH: 2000,
});

export const ALLOWED_RESUME_MIME = Object.freeze([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const ALLOWED_RESUME_EXT = Object.freeze(['.pdf', '.doc', '.docx']);

export const ALLOWED_IMAGE_MIME = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const ALLOWED_IMAGE_EXT = Object.freeze(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export const ALLOWED_DOCUMENT_MIME = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * Magic-byte signatures. We sniff the actual bytes rather than trusting the client's
 * Content-Type header, which is trivially spoofed.
 */
export const FILE_SIGNATURES = Object.freeze({
  pdf: ['25504446'], // %PDF
  jpg: ['ffd8ffe0', 'ffd8ffe1', 'ffd8ffe2', 'ffd8ffe3', 'ffd8ffe8', 'ffd8ffdb'],
  png: ['89504e47'],
  gif: ['47494638'],
  webp: ['52494646'], // RIFF — plus a 'WEBP' check at offset 8
  zip: ['504b0304', '504b0506', '504b0708'], // docx is a zip container
  doc: ['d0cf11e0'], // legacy OLE compound file
});
