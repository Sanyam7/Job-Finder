import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * @typedef {Object} AccessTokenPayload
 * @property {string} sub user id
 * @property {import('@verihire/shared').Role} role
 * @property {string} email
 * @property {boolean} ev  isEmailVerified — short key to keep the token small
 * @property {number} [iat]
 * @property {number} [exp]
 */

/**
 * Signs a short-lived access token.
 *
 * Deliberately minimal: id, role, email and email-verified. Anything volatile (employer
 * verification status, suspension) is read from the database on each request instead —
 * otherwise suspending an employer would take up to 15 minutes to take effect, which would
 * break the core promise of the platform.
 *
 * @param {{id: string, role: string, email: string, isEmailVerified: boolean}} user
 * @returns {string}
 */
export const signAccessToken = (user) =>
  jwt.sign(
    { sub: String(user.id), role: user.role, email: user.email, ev: user.isEmailVerified },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRY,
      issuer: env.JWT_ISSUER,
      audience: 'verihire:access',
    },
  );

/**
 * @param {string} token
 * @returns {AccessTokenPayload}
 * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError}
 */
export const verifyAccessToken = (token) =>
  /** @type {AccessTokenPayload} */ (
    jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: env.JWT_ISSUER,
      audience: 'verihire:access',
    })
  );

/**
 * Decodes without verifying. Only ever used for diagnostics and log context — never for
 * an authorisation decision.
 * @param {string} token
 */
export const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
};

/**
 * Pulls a bearer token out of the Authorization header.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export const extractBearerToken = (req) => {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme) || !token) return null;
  return token.trim();
};
