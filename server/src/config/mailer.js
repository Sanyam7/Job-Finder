import nodemailer from 'nodemailer';
import env from './env.js';
import logger from './logger.js';

/** @type {import('nodemailer').Transporter|null} */
let transporter = null;

/**
 * Lazily builds the SMTP transport.
 *
 * When `EMAIL_ENABLED` is false (tests, local development without SMTP credentials) a
 * JSON transport is used instead: messages are rendered and logged but never sent. That
 * keeps the whole signup → verify → reset flow exercisable offline, and guarantees a test
 * run cannot email a real person.
 *
 * @returns {import('nodemailer').Transporter}
 */
export const getTransporter = () => {
  if (transporter) return transporter;

  if (!env.EMAIL_ENABLED || !env.SMTP_HOST) {
    logger.warn('Email delivery is disabled — messages will be logged, not sent');
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true for 465, false for 587 (STARTTLS)
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });

  transporter.verify((error) => {
    if (error) logger.error('SMTP verification failed', { message: error.message });
    else logger.info('SMTP transport ready', { host: env.SMTP_HOST });
  });

  return transporter;
};

export const closeTransporter = () => {
  transporter?.close();
  transporter = null;
};

export default getTransporter;
