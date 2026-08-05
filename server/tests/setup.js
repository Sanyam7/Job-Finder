import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { applyMongooseSettings } from '../src/config/database.js';

/**
 * In-memory MongoDB for integration tests.
 *
 * A **replica set**, not a standalone: several core operations (approving an employer,
 * applying to a job) run inside transactions, and a standalone mongod rejects those
 * outright. Testing against a standalone would silently exercise the non-transactional
 * fallback path and prove nothing about the code that actually runs in production.
 *
 * ★ For the same reason the mongoose-wide settings come from `connectDatabase`'s own
 * helper rather than being restated here. They change how filters are interpreted, so a
 * harness that sets them differently is testing a different application. Connecting
 * without them once let a CastError that broke every public job query reach production
 * with a full green suite behind it.
 */

/** @type {MongoMemoryReplSet|null} */
let replSet = null;

export const connectTestDb = async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  const uri = replSet.getUri();
  applyMongooseSettings();
  await mongoose.connect(uri, { maxPoolSize: 5 });
  return uri;
};

export const clearTestDb = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
};

export const closeTestDb = async () => {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  await replSet?.stop();
  replSet = null;
};
