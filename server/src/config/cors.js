import env from './env.js';
import logger from './logger.js';

/**
 * Origin whitelist.
 *
 * `credentials: true` is required because the refresh token travels as an httpOnly cookie,
 * and a wildcard origin is illegal in that mode — so the whitelist is not optional.
 * @type {import('cors').CorsOptions}
 */
export const corsOptions = {
  origin(origin, callback) {
    // Same-origin, curl, server-to-server and health checks send no Origin header.
    if (!origin) return callback(null, true);

    const allowed = new Set([...env.CORS_ORIGINS, env.CLIENT_URL].filter(Boolean));
    if (allowed.has(origin)) return callback(null, true);

    logger.warn('CORS origin rejected', { origin });
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'Retry-After'],
  maxAge: 86_400,
  optionsSuccessStatus: 204,
};

export default corsOptions;
