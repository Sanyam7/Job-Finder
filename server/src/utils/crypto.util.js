import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generates an opaque, high-entropy token.
 *
 * Refresh tokens and email/reset links are random strings, not JWTs — they need to be
 * revocable, and a JWT is not revocable without exactly the database lookup that makes the
 * JWT pointless in the first place.
 *
 * @param {number} [bytes]
 * @returns {string} hex string, 2× `bytes` characters
 */
export const generateToken = (bytes = 32) => randomBytes(bytes).toString('hex');

/**
 * SHA-256, used to store tokens at rest.
 *
 * The raw token goes to the user; only its hash is persisted. A database dump therefore
 * yields nothing replayable. bcrypt is unnecessary here — unlike a password, the input is
 * already 256 bits of entropy, so there is no dictionary to attack and no reason to pay
 * bcrypt's cost on every token check.
 *
 * @param {string} token
 * @returns {string}
 */
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

/**
 * Constant-time comparison for secret material.
 * @param {string} a
 * @param {string} b
 */
export const safeCompare = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

/**
 * Short, URL-safe, human-transcribable code (no 0/O/1/I ambiguity).
 * @param {number} [length]
 */
export const generateShortCode = (length = 8) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

/** @param {number} [digits] */
export const generateNumericOtp = (digits = 6) => {
  const max = 10 ** digits;
  const value = parseInt(randomBytes(4).toString('hex'), 16) % max;
  return String(value).padStart(digits, '0');
};

/** @param {string} input */
export const sha256 = (input) => createHash('sha256').update(String(input)).digest('hex');
