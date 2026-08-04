import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { pingDatabase } from '../config/database.js';
import { pingRedis } from '../config/redis.js';
import env from '../config/env.js';

const startedAt = Date.now();

/**
 * Liveness — "is the process up?". Deliberately does not touch the database, so a database
 * blip does not cause an orchestrator to kill and restart otherwise-healthy containers.
 */
export const liveness = asyncHandler(async (_req, res) => {
  return ApiResponse.ok(
    res,
    {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      environment: env.NODE_ENV,
      version: '1.0.0',
    },
    'Service is alive',
  );
});

/**
 * Readiness — "can this instance serve traffic?". Checks the dependencies a request
 * actually needs, so a load balancer can drain an instance whose database is unreachable.
 */
export const readiness = asyncHandler(async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([pingDatabase(), pingRedis()]);

  const checks = {
    database: {
      status: dbOk ? 'up' : 'down',
      readyState: mongoose.connection.readyState,
    },
    // null means "not configured", which is a supported degraded mode — not a failure.
    redis: {
      status: redisOk === null ? 'not_configured' : redisOk ? 'up' : 'down',
      required: false,
    },
  };

  const isReady = dbOk && redisOk !== false;

  return ApiResponse.send(res, {
    statusCode: isReady ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE,
    message: isReady ? 'Service is ready' : 'Service is not ready',
    data: { ready: isReady, checks },
  });
});
