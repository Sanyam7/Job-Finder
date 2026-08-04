import sanitizeHtml from 'sanitize-html';

/**
 * Strips `$` and `.` from request keys to defeat NoSQL operator injection.
 *
 * `express-mongo-sanitize` v2 mutates `req.query`, which Express 5 exposes as a getter-only
 * property — so we sanitise in place rather than reassigning. Mongoose's `sanitizeFilter`
 * is a second layer behind this one.
 *
 * @type {import('express').RequestHandler}
 */
export const mongoSanitize = (req, _res, next) => {
  for (const key of ['body', 'params', 'query']) {
    const target = req[key];
    if (target && typeof target === 'object') scrubKeys(target);
  }
  next();
};

/** @param {Record<string, any>} obj */
const scrubKeys = (obj) => {
  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (item && typeof item === 'object') scrubKeys(item);
    });
    return;
  }
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
      continue;
    }
    const value = obj[key];
    if (value && typeof value === 'object') scrubKeys(value);
  }
};

/** Rich-text fields keep formatting; everything else is stripped to plain text. */
const RICH_TEXT_FIELDS = new Set([
  'description',
  'bio',
  'coverLetter',
  'responsibilities',
  'requirements',
  'niceToHave',
  'benefits',
  'notes',
  'adminNotes',
  'employerNotes',
]);

const RICH_TEXT_POLICY = {
  allowedTags: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'ul', 'ol', 'li', 'h3', 'h4', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // Prevent reverse-tabnabbing on any link a user manages to save.
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

const PLAIN_TEXT_POLICY = { allowedTags: [], allowedAttributes: {} };

/**
 * Fields that must survive byte-for-byte.
 *
 * sanitize-html entity-encodes `&`, `<` and `>`, which would silently corrupt a password
 * like `P@ss&word` into `P@ss&amp;word` — the user would be unable to sign in with the
 * password they just set, and nothing in the logs would explain why. Passwords and opaque
 * tokens are validated by their own rules; they are never rendered as HTML.
 */
const VERBATIM_FIELDS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'refreshToken',
  'accessToken',
  'otp',
]);

/**
 * Sanitises string values in the request body before they can be persisted.
 *
 * Applied on the way *in* rather than on the way out: stored data is then known-clean, so a
 * future consumer (an email template, a PDF export, a webhook) cannot reintroduce the XSS
 * that an output-only escape would have hidden.
 *
 * @type {import('express').RequestHandler}
 */
export const sanitizeBody = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') sanitizeValue(req.body);
  next();
};

/**
 * @param {Record<string, any>} obj
 * @param {string} [parentKey]
 */
const sanitizeValue = (obj, parentKey = '') => {
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      if (typeof item === 'string') {
        obj[index] = clean(item, parentKey);
      } else if (item && typeof item === 'object') {
        sanitizeValue(item, parentKey);
      }
    });
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      obj[key] = clean(value, key);
    } else if (value && typeof value === 'object') {
      sanitizeValue(value, key);
    }
  }
};

/** @param {string} value @param {string} key */
const clean = (value, key) => {
  if (VERBATIM_FIELDS.has(key)) return value;
  const policy = RICH_TEXT_FIELDS.has(key) ? RICH_TEXT_POLICY : PLAIN_TEXT_POLICY;
  return sanitizeHtml(value, policy).trim();
};

export default { mongoSanitize, sanitizeBody };
