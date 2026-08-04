import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * ★ Boot-time environment validation.
 *
 * The process refuses to start if a required variable is missing or malformed. This is
 * deliberate: an API that boots with `JWT_ACCESS_SECRET === undefined` will happily sign
 * tokens with the string "undefined" and nobody notices until it is a security incident.
 * Failing loudly at boot is always cheaper.
 */

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];

const isTest = process.env.NODE_ENV === 'test';

/**
 * @param {string} key
 * @param {{required?: boolean, default?: string, minLength?: number,
 *          pattern?: RegExp, oneOf?: string[], label?: string}} [opts]
 * @returns {string}
 */
const str = (key, opts = {}) => {
  const raw = process.env[key];
  const value = raw === undefined || raw === '' ? opts.default : raw;

  if (value === undefined || value === '') {
    if (opts.required && !isTest) errors.push(`${key} is required but was not provided`);
    return '';
  }
  if (opts.minLength && value.length < opts.minLength) {
    errors.push(`${key} must be at least ${opts.minLength} characters (got ${value.length})`);
  }
  if (opts.pattern && !opts.pattern.test(value)) {
    errors.push(`${key} is malformed${opts.label ? ` — expected ${opts.label}` : ''}`);
  }
  if (opts.oneOf && !opts.oneOf.includes(value)) {
    errors.push(`${key} must be one of: ${opts.oneOf.join(', ')} (got "${value}")`);
  }
  return value;
};

/**
 * @param {string} key
 * @param {number} fallback
 * @param {{min?: number, max?: number}} [opts]
 */
const num = (key, fallback, opts = {}) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) {
    errors.push(`${key} must be a number (got "${raw}")`);
    return fallback;
  }
  if (opts.min !== undefined && value < opts.min) errors.push(`${key} must be >= ${opts.min}`);
  if (opts.max !== undefined && value > opts.max) errors.push(`${key} must be <= ${opts.max}`);
  return value;
};

/** @param {string} key @param {boolean} fallback */
const bool = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(raw.toLowerCase());
};

