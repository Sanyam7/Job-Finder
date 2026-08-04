import logger from '../config/logger.js';
import { eventBus } from './eventBus.js';
import { registerEmailSubscribers } from './subscribers/email.subscriber.js';
import { registerNotificationSubscribers } from './subscribers/notification.subscriber.js';

/**
 * Wires every subscriber at boot.
 *
 * Called once from server.js and once from worker.js. Registering subscribers lazily inside
 * services would mean an event fired before the first call to that service silently goes
 * nowhere — a bug that only shows up under a specific traffic ordering.
 *
 * ★ These are static imports, and that is a deliberate change from the dynamic
 * `import(...).catch(() => null)` this file used during the build-out. That pattern existed so
 * the API would boot before the subscriber modules were written, and it swallowed everything.
 * Now that the modules are real, a swallowed import error means notifications stop firing
 * platform-wide — no email, no bell, no admin alert that a company is waiting for review — and
 * nothing anywhere says so. A missing module is now a boot failure, which is the correct
 * outcome: it is discovered in seconds rather than in a support ticket a week later.
 *
 * (There is no audit subscriber. Audit entries are written inline by the services that make
 * the decision, inside the same transaction, so an approval and its audit record commit or
 * fail together. An after-the-fact subscriber could not offer that.)
 */
export const registerSubscribers = () => {
  registerEmailSubscribers();
  registerNotificationSubscribers();

  logger.info('Domain event subscribers registered', {
    events: eventBus.eventNames().length,
  });
};

export { eventBus };
export default registerSubscribers;
