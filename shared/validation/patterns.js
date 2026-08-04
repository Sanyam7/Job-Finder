/** Regex patterns used identically by client Yup schemas and server validators. */

export const PATTERNS = Object.freeze({
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  /**
   * At least one lowercase, one uppercase, one digit and one special character.
   * Length is checked separately so the two failures produce distinct messages.
   */
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/,

  /** E.164-ish with optional separators. */
  PHONE: /^\+?[1-9]\d{0,3}[-\s]?\(?\d{1,4}\)?[-\s]?\d{3,4}[-\s]?\d{3,4}$/,

  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)$/,

  LINKEDIN_PROFILE: /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/,
  LINKEDIN_COMPANY: /^https?:\/\/(www\.)?linkedin\.com\/company\/[a-zA-Z0-9_.-]+\/?$/,
  GITHUB: /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/,

  /** Indian GSTIN. */
  GST: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
  PAN: /^[A-Z]{5}\d{4}[A-Z]{1}$/,

  OBJECT_ID: /^[0-9a-fA-F]{24}$/,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  HEX_TOKEN: /^[a-f0-9]{64}$/,

  /** Letters, spaces, hyphens and apostrophes — accommodates names like O'Brien, Jean-Luc. */
  HUMAN_NAME: /^[\p{L}][\p{L}\s'.-]*$/u,

  YEAR: /^(19|20)\d{2}$/,
  NO_HTML: /^[^<>]*$/,
});

/** @param {string} value */
export const isEmail = (value) => PATTERNS.EMAIL.test(String(value ?? '').trim());

/** @param {string} value */
export const isObjectId = (value) => PATTERNS.OBJECT_ID.test(String(value ?? ''));

/** @param {string} value */
export const isUrl = (value) => PATTERNS.URL.test(String(value ?? '').trim());

/**
 * Extracts a bare hostname for the "does the contact email domain match the website?"
 * verification check.
 * @param {string} url
 * @returns {string|null}
 */
export const extractDomain = (url) => {
  if (!url) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProtocol).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
};

/** @param {string} email */
export const extractEmailDomain = (email) => {
  const at = String(email ?? '').lastIndexOf('@');
  return at === -1 ? null : email.slice(at + 1).trim().toLowerCase();
};

/**
 * ★ Used by the admin verification checklist: does hr@acmetech.io belong to acmetech.io?
 * Accepts subdomains (careers.acmetech.io matches acmetech.io).
 * @param {string} email
 * @param {string} website
 */
export const emailDomainMatchesWebsite = (email, website) => {
  const emailDomain = extractEmailDomain(email);
  const siteDomain = extractDomain(website);
  if (!emailDomain || !siteDomain) return false;
  return emailDomain === siteDomain || emailDomain.endsWith(`.${siteDomain}`);
};

/** Free/public mail providers are a signal that a "company email" is not a company email. */
export const FREE_EMAIL_DOMAINS = Object.freeze([
  'gmail.com',
  'yahoo.com',
  'yahoo.co.in',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'aol.com',
  'icloud.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
  'rediffmail.com',
]);

/** @param {string} email */
export const isFreeEmailDomain = (email) => {
  const domain = extractEmailDomain(email);
  return domain ? FREE_EMAIL_DOMAINS.includes(domain) : false;
};
