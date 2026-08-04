import { EventEmitter } from 'node:events';
import logger from '../config/logger.js';

/**
 * In-process domain event bus.
 *
 * Subscribers are wrapped so a failure in one never propagates back into the emitting
 * service. A notification insert that fails must not roll back a job approval — the
 * approval is the business fact; the notification is a side effect. Failures are logged
 * and, for email, retried by the queue.
 *
 * v1 is a Node EventEmitter. Swapping it for a BullMQ topic later means changing this file
 * only, because no service imports anything else.
 */
class DomainEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Registers a handler that can never throw into the emitter.
   * @param {string} event
   * @param {(payload: any) => unknown|Promise<unknown>} handler
   * @param {{name?: string}} [opts]
   */
  subscribe(event, handler, opts = {}) {
    const name = opts.name ?? handler.name ?? 'anonymous';

    const safeHandler = async (payload) => {
      const started = Date.now();
      try {
        await handler(payload);
        logger.debug('Event handled', { event, subscriber: name, ms: Date.now() - started });
      } catch (error) {
        logger.error('Event subscriber failed', {
          event,
          subscriber: name,
          message: /** @type {Error} */ (error).message,
          stack: /** @type {Error} */ (error).stack,
          payload: safeSummary(payload),
        });
      }
    };

    this.on(event, safeHandler);
    return () => this.off(event, safeHandler);
  }

  /**
   * @param {string} event
   * @param {Record<string, unknown>} [payload]
   */
  emit(event, payload = {}) {
    logger.debug('Event emitted', { event, listeners: this.listenerCount(event) });
    return super.emit(event, { ...payload, _emittedAt: new Date().toISOString() });
  }
}

/** Keeps ids and types in the log without dumping resumes or cover letters into it. */
const safeSummary = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string' && value.length > 120) continue;
    if (typeof value === 'object' && value !== null) continue;
    out[key] = value;
  }
  return out;
};

export const eventBus = new DomainEventBus();
export default eventBus;
