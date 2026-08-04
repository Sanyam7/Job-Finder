import { ERROR_CODES, ROLES } from '@verihire/shared';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';
import { roleHasPermission } from '../constants/permissions.js';
import logger from '../config/logger.js';

/**
 * Coarse role gate.
 * @param {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
export const authorize =
  (...allowedRoles) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError(ERROR_CODES.TOKEN_MISSING, MESSAGES.ERROR.UNAUTHORIZED));
    }
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('RBAC denied', {
        requestId: req.id,
        userId: req.user.id,
        role: req.user.role,
        required: allowedRoles,
        path: req.originalUrl,
      });
      return next(
        new ForbiddenError(ERROR_CODES.INSUFFICIENT_PERMISSIONS, MESSAGES.ERROR.FORBIDDEN),
      );
    }
    return next();
  };

/**
 * Fine capability gate.
 * @param {string} permission
 * @returns {import('express').RequestHandler}
 */
export const can = (permission) => (req, _res, next) => {
  if (!req.user) {
    return next(new UnauthorizedError(ERROR_CODES.TOKEN_MISSING, MESSAGES.ERROR.UNAUTHORIZED));
  }
  if (!roleHasPermission(req.user.role, permission)) {
    return next(
      new ForbiddenError(ERROR_CODES.INSUFFICIENT_PERMISSIONS, MESSAGES.ERROR.FORBIDDEN, {
        required: permission,
      }),
    );
  }
  return next();
};

export const isAdmin = authorize(ROLES.ADMIN);
export const isCandidate = authorize(ROLES.CANDIDATE);
export const isEmployer = authorize(ROLES.EMPLOYER);

/**
 * Row-level ownership check.
 *
 * `loadResource` must read from the database — never from the request body. Trusting a
 * client-supplied `employerId` is the entire IDOR vulnerability class in one line.
 *
 * @param {(req: import('express').Request) => Promise<{owner: unknown}|null>} loadResource
 * @param {{ownerField?: string, allowAdmin?: boolean, attachAs?: string}} [opts]
 * @returns {import('express').RequestHandler}
 */
export const isOwnerOf =
  (loadResource, { ownerField = 'owner', allowAdmin = true, attachAs = 'resource' } = {}) =>
  async (req, _res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError(ERROR_CODES.TOKEN_MISSING, MESSAGES.ERROR.UNAUTHORIZED);
      }

      const resource = await loadResource(req);
      if (!resource) throw new ForbiddenError(ERROR_CODES.NOT_FOUND, MESSAGES.ERROR.NOT_FOUND);

      if (allowAdmin && req.user.role === ROLES.ADMIN) {
        req[attachAs] = resource;
        return next();
      }

      const ownerId = String(resource[ownerField]?._id ?? resource[ownerField] ?? '');
      if (ownerId !== req.user.id) {
        logger.warn('Ownership check failed', {
          requestId: req.id,
          userId: req.user.id,
          ownerId,
          path: req.originalUrl,
        });
        throw new ForbiddenError(
          ERROR_CODES.NOT_RESOURCE_OWNER,
          "You don't have access to that resource.",
        );
      }

      req[attachAs] = resource;
      return next();
    } catch (error) {
      return next(error);
    }
  };

export default authorize;
