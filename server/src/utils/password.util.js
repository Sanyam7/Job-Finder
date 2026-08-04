import bcrypt from 'bcryptjs';
import { LIMITS, PATTERNS } from '@verihire/shared';
import env from '../config/env.js';

/**
 * @param {string} plain
 * @returns {Promise<string>}
 */
export const hashPassword = async (plain) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);

/**
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export const comparePassword = async (plain, hash) => {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
};

/**
 * Deliberately burns a comparable amount of CPU when the account does not exist.
 *
 * Without this, a login against a non-existent email returns in ~1 ms while a real account
 * takes ~250 ms — a timing oracle that lets anyone enumerate which emails are registered.
 *
 * @returns {Promise<void>}
 */
export const burnPasswordTime = async () => {
  await bcrypt.hash('timing-equalisation-dummy-value', env.BCRYPT_ROUNDS);
};

/**
 * @param {string} password
 * @returns {{valid: boolean, errors: string[]}}
 */
export const validatePasswordStrength = (password) => {
  const errors = [];
  const value = String(password ?? '');

  if (value.length < LIMITS.MIN_PASSWORD_LENGTH) {
    errors.push(`Must be at least ${LIMITS.MIN_PASSWORD_LENGTH} characters`);
  }
  if (value.length > LIMITS.MAX_PASSWORD_LENGTH) {
    errors.push(`Must be at most ${LIMITS.MAX_PASSWORD_LENGTH} characters`);
  }
  if (!/[a-z]/.test(value)) errors.push('Must contain a lowercase letter');
  if (!/[A-Z]/.test(value)) errors.push('Must contain an uppercase letter');
  if (!/\d/.test(value)) errors.push('Must contain a number');
  if (!/[^A-Za-z0-9]/.test(value)) errors.push('Must contain a special character');

  return { valid: errors.length === 0, errors };
};

/** @param {string} password */
export const isStrongPassword = (password) =>
  String(password ?? '').length >= LIMITS.MIN_PASSWORD_LENGTH && PATTERNS.PASSWORD.test(password);

/**
 * 0–4 strength score for the client-side meter.
 * @param {string} password
 */
export const scorePassword = (password) => {
  const value = String(password ?? '');
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
};
