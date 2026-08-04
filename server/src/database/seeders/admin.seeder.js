import { ROLES, ACCOUNT_STATUS } from '@verihire/shared';
import { User } from '../../models/user.model.js';
import { validatePasswordStrength } from '../../utils/password.util.js';
import env from '../../config/env.js';
import logger from '../../config/logger.js';

/**
 * Creates the first admin.
 *
 * ★ This is the ONLY way an admin comes into existence without another admin. The
 * registration endpoint rejects `role: ADMIN` outright, so there is no public path to
 * moderator privileges — which matters on a platform whose entire value is that a human
 * moderator decides what is real.
 *
 * Idempotent: re-running promotes nothing and overwrites nothing.
 */
export const seedAdmin = async () => {
  if (!env.ADMIN_SEED_EMAIL || !env.ADMIN_SEED_PASSWORD) {
    logger.warn('Skipping admin seed — ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD are not set');
    return { created: false, reason: 'not configured' };
  }

  const existing = await User.findOne({ email: env.ADMIN_SEED_EMAIL.toLowerCase() });
  if (existing) {
    logger.info('Admin already exists — nothing to do', { email: existing.email });
    return { created: false, reason: 'already exists' };
  }

  // A weak seeded admin password is the single worst credential on the platform: it holds
  // the ability to verify companies and publish listings. Refuse rather than warn.
  const strength = validatePasswordStrength(env.ADMIN_SEED_PASSWORD);
  if (!strength.valid) {
    logger.error('Refusing to seed an admin with a weak password', { issues: strength.errors });
    throw new Error(`ADMIN_SEED_PASSWORD is too weak: ${strength.errors.join('; ')}`);
  }

  const [firstName, ...rest] = env.ADMIN_SEED_NAME.split(' ');

  const admin = await User.create({
    firstName: firstName || 'Platform',
    lastName: rest.join(' ') || 'Admin',
    email: env.ADMIN_SEED_EMAIL,
    passwordHash: env.ADMIN_SEED_PASSWORD, // hashed by the model's pre-save hook
    role: ROLES.ADMIN,
    status: ACCOUNT_STATUS.ACTIVE,
    // Seeded directly by an operator, so there is no address to prove ownership of.
    isEmailVerified: true,
    emailVerifiedAt: new Date(),
  });

  logger.info('Admin seeded', { email: admin.email, id: String(admin._id) });
  return { created: true, email: admin.email };
};

export default seedAdmin;
