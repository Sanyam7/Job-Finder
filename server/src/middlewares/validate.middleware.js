import { validationResult, matchedData } from 'express-validator';
import { ValidationError } from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';

/**
 * Runs a set of express-validator rules and converts failures into a 422 with per-field
 * detail the client can attach directly to inputs via React Hook Form's `setError`.
 *
 * On success `req.validated` holds only the fields that were actually declared in the rule
 * set. Controllers read from there rather than from `req.body`, which makes mass assignment
 * structurally impossible: a field nobody validated cannot reach a service.
 *
 * @param {import('express-validator').ValidationChain[]} validations
 * @returns {import('express').RequestHandler}
 */
export const validate = (validations) => async (req, _res, next) => {
  await Promise.all(validations.map((validation) => validation.run(req)));

  const result = validationResult(req);

  if (!result.isEmpty()) {
    const seen = new Set();
    const fieldErrors = [];

    for (const error of result.array()) {
      // One message per field — a list of five complaints about the same input is noise.
      const field = /** @type {any} */ (error).path ?? /** @type {any} */ (error).param ?? '_';
      if (seen.has(field)) continue;
      seen.add(field);
      fieldErrors.push({ field, message: error.msg });
    }

    return next(new ValidationError(fieldErrors, MESSAGES.ERROR.VALIDATION));
  }

  req.validated = matchedData(req, { includeOptionals: false });
  return next();
};

export default validate;
