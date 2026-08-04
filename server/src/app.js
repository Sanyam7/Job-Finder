import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import hpp from 'hpp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';

import env from './config/env.js';
import logger, { morganStream } from './config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import corsOptions from './config/cors.js';
import { requestId } from './middlewares/requestId.middleware.js';
import { mongoSanitize, sanitizeBody } from './middlewares/sanitize.middleware.js';
import { globalLimiter } from './middlewares/rateLimit.middleware.js';
import { notFoundHandler, globalErrorHandler } from './middlewares/error.middleware.js';
import { optionalAuth } from './middlewares/auth.middleware.js';
import v1Routes from './routes/v1/index.js';

/**
 * Express application assembly.
 *
 * No `listen()` here — that lives in server.js — so integration tests can mount this app
 * with supertest without binding a port.
 *
 * The middleware order below is deliberate and documented in
 * docs/01-SYSTEM-ARCHITECTURE.md §3. Changing it changes the security posture.
 */
const app = express();

/* 0 ── behind a proxy, req.ip must be the client, not the load balancer, or every
        rate limit collapses into one shared bucket. */
if (env.TRUST_PROXY) app.set('trust proxy', 1);
app.disable('x-powered-by');

/* 1 ── security headers */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'", ...env.CORS_ORIGINS],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: env.isProduction ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: env.isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
  }),
);

/* 2 ── CORS (credentials on, whitelist enforced) */
app.use(cors(corsOptions));

/* 3 ── compression */
app.use(compression({ threshold: 1024 }));

/* 4 ── body parsing with a hard size cap (DoS guard) */
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

/* 5 ── signed cookies (the refresh token lives here) */
app.use(cookieParser(env.COOKIE_SECRET));

/* 6/7 ── injection + XSS scrubbing before anything reads the body */
app.use(mongoSanitize);
app.use(sanitizeBody);

/* 8 ── HTTP parameter pollution. `whitelist` keeps genuine repeatable filters working:
        ?skills=React&skills=Node must stay an array. */
app.use(
  hpp({
    whitelist: [
      'skills',
      'workMode',
      'employmentType',
      'industry',
      'status',
      'jobTypes',
      'locations',
      'fields',
      'ids',
    ],
  }),
);

/* 9 ── correlation id on every request */
app.use(requestId);

/* 10 ── access logging into the Winston stream */
morgan.token('id', (req) => /** @type {any} */ (req).id ?? '-');
morgan.token('user', (req) => /** @type {any} */ (req).user?.id ?? 'anon');
app.use(
  morgan(
    env.isProduction
      ? ':id :user :remote-addr :method :url :status :res[content-length] - :response-time ms'
      : ':id :method :url :status - :response-time ms',
    { stream: morganStream, skip: (req) => req.originalUrl === `${env.API_PREFIX}/health` },
  ),
);

/* 11 ── optionalAuth runs before the global limiter so authenticated callers get the
         higher, per-user quota instead of sharing an IP bucket. */
app.use(optionalAuth);
app.use(globalLimiter);

/* ── routes ── */
app.use(env.API_PREFIX, v1Routes);

/**
 * Interactive API docs.
 *
 * ★ Off in production by default. The spec documents the moderation endpoints and the shape
 * of the verification checklist — useful to a developer and equally useful to someone probing
 * the gate. It is loaded synchronously and guarded so a malformed or missing spec cannot stop
 * the API from booting; docs are not worth an outage.
 */
if (env.ENABLE_SWAGGER) {
  try {
    const specPath = path.join(__dirname, 'docs', 'openapi.yaml');
    const spec = YAML.parse(fs.readFileSync(specPath, 'utf8'));

    app.use(
      `${env.API_PREFIX}/docs`,
      swaggerUi.serve,
      swaggerUi.setup(spec, {
        customSiteTitle: 'VeriHire API',
        swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
      }),
    );

    app.get(`${env.API_PREFIX}/openapi.json`, (_req, res) => res.json(spec));
    logger.info('API docs mounted', { path: `${env.API_PREFIX}/docs` });
  } catch (error) {
    logger.error('Could not mount API docs — continuing without them', {
      message: /** @type {Error} */ (error).message,
    });
  }
}

app.get('/', (_req, res) => {
  res.json({
    name: 'VeriHire API',
    version: '1.0.0',
    docs: env.ENABLE_SWAGGER ? `${env.API_PREFIX}/docs` : null,
    health: `${env.API_PREFIX}/health`,
  });
});

/* ── terminators ── */
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
