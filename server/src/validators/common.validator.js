import { body, param, query } from 'express-validator';
import { LIMITS, PATTERNS } from '@verihire/shared';

/**
 * @param {string} name
 * @param {string} [label]
 */
export const objectIdParam = (name, label = 'identifier') =>
  param(name)
    .trim()
    .matches(PATTERNS.OBJECT_ID)
    .withMessage(`Not a valid ${label}`);

/** @param {string} name */
export const objectIdBody = (name, { optional = false } = {}) => {
  const chain = body(name);
  if (optional) chain.optional({ values: 'falsy' });
  return chain.trim().matches(PATTERNS.OBJECT_ID).withMessage('Not a valid identifier');
};

/**
 * Page and limit only — no `sort` rule.
 *
 * ★ Use this instead of `paginationRules` on any route that validates `sort` itself with
 * `enumQuery`. Applying both puts two rules on the same field, and express-validator
 * requires every rule to pass: if their allowlists do not overlap, *no* value of `sort` is
 * accepted and the parameter becomes unusable. That is not theoretical — the public job
 * search, the employer verification queue and the admin moderation queue each carried both,
 * with disjoint lists, so every sort request returned 422.
 */
export const pageLimitRules = () => [
  query('page')
    .optional()
    .toInt()
    .isInt({ min: 1, max: LIMITS.MAX_PAGE })
    .withMessage(`Page must be between 1 and ${LIMITS.MAX_PAGE}`),

  query('limit')
    .optional()
    .toInt()
    .isInt({ min: 1, max: LIMITS.MAX_PAGE_SIZE })
    .withMessage(`Limit must be between 1 and ${LIMITS.MAX_PAGE_SIZE}`),
];

/**
 * Pagination + sorting by raw field name.
 *
 * `sort` is validated against an explicit allowlist rather than passed through: an
 * unvalidated sort string reaches the database as a query plan hint, and an attacker can
 * force an unindexed sort over a large collection to burn CPU.
 *
 * Only for routes whose repository takes a field name. Where the repository switches on a
 * token like `'newest'`, use `pageLimitRules()` plus `enumQuery('sort', …)`.
 *
 * @param {string[]} allowedSortFields
 */
export const paginationRules = (allowedSortFields = ['createdAt', 'updatedAt']) => [
  ...pageLimitRules(),

  query('sort')
    .optional()
    .trim()
    .custom((value) => {
      const field = String(value).replace(/^-/, '');
      if (!allowedSortFields.includes(field)) {
        throw new Error(`Sort must be one of: ${allowedSortFields.join(', ')}`);
      }
      return true;
    }),
];

export const searchRule = () =>
  query('search')
    .optional()
    .trim()
    .isLength({ min: LIMITS.MIN_SEARCH_LENGTH, max: LIMITS.MAX_SEARCH_LENGTH })
    .withMessage(
      `Search must be between ${LIMITS.MIN_SEARCH_LENGTH} and ${LIMITS.MAX_SEARCH_LENGTH} characters`,
    )
    .escape();

/**
 * Accepts both `?skills=React&skills=Node` and `?skills=React,Node` and normalises to an
 * array — the two forms are indistinguishable to a user pasting a URL, so both must work.
 * `allowed` is `readonly` because every caller passes a frozen `*_VALUES` constant from the
 * shared package and this only reads it.
 *
 * @param {string} name
 * @param {{max?: number, allowed?: readonly string[]}} [opts]
 */
export const arrayQuery = (name, { max = 20, allowed } = {}) =>
  query(name)
    .optional()
    .customSanitizer((value) => {
      if (Array.isArray(value)) return value.flatMap((v) => String(v).split(','));
      return String(value)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    })
    .custom((values) => {
      if (values.length > max) throw new Error(`At most ${max} values allowed`);
      if (allowed) {
        const invalid = values.filter((v) => !allowed.includes(v));
        if (invalid.length) throw new Error(`Invalid value: ${invalid[0]}`);
      }
      return true;
    });

/**
 * @param {string} name
 * @param {readonly string[]} allowed
 */
export const enumQuery = (name, allowed) =>
  query(name)
    .optional()
    .trim()
    // Spread because express-validator's `isIn` declares a mutable array, and the constants
    // reaching here are frozen. It never mutates — the copy exists only to satisfy the type.
    .isIn([...allowed])
    .withMessage(`Must be one of: ${allowed.join(', ')}`);

/** @param {string} name */
export const dateQuery = (name) =>
  query(name).optional().trim().isISO8601().withMessage('Must be a valid date').toDate();

/** @param {string} name */
export const booleanQuery = (name) =>
  query(name)
    .optional()
    .customSanitizer((value) => {
      if (typeof value === 'boolean') return value;
      return ['true', '1', 'yes'].includes(String(value).toLowerCase());
    })
    .isBoolean()
    .withMessage('Must be true or false');

/** Optional URL field that accepts an empty string as "clear this value". */
export const optionalUrl = (name, { label = 'URL', pattern = PATTERNS.URL } = {}) =>
  body(name)
    .optional({ values: 'falsy' })
    .trim()
    .custom((value) => {
      if (!value) return true;
      if (!pattern.test(value)) throw new Error(`Enter a valid ${label}`);
      return true;
    });

/**
 * Bulk-operation id list, capped so one request cannot trigger an unbounded write.
 * @param {string} name
 */
export const idArrayBody = (name) =>
  body(name)
    .isArray({ min: 1, max: LIMITS.MAX_BULK_IDS })
    .withMessage(`Provide between 1 and ${LIMITS.MAX_BULK_IDS} ids`)
    .custom((values) => {
      const invalid = values.filter((v) => !PATTERNS.OBJECT_ID.test(String(v)));
      if (invalid.length) throw new Error('One or more ids are not valid');
      return true;
    });
