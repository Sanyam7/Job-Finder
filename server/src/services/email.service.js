import env from '../config/env.js';
import logger from '../config/logger.js';
import { getTransporter } from '../config/mailer.js';
import templates from '../templates/emails/index.js';

/**
 * @typedef {Object} SendResult
 * @property {boolean} sent
 * @property {string} [messageId]
 * @property {string} [error]
 */

/**
 * Sends a rendered email.
 *
 * Never throws. An email failure must not roll back the business action that triggered it —
 * a job approval is still an approval even if SMTP is down. Failures are logged, and the
 * queue retries them with backoff when Redis is configured.
 *
 * @param {{to: string, subject: string, html: string, text: string, replyTo?: string}} message
 * @returns {Promise<SendResult>}
 */
export const sendEmail = async ({ to, subject, html, text, replyTo }) => {
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    });

    if (!env.EMAIL_ENABLED) {
      logger.info('Email rendered (delivery disabled)', { to, subject });
      return { sent: false, messageId: 'disabled' };
    }

    logger.info('Email sent', { to, subject, messageId: info.messageId });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    const message = /** @type {Error} */ (error).message;
    logger.error('Email delivery failed', { to, subject, message });
    return { sent: false, error: message };
  }
};

/**
 * Renders a template by name and sends it.
 *
 * @param {keyof typeof templates} template
 * @param {string} to
 * @param {Record<string, any>} data
 * @returns {Promise<SendResult>}
 */
export const sendTemplate = async (template, to, data) => {
  const render = templates[template];
  if (typeof render !== 'function') {
    logger.error('Unknown email template', { template });
    return { sent: false, error: `Unknown template: ${String(template)}` };
  }

  const { subject, html, text } = render(/** @type {any} */ (data));
  return sendEmail({ to, subject, html, text });
};

/**
 * Fan-out to several recipients, one message each (no shared To/CC — recipients must never
 * see one another's addresses).
 *
 * @param {keyof typeof templates} template
 * @param {string[]} recipients
 * @param {Record<string, any>} data
 */
export const sendBulkTemplate = async (template, recipients, data) => {
  const results = await Promise.allSettled(
    recipients.map((to) => sendTemplate(template, to, data)),
  );
  const sent = results.filter((r) => r.status === 'fulfilled' && r.value.sent).length;
  logger.info('Bulk email dispatched', { template, total: recipients.length, sent });
  return { total: recipients.length, sent };
};

export default { sendEmail, sendTemplate, sendBulkTemplate };
