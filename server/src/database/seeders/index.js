import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { seedAdmin } from './admin.seeder.js';
import { seedSkills } from './skills.seeder.js';

/**
 * Seed runner.
 *
 * Usage:
 *   npm run seed                 # admin + skills
 *   npm run seed:admin           # admin only
 *   npm run seed:skills          # skills only
 *   npm run seed:demo            # + demo dataset (development only)
 */

const SEEDERS = {
  admin: seedAdmin,
  skills: seedSkills,
  demo: async () => {
    // Guarded rather than merely documented: a demo dataset in production would put
    // fabricated companies and fake listings on a platform whose entire promise is that
    // everything on it is real.
    if (env.isProduction) {
      throw new Error('Refusing to seed demo data in production');
    }
    const { seedDemoData } = await import('./demoData.seeder.js');
    return seedDemoData();
  },
};

const parseOnly = () => {
  const arg = process.argv.find((a) => a.startsWith('--only='));
  if (!arg) return ['admin', 'skills'];
  return arg
    .replace('--only=', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const run = async () => {
  const targets = parseOnly();
  const unknown = targets.filter((t) => !SEEDERS[t]);

  if (unknown.length) {
    logger.error(`Unknown seeder(s): ${unknown.join(', ')}`, {
      available: Object.keys(SEEDERS),
    });
    process.exit(1);
  }

  await connectDatabase();
  logger.info(`Running seeders: ${targets.join(', ')}`);

  try {
    for (const target of targets) {
      // Sequential on purpose — demo data depends on the skill taxonomy existing.
      // eslint-disable-next-line no-await-in-loop
      const result = await SEEDERS[target]();
      logger.info(`Seeder complete: ${target}`, { result });
    }
    logger.info('Seeding finished');
    process.exitCode = 0;
  } catch (error) {
    logger.error('Seeding failed', {
      message: /** @type {Error} */ (error).message,
      stack: /** @type {Error} */ (error).stack,
    });
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

run();
