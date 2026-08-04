import { CURRENCY_META, SALARY_PERIOD } from '../constants/job.js';

/**
 * Slugify with a stable, URL-safe output.
 * @param {string} input
 * @returns {string}
 */
export const slugify = (input) =>
  String(input ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // strip combining diacritics left by NFKD
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/**
 * Experience is stored in MONTHS everywhere. This is the only place it becomes prose,
 * so "3.5 years" can never mean two different things in two different components.
 * @param {number|null|undefined} months
 * @returns {string}
 */
export const formatExperience = (months) => {
  if (months == null || Number.isNaN(months)) return 'Not specified';
  if (months <= 0) return 'Fresher';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mo`;
  if (rem === 0) return `${years} yr${years > 1 ? 's' : ''}`;
  return `${years} yr${years > 1 ? 's' : ''} ${rem} mo`;
};

/**
 * @param {{minMonths?: number|null, maxMonths?: number|null}} range
 * @returns {string}
 */
export const formatExperienceRange = (range) => {
  if (!range) return 'Any experience';
  const { minMonths, maxMonths } = range;
  if (minMonths == null && maxMonths == null) return 'Any experience';
  if (minMonths != null && maxMonths == null) return `${Math.floor(minMonths / 12)}+ yrs`;
  if (minMonths == null && maxMonths != null) return `Up to ${Math.floor(maxMonths / 12)} yrs`;
  const min = Math.floor(minMonths / 12);
  const max = Math.floor(maxMonths / 12);
  return min === max ? `${min} yr${min === 1 ? '' : 's'}` : `${min}–${max} yrs`;
};

/**
 * Compact currency formatting. INR uses the lakh/crore convention because "₹1,800,000"
 * reads as noise to the audience that actually uses this board.
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
export const formatCompactAmount = (amount, currency = 'INR') => {
  if (amount == null || Number.isNaN(amount)) return '';
  const symbol = CURRENCY_META[currency]?.symbol ?? '';

  if (currency === 'INR') {
    if (amount >= 1e7) return `${symbol}${trimZeroes(amount / 1e7)} Cr`;
    if (amount >= 1e5) return `${symbol}${trimZeroes(amount / 1e5)} L`;
    if (amount >= 1e3) return `${symbol}${trimZeroes(amount / 1e3)}K`;
    return `${symbol}${amount}`;
  }

  if (amount >= 1e6) return `${symbol}${trimZeroes(amount / 1e6)}M`;
  if (amount >= 1e3) return `${symbol}${trimZeroes(amount / 1e3)}K`;
  return `${symbol}${amount}`;
};

/** @param {number} n */
const trimZeroes = (n) => Number(n.toFixed(2)).toString();

const PERIOD_SUFFIX = {
  [SALARY_PERIOD.YEARLY]: 'yr',
  [SALARY_PERIOD.MONTHLY]: 'mo',
  [SALARY_PERIOD.HOURLY]: 'hr',
};

/**
 * @param {{min?: number|null, max?: number|null, currency?: string, period?: string,
 *          isDisclosed?: boolean}} salary
 * @returns {string}
 */
export const formatSalaryRange = (salary) => {
  if (!salary || salary.isDisclosed === false) return 'Not disclosed';
  const { min, max, currency = 'INR', period = SALARY_PERIOD.YEARLY } = salary;
  if (min == null && max == null) return 'Not disclosed';
  const suffix = PERIOD_SUFFIX[period] ?? 'yr';
  if (min != null && max == null) return `${formatCompactAmount(min, currency)}+ / ${suffix}`;
  if (min == null && max != null) return `Up to ${formatCompactAmount(max, currency)} / ${suffix}`;
  if (min === max) return `${formatCompactAmount(min, currency)} / ${suffix}`;
  return `${formatCompactAmount(min, currency)} – ${formatCompactAmount(max, currency)} / ${suffix}`;
};

/**
 * @param {{city?: string, state?: string, country?: string, isRemoteAnywhere?: boolean}} location
 * @param {string} [workMode]
 */
export const formatLocation = (location, workMode) => {
  if (location?.isRemoteAnywhere) return 'Remote (anywhere)';
  const parts = [location?.city, location?.state, location?.country].filter(Boolean);
  const place = parts.length ? parts.join(', ') : 'Location not specified';
  return workMode === 'REMOTE' ? `${place} · Remote` : place;
};

/**
 * @param {string} firstName
 * @param {string} [lastName]
 */
export const getInitials = (firstName, lastName) => {
  const a = String(firstName ?? '').trim().charAt(0);
  const b = String(lastName ?? '').trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
};

/** @param {string} email */
export const maskEmail = (email) => {
  const [local, domain] = String(email ?? '').split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
};

/** @param {string} phone */
export const maskPhone = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 4) return '•••••';
  return `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`;
};

/**
 * @param {string} text
 * @param {number} max
 */
export const truncate = (text, max = 140) => {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
};

/** @param {number} count @param {string} singular @param {string} [plural] */
export const pluralize = (count, singular, plural) =>
  `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;

/**
 * File sizes for humans.
 *
 * Binary units (1024) because that is what `LIMITS.MAX_RESUME_BYTES` is expressed in — a
 * "5 MB limit" that rejects a 5,100,000-byte file is a support ticket, so the label and the
 * bound have to agree.
 *
 * @param {number|null|undefined} bytes
 * @returns {string}
 */
export const formatBytes = (bytes) => {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—';

  const value = Number(bytes);
  if (value < 1024) return `${value} B`;

  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  // One decimal below 10 ("1.4 MB"), none above ("512 KB") — the extra digit stops being
  // informative once the number is large.
  return `${size < 10 ? Math.round(size * 10) / 10 : Math.round(size)} ${units[unit]}`;
};
