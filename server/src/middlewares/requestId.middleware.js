import { randomUUID } from 'node:crypto';

const HEADER = 'x-request-id';

/**
 * Assigns a correlation id to every request.
 *
 * It lands on `req.id`, `res.locals.requestId`, the response header, every log line, and the
 * `meta.requestId` of every API response — so a user pasting an error id into support is
 * enough to find the exact request in the logs.
 *
 * @type {import('express').RequestHandler}
 */
export const requestId = (req, res, next) => {
  const incoming = req.get(HEADER);
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();

  req.id = id;
  res.locals.requestId = id;
  res.setHeader(HEADER, id);
  next();
};

export default requestId;
