/**
 * Ambient declarations for the properties our middleware chain attaches to `req`.
 *
 * ★ This file is what makes ADR-001 ("type-safe coding style even in JavaScript") actually
 * mean something on the server. Express types `Request` as a fixed shape, so every
 * `req.validated` and `req.user` in a controller is an error under `checkJs` — several hundred
 * of them, which is enough noise to make the type checker useless and get it switched off.
 *
 * Declaring them here does more than silence the errors. It makes the contract between the
 * middleware layer and the controller layer explicit and checkable: a controller reading
 * `req.employer` on a route that never ran `requireVerifiedEmployer` is now a type error
 * rather than a `TypeError: Cannot read properties of undefined` in production.
 *
 * Each property records which middleware sets it, because "is this populated on this route?"
 * is the question you actually have when reading a controller.
 */

import 'express';

declare global {
  namespace Express {
    interface Request {
      /**
       * Validated and sanitised input, merged from body/params/query.
       * Set by `validate(rules)`. Controllers read this and never `req.body` — the raw body
       * has not been through the validators.
       *
       * Deliberately `any` rather than `Record<string, any>`. Its shape genuinely differs per
       * route and is guaranteed by the validator chain, not by this declaration; typing it as
       * an index signature would claim a structure that does not exist while still failing to
       * match the concrete DTO every service expects.
       */
      validated?: any;

      /**
       * The authenticated principal, decoded from the token and re-read from the database.
       * Set by `authenticate` (always present downstream) or `optionalAuth` (present only when
       * a valid token was sent).
       *
       * This mirrors the object `auth.middleware.js` actually assigns — not a subset. A
       * narrower declaration here would make `req.user.isEmailVerified` a type error in the
       * middleware that legitimately reads it.
       */
      user?: {
        id: string;
        email: string;
        role: string;
        firstName?: string;
        lastName?: string;
        status?: string;
        isEmailVerified?: boolean;
      };

      /**
       * The hydrated user document, loaded only where a route needs more than the token
       * claims. Set by `authenticate`.
       */
      userDoc?: any;

      /**
       * ★ The employer profile behind gate 1.
       * Set by `requireVerifiedEmployer` / `loadEmployer`. Present only on routes that ran
       * one of them — which is why reading it elsewhere should fail to compile.
       */
      employer?: any;

      /** Correlation id, set by `requestId` and echoed in every log line and error body. */
      id?: string;

      /** Uploaded files, populated by the multer wrappers in `upload.middleware.js`. */
      file?: any;
      files?: any;
    }
  }
}

export {};