/** @param {string} key @param {string[]} fallback */
const list = (key, fallback = []) => {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const NODE_ENV = str('NODE_ENV', {
  default: 'development',
  oneOf: ['development', 'production', 'test'],
});

const isProduction = NODE_ENV === 'production';

/* -------------------------------------------------------------------------- secrets */

const JWT_ACCESS_SECRET = str('JWT_ACCESS_SECRET', {
  required: true,
  minLength: 32,
  default: isTest ? 'test-access-secret-must-be-at-least-32-chars' : undefined,
});

const JWT_REFRESH_SECRET = str('JWT_REFRESH_SECRET', {
  required: true,
  minLength: 32,
  default: isTest ? 'test-refresh-secret-must-be-at-least-32-chars' : undefined,
});

if (JWT_ACCESS_SECRET && JWT_ACCESS_SECRET === JWT_REFRESH_SECRET) {
  errors.push(
    'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different — sharing them lets a ' +
      'refresh token be presented as an access token',
  );
}

/* --------------------------------------------------------------------------- config */

export const env = Object.freeze({
  NODE_ENV,
  isProduction,
  isDevelopment: NODE_ENV === 'development',
  isTest,

  PORT: num('PORT', 5000, { min: 1, max: 65535 }),
  API_PREFIX: str('API_PREFIX', { default: '/api/v1' }),
  CLIENT_URL: str('CLIENT_URL', { default: 'http://localhost:5173' }),
  CORS_ORIGINS: list('CORS_ORIGINS', ['http://localhost:5173', 'http://localhost:4173']),
  TRUST_PROXY: bool('TRUST_PROXY', isProduction),

  MONGO_URI: str('MONGO_URI', {
    required: true,
    pattern: /^mongodb(\+srv)?:\/\//,
    label: 'a mongodb:// or mongodb+srv:// connection string',
    default: isTest ? 'mongodb://127.0.0.1:27017/verihire_test' : undefined,
  }),
  MONGO_MAX_POOL: num('MONGO_MAX_POOL', 10, { min: 1, max: 200 }),

  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRY: str('JWT_ACCESS_EXPIRY', { default: '15m' }),
  JWT_REFRESH_EXPIRY_DAYS: num('JWT_REFRESH_EXPIRY_DAYS', 7, { min: 1, max: 90 }),
  JWT_ISSUER: str('JWT_ISSUER', { default: 'verihire' }),

  COOKIE_SECRET: str('COOKIE_SECRET', {
    required: true,
    minLength: 16,
    default: isTest ? 'test-cookie-secret-value' : undefined,
  }),
  COOKIE_DOMAIN: str('COOKIE_DOMAIN', { default: '' }),
  REFRESH_COOKIE_NAME: str('REFRESH_COOKIE_NAME', { default: 'vh_rt' }),

  BCRYPT_ROUNDS: num('BCRYPT_ROUNDS', isTest ? 4 : 12, { min: 4, max: 15 }),

  /* uploads */
  CLOUDINARY_CLOUD_NAME: str('CLOUDINARY_CLOUD_NAME', { required: !isTest }),
  CLOUDINARY_API_KEY: str('CLOUDINARY_API_KEY', { required: !isTest }),
  CLOUDINARY_API_SECRET: str('CLOUDINARY_API_SECRET', { required: !isTest }),
  CLOUDINARY_FOLDER: str('CLOUDINARY_FOLDER', { default: 'verihire' }),
  SIGNED_URL_TTL_SECONDS: num('SIGNED_URL_TTL_SECONDS', 300, { min: 30, max: 3600 }),

  /* email */
  SMTP_HOST: str('SMTP_HOST', { required: !isTest }),
  SMTP_PORT: num('SMTP_PORT', 587, { min: 1, max: 65535 }),
  SMTP_SECURE: bool('SMTP_SECURE', false),
  SMTP_USER: str('SMTP_USER', { required: !isTest }),
  SMTP_PASS: str('SMTP_PASS', { required: !isTest }),
  EMAIL_FROM: str('EMAIL_FROM', { default: 'VeriHire <no-reply@verihire.app>' }),
  EMAIL_ENABLED: bool('EMAIL_ENABLED', !isTest),

  /* redis / queues */
  /**
   * Forced empty under test.
   *
   * A developer's `.env` usually points at a real Redis, and an ioredis client with a
   * retry strategy keeps the event loop alive — so Jest reports leaked handles and
   * force-exits after every run. Tests should not depend on an external service being up
   * anyway; the in-memory fallbacks are exercised instead.
   */
  REDIS_URL: isTest ? '' : str('REDIS_URL', { default: '' }),
  QUEUE_PREFIX: str('QUEUE_PREFIX', { default: 'verihire' }),

  /* optional LLM enrichment — the parser works fully without it */
  LLM_ENABLED: bool('LLM_ENABLED', false),
  LLM_PROVIDER: str('LLM_PROVIDER', { default: 'anthropic' }),
  LLM_API_KEY: str('LLM_API_KEY', { default: '' }),
  LLM_MODEL: str('LLM_MODEL', { default: 'claude-haiku-4-5-20251001' }),
  LLM_TIMEOUT_MS: num('LLM_TIMEOUT_MS', 20000, { min: 1000, max: 120000 }),

  /* rate limiting */
  RATE_LIMIT_WINDOW_MS: num('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, { min: 1000 }),
  RATE_LIMIT_MAX_ANON: num('RATE_LIMIT_MAX_ANON', 100, { min: 1 }),
  RATE_LIMIT_MAX_AUTH: num('RATE_LIMIT_MAX_AUTH', 300, { min: 1 }),

  /**
   * Forced off under test, for the same reason as REDIS_URL above.
   *
   * A developer's `.env` sets `RATE_LIMIT_ENABLED=true`, and dotenv's value beats the
   * `!isTest` default. The whole suite then runs as one process from one address, so the
   * 100-request anonymous quota is spent partway through and every test after that point
   * fails with a 429 that has nothing to do with what it was asserting. Rate limiting has
   * its own tests; it must not be an invisible participant in everyone else's.
   */
  RATE_LIMIT_ENABLED: isTest ? false : bool('RATE_LIMIT_ENABLED', true),

  /* logging */
  LOG_LEVEL: str('LOG_LEVEL', { default: isProduction ? 'info' : 'debug' }),
  LOG_TO_FILE: bool('LOG_TO_FILE', isProduction),
  SLOW_QUERY_MS: num('SLOW_QUERY_MS', 200, { min: 10 }),

  /* seeding */
  ADMIN_SEED_EMAIL: str('ADMIN_SEED_EMAIL', { default: '' }),
  ADMIN_SEED_PASSWORD: str('ADMIN_SEED_PASSWORD', { default: '' }),
  ADMIN_SEED_NAME: str('ADMIN_SEED_NAME', { default: 'Platform Admin' }),

  /* feature flags */
  ENABLE_SWAGGER: bool('ENABLE_SWAGGER', !isProduction),
  ENABLE_CRON: bool('ENABLE_CRON', true),
});

/* --------------------------------------------------------------------- soft warnings */

if (!env.REDIS_URL && !isTest) {
  warnings.push(
    'REDIS_URL is not set — resume parsing will run inline (blocking the request) and ' +
      'rate limits will be per-process only. Do not run production like this.',
  );
}
if (env.LLM_ENABLED && !env.LLM_API_KEY) {
  warnings.push('LLM_ENABLED is true but LLM_API_KEY is empty — enrichment will be skipped.');
}
if (isProduction && env.CORS_ORIGINS.some((o) => o.includes('localhost'))) {
  warnings.push('CORS_ORIGINS contains a localhost entry in production.');
}
if (isProduction && !env.TRUST_PROXY) {
  warnings.push(
    'TRUST_PROXY is false in production — rate limiting will see the proxy IP, not the client IP.',
  );
}

if (errors.length) {
  // Logger is not available yet at this point in the boot sequence, by design.
  process.stderr.write(
    `\n\x1b[31m✖ Invalid environment configuration\x1b[0m\n` +
      errors.map((e) => `  • ${e}\n`).join('') +
      `\nCopy server/.env.example to server/.env and fill in the values.\n\n`,
  );
  process.exit(1);
}

export const envWarnings = Object.freeze(warnings);
export default env;
