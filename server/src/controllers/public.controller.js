import { body } from 'express-validator';
import mongoose from 'mongoose';
import { LIMITS, PATTERNS } from '@verihire/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { MESSAGES } from '../constants/messages.js';
import { jobRepository } from '../repositories/job.repository.js';
import { employerRepository } from '../repositories/employer.repository.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import logger from '../config/logger.js';

/**
 * Landing-page counters.
 *
 * Every number is derived from a gate-filtered query, so the figures on the marketing page
 * are the same figures the product enforces. "312 verified companies" counts companies that
 * genuinely passed review — it is not a separate, drifting marketing metric.
 */
export const getPlatformStats = asyncHandler(async (_req, res) => {
  const [liveJobs, verifiedCompanies, openCandidates] = await Promise.all([
    jobRepository.countPubliclyVisible(),
    employerRepository.countPublic(),
    candidateRepository.countDiscoverable(),
  ]);

  return ApiResponse.ok(
    res,
    {
      liveJobs,
      verifiedCompanies,
      openCandidates,
      // Not a gimmick: a listing that fails either gate is not reachable through any
      // public endpoint, so the count of publicly visible unverified jobs is structurally
      // zero. See docs/08 §7.
      fakeJobs: 0,
    },
    MESSAGES.PUBLIC.STATS_FETCHED,
  );
});

/* ------------------------------------------------------------------ contact */

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, trim: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: LIMITS.MAX_CONTACT_MESSAGE_LENGTH },
    status: { type: String, enum: ['NEW', 'READ', 'REPLIED'], default: 'NEW' },
    ip: { type: String, default: null },
    repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    repliedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

contactMessageSchema.index({ status: 1, createdAt: -1 });

/**
 * The `models.X ?? model(...)` guard makes this safe to import twice (tests re-import the
 * controller), but the `??` produces a union TypeScript will not call `.create()` on, so the
 * result is annotated.
 *
 * @type {import('mongoose').Model<any>}
 */
export const ContactMessage =
  mongoose.models.ContactMessage ?? mongoose.model('ContactMessage', contactMessageSchema);

export const contactRules = [
  body('name').trim().notEmpty().withMessage('Your name is required').isLength({ max: 100 }),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Your email is required')
    .matches(PATTERNS.EMAIL)
    .withMessage('Enter a valid email address'),
  body('subject').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('message')
    .trim()
    .notEmpty()
    .withMessage('A message is required')
    .isLength({ min: 10, max: LIMITS.MAX_CONTACT_MESSAGE_LENGTH }),
  // Honeypot: a hidden field no human fills in. Cheaper and less hostile than a CAPTCHA.
  body('website').optional().isEmpty().withMessage('Rejected'),
];

export const submitContact = asyncHandler(async (req, res) => {
  // Silently accept honeypot hits — telling a bot it was detected just teaches the author
  // to stop filling that field.
  if (req.body.website) {
    logger.debug('Contact honeypot triggered', { ip: req.ip });
    return ApiResponse.created(res, null, MESSAGES.PUBLIC.CONTACT_RECEIVED);
  }

  await ContactMessage.create({ ...req.validated, ip: req.ip });
  return ApiResponse.created(res, null, MESSAGES.PUBLIC.CONTACT_RECEIVED);
});
