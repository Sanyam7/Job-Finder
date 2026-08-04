import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import env from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../../logs');

const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format;

/**
 * Dev format — one readable line per event, with the requestId first so a single
 * `grep <requestId> logs/app.log` reconstructs a whole request across every layer.
 */
const devFormat = printf(({ level, message, timestamp: ts, requestId, stack, ...meta }) => {
  const rid = requestId ? ` \x1b[90m[${String(requestId).slice(0, 8)}]\x1b[0m` : '';
  const extras = Object.keys(meta).length
    ? ` \x1b[90m${JSON.stringify(meta, replacer)}\x1b[0m`
    : '';
  const body = stack ?? message;
  return `\x1b[90m${ts}\x1b[0m ${level}${rid} ${body}${extras}`;
});

/** Never let a secret reach a log sink, even if a caller passes a whole request body. */
const REDACTED_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'tokenHash',
  'authorization',
  'cookie',
  'apiKey',
  'secret',
]);

/** @type {(key: string, value: unknown) => unknown} */
const replacer = (key, value) => (REDACTED_KEYS.has(key) ? '[REDACTED]' : value);

const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (REDACTED_KEYS.has(key)) info[key] = '[REDACTED]';
  }
  return info;
})();

/** @type {winston.transport[]} */
const transports = [
  new winston.transports.Console({
    format: env.isProduction
      ? combine(timestamp(), errors({ stack: true }), redactFormat, json())
      : combine(
          colorize({ level: true }),
          timestamp({ format: 'HH:mm:ss.SSS' }),
          errors({ stack: true }),
          splat(),
          redactFormat,
          devFormat,
        ),
  }),
];

if (env.LOG_TO_FILE) {
  transports.push(
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
      format: combine(timestamp(), errors({ stack: true }), redactFormat, json()),
    }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
      format: combine(timestamp(), errors({ stack: true }), redactFormat, json()),
    }),
  );
}

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  levels: winston.config.npm.levels,
  defaultMeta: { service: 'verihire-api', env: env.NODE_ENV },
  transports,
  silent: env.isTest && process.env.LOG_IN_TESTS !== 'true',
  exitOnError: false,
});

/** Morgan pipes HTTP access lines into Winston so there is exactly one log stream. */
export const morganStream = {
  /** @param {string} message */
  write: (message) => logger.http?.(message.trim()) ?? logger.info(message.trim()),
};

/**
 * Returns a logger bound to a request id, so services do not have to thread it manually.
 * @param {string} requestId
 */
export const childLogger = (requestId) => logger.child({ requestId });

export default logger;
