import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import {
  ACCOUNT_STATUS,
  BOOKMARK_ENTITY,
  JOB_STATUS,
  NOTIFICATION_TYPE,
  PROFILE_VISIBILITY,
  ROLES,
  VERIFICATION_STATUS,
} from '@verihire/shared';

import { connectTestDb, clearTestDb, closeTestDb } from '../setup.js';
import app from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { EmployerProfile } from '../../src/models/employerProfile.model.js';
import { CandidateProfile } from '../../src/models/candidateProfile.model.js';
import { Job } from '../../src/models/job.model.js';
import { Notification } from '../../src/models/notification.model.js';
import { Bookmark } from '../../src/models/bookmark.model.js';
import { registerSubscribers } from '../../src/events/index.js';

/**
 * Phase 7/8 — notifications, bookmarks, candidate search and admin analytics.
 *
 * The claims worth asserting here are the ones where a mistake is invisible:
 *
 *  - A bookmark must not become a private index of things you were never allowed to see, or
 *    a live pointer to a listing an admin has since pulled.
 *  - Candidate search must compose the discoverability gate on every path, exactly as job
 *    search composes `buildPublicJobFilter()`.
 *  - A notification belongs to exactly one recipient, and repeat firings of a scheduled
 *    warning must not re-notify someone who already dismissed it.
 */

const PASSWORD = 'Str0ng!Passw0rd';

/** @type {Record<string, any>} */
let ctx;

beforeAll(async () => {
  await connectTestDb();
  // Notification rows are written by subscribers, so this suite needs the bus wired up.
  registerSubscribers();
  await new Promise((resolve) => setTimeout(resolve, 200));
}, 120_000);

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  ctx = await seedWorld();
});

const login = async (email) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
};

const seedWorld = async () => {
  const [candidateUser, employerUser, adminUser] = await User.create([
    {
      firstName: 'Priya',
      lastName: 'Sharma',
      email: 'candidate@example.test',
      passwordHash: PASSWORD,
      role: ROLES.CANDIDATE,
      isEmailVerified: true,
    },
    {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'employer@acme.test',
      passwordHash: PASSWORD,
      role: ROLES.EMPLOYER,
      isEmailVerified: true,
    },
    {
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'admin@verihire.test',
      passwordHash: PASSWORD,
      role: ROLES.ADMIN,
      isEmailVerified: true,
    },
  ]);

  const employer = await EmployerProfile.create({
    owner: employerUser._id,
    companyName: 'Acme Technologies',
    description: 'We build things that work, and we have written more than fifty characters.',
    website: 'https://acmetech.io',
    industry: 'Information Technology',
    companySize: '51-200',
    contact: { email: 'hr@acmetech.io', phone: '+919876543210' },
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
    status: ACCOUNT_STATUS.ACTIVE,
  });

  const candidateProfile = await CandidateProfile.create({
    user: candidateUser._id,
    headline: 'Senior Frontend Engineer',
    totalExperienceMonths: 60,
    skills: [{ name: 'React' }, { name: 'TypeScript' }],
    location: { city: 'Bengaluru', country: 'India' },
  });

  const job = await Job.create({
    employer: employer._id,
    postedBy: employerUser._id,
    title: 'Senior React Developer',
    slug: 'senior-react-developer-acme',
    companySnapshot: { name: 'Acme Technologies', slug: 'acme-technologies', isVerified: true },
    description:
      'We are looking for a senior React developer to own our design system and lead the frontend guild.',
    employmentType: 'FULL_TIME',
    workMode: 'REMOTE',
    deadline: new Date(Date.now() + 30 * 86_400_000),
    status: JOB_STATUS.APPROVED,
    isPubliclyVisible: true,
    publishedAt: new Date(),
  });

  return {
    candidateToken: await login('candidate@example.test'),
    employerToken: await login('employer@acme.test'),
    adminToken: await login('admin@verihire.test'),
    candidateUserId: String(candidateUser._id),
    employerUserId: String(employerUser._id),
    adminUserId: String(adminUser._id),
    employerId: String(employer._id),
    candidateProfileId: String(candidateProfile._id),
    jobId: String(job._id),
  };
};

const as = (token, method, path) =>
  request(app)[method](path).set('Authorization', `Bearer ${token}`);

/* ========================================================================== */

describe('notifications', () => {
  it('is written by a domain event, not by the service that caused it', async () => {
    const draft = await Job.create({
      employer: ctx.employerId,
      postedBy: ctx.employerUserId,
      title: 'Backend Engineer',
      slug: 'backend-engineer-acme',
      companySnapshot: { name: 'Acme Technologies', slug: 'acme-technologies', isVerified: true },
      description: 'A second listing, long enough to satisfy the minimum description length rule.',
      employmentType: 'FULL_TIME',
      workMode: 'HYBRID',
      deadline: new Date(Date.now() + 30 * 86_400_000),
      status: JOB_STATUS.DRAFT,
    });

    await as(ctx.employerToken, 'post', `/api/v1/jobs/${draft._id}/submit`).send().expect(200);
    await as(ctx.adminToken, 'post', `/api/v1/admin/jobs/${draft._id}/approve`)
      .send({})
      .expect(200);

    // Subscribers are async and deliberately not awaited by the business action.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const forEmployer = await Notification.find({ recipient: ctx.employerUserId }).lean();
    expect(forEmployer.map((n) => n.type)).toContain(NOTIFICATION_TYPE.JOB_APPROVED);

    // ★ The admin queue alert — manual review only works if somebody knows there is a queue.
    const forAdmin = await Notification.find({ recipient: ctx.adminUserId }).lean();
    expect(forAdmin.map((n) => n.type)).toContain(NOTIFICATION_TYPE.ADMIN_NEW_JOB_PENDING);
  });

  it('scopes the list to the recipient', async () => {
    await Notification.create([
      { recipient: ctx.candidateUserId, type: NOTIFICATION_TYPE.WELCOME, title: 'Yours' },
      { recipient: ctx.employerUserId, type: NOTIFICATION_TYPE.WELCOME, title: 'Theirs' },
    ]);

    const res = await as(ctx.candidateToken, 'get', '/api/v1/notifications').expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Yours');
  });

  it('refuses to mark someone else’s notification read', async () => {
    const theirs = await Notification.create({
      recipient: ctx.employerUserId,
      type: NOTIFICATION_TYPE.WELCOME,
      title: 'Theirs',
    });

    await as(ctx.candidateToken, 'patch', `/api/v1/notifications/${theirs._id}/read`).expect(404);

    expect((await Notification.findById(theirs._id)).isRead).toBe(false);
  });

  /**
   * ★ A scheduled warning firing twice must not resurrect a dismissed notification.
   * The cron runs daily; without dedupe the same "expires in 3 days" appears every morning.
   */
  it('deduplicates a repeated scheduled notification and keeps it read', async () => {
    const payload = {
      recipient: ctx.employerUserId,
      type: NOTIFICATION_TYPE.JOB_EXPIRING_SOON,
      title: 'Job expires in 3 days',
      dedupeKey: `job-expiring:${ctx.jobId}:3`,
    };

    await Notification.push(payload);
    await Notification.updateOne({ dedupeKey: payload.dedupeKey }, { $set: { isRead: true } });

    // The cron runs again.
    await Notification.push(payload);

    const rows = await Notification.find({ dedupeKey: payload.dedupeKey }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].isRead).toBe(true);
  });

  it('does not collapse distinct events that carry no dedupe key', async () => {
    const base = {
      recipient: ctx.employerUserId,
      type: NOTIFICATION_TYPE.APPLICATION_RECEIVED,
      title: 'New applicant',
    };

    await Notification.push(base);
    await Notification.push(base);

    // Two people applying is two events, however similar the copy.
    expect(await Notification.countDocuments({ recipient: ctx.employerUserId })).toBe(2);
  });

  it('marks all read and clears only the read ones', async () => {
    await Notification.create([
      { recipient: ctx.candidateUserId, type: NOTIFICATION_TYPE.WELCOME, title: 'A' },
      { recipient: ctx.candidateUserId, type: NOTIFICATION_TYPE.WELCOME, title: 'B' },
    ]);

    const before = await as(ctx.candidateToken, 'get', '/api/v1/notifications/summary').expect(200);
    expect(before.body.data.unread).toBe(2);

    await as(ctx.candidateToken, 'patch', '/api/v1/notifications/read-all').expect(200);

    const after = await as(ctx.candidateToken, 'get', '/api/v1/notifications/summary').expect(200);
    expect(after.body.data.unread).toBe(0);

    await as(ctx.candidateToken, 'delete', '/api/v1/notifications/read').expect(200);
    expect(await Notification.countDocuments({ recipient: ctx.candidateUserId })).toBe(0);
  });

  /**
   * Delivery is decided by the table in `shared/constants/notifications.js`, so muting a
   * type in-app is a data change rather than an edit to whatever service emitted it.
   */
  it('writes nothing for a type with no in-app delivery configured', async () => {
    const created = await Notification.push({
      recipient: ctx.candidateUserId,
      type: 'NOT_A_CONFIGURED_TYPE',
      title: 'Should not exist',
    });

    expect(created).toBeNull();
    expect(await Notification.countDocuments({ recipient: ctx.candidateUserId })).toBe(0);
  });
});

describe('★ bookmarks respect the same gates as viewing', () => {
  it('saves and un-saves a live job with one idempotent endpoint', async () => {
    const save = await as(ctx.candidateToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.JOB, entityId: ctx.jobId })
      .expect(200);
    expect(save.body.data.saved).toBe(true);

    const unsave = await as(ctx.candidateToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.JOB, entityId: ctx.jobId })
      .expect(200);
    expect(unsave.body.data.saved).toBe(false);

    expect(await Bookmark.countDocuments({})).toBe(0);
  });

  it('bumps the job’s save counter', async () => {
    await as(ctx.candidateToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.JOB, entityId: ctx.jobId })
      .expect(200);

    expect((await Job.findById(ctx.jobId)).stats.saves).toBe(1);
  });

  /**
   * ★ You cannot save what you cannot see. Otherwise "save" is a way to keep a handle on a
   * listing an admin pulled, and to build a private index of hidden rows.
   */
  it('refuses to save a job that is not publicly visible', async () => {
    await Job.updateOne(
      { _id: ctx.jobId },
      { $set: { status: JOB_STATUS.PENDING, isPubliclyVisible: false } },
    );

    await as(ctx.candidateToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.JOB, entityId: ctx.jobId })
      .expect(404);
  });

  /**
   * ★ A saved job that has since been pulled comes back as a tombstone, not as a live card
   * and not silently missing.
   */
  it('tombstones a saved job once it stops being visible', async () => {
    await as(ctx.candidateToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.JOB, entityId: ctx.jobId })
      .expect(200);

    await Job.updateOne(
      { _id: ctx.jobId },
      { $set: { status: JOB_STATUS.ARCHIVED, isPubliclyVisible: false } },
    );

    const res = await as(
      ctx.candidateToken,
      'get',
      `/api/v1/bookmarks?entityType=${BOOKMARK_ENTITY.JOB}`,
    ).expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isAvailable).toBe(false);
    expect(res.body.data[0].entity).toBeNull();
  });

  it('refuses to save a candidate who has not opted into search', async () => {
    await as(ctx.employerToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.CANDIDATE, entityId: ctx.candidateProfileId })
      .expect(404);
  });

  it('lets an employer save a candidate who opted in', async () => {
    await CandidateProfile.updateOne({ _id: ctx.candidateProfileId }, { $set: { openToWork: true } });

    const res = await as(ctx.employerToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.CANDIDATE, entityId: ctx.candidateProfileId })
      .expect(200);

    expect(res.body.data.saved).toBe(true);
  });

  it('keeps candidates from saving candidates and employers from saving jobs', async () => {
    await as(ctx.employerToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.JOB, entityId: ctx.jobId })
      .expect(403);

    await as(ctx.candidateToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.CANDIDATE, entityId: ctx.candidateProfileId })
      .expect(403);
  });

  it('scopes the saved list to its owner', async () => {
    await as(ctx.candidateToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.JOB, entityId: ctx.jobId })
      .expect(200);

    const theirs = await as(
      ctx.employerToken,
      'get',
      `/api/v1/bookmarks?entityType=${BOOKMARK_ENTITY.JOB}`,
    ).expect(200);

    expect(theirs.body.data).toHaveLength(0);
  });
});

describe('★ candidate search composes the discoverability gate', () => {
  it('returns nobody until a candidate opts in', async () => {
    const before = await as(ctx.employerToken, 'get', '/api/v1/candidates/search').expect(200);
    expect(before.body.data).toHaveLength(0);

    await CandidateProfile.updateOne({ _id: ctx.candidateProfileId }, { $set: { openToWork: true } });

    const after = await as(ctx.employerToken, 'get', '/api/v1/candidates/search').expect(200);
    expect(after.body.data).toHaveLength(1);
    expect(after.body.data[0].headline).toBe('Senior Frontend Engineer');
  });

  it('excludes PRIVATE profiles even when open to work', async () => {
    await CandidateProfile.updateOne(
      { _id: ctx.candidateProfileId },
      { $set: { openToWork: true, profileVisibility: PROFILE_VISIBILITY.PRIVATE } },
    );

    const res = await as(ctx.employerToken, 'get', '/api/v1/candidates/search').expect(200);
    expect(res.body.data).toHaveLength(0);
  });

  /** ★ A search result set must not be a scrapeable contact list. */
  it('carries no contact details in a result card', async () => {
    await CandidateProfile.updateOne({ _id: ctx.candidateProfileId }, { $set: { openToWork: true } });

    const res = await as(ctx.employerToken, 'get', '/api/v1/candidates/search').expect(200);

    expect(res.body.data[0]).not.toHaveProperty('email');
    expect(res.body.data[0]).not.toHaveProperty('phone');
    expect(JSON.stringify(res.body)).not.toContain('candidate@example.test');
  });

  it('filters by skill and by experience, converting years to months', async () => {
    await CandidateProfile.updateOne({ _id: ctx.candidateProfileId }, { $set: { openToWork: true } });

    const match = await as(
      ctx.employerToken,
      'get',
      '/api/v1/candidates/search?skills=React&minExpYears=3',
    ).expect(200);
    expect(match.body.data).toHaveLength(1);

    // The profile has 60 months = 5 years, so a 10-year floor must exclude it.
    const miss = await as(
      ctx.employerToken,
      'get',
      '/api/v1/candidates/search?minExpYears=10',
    ).expect(200);
    expect(miss.body.data).toHaveLength(0);
  });

  it('keeps candidates out of the candidate database', async () => {
    await as(ctx.candidateToken, 'get', '/api/v1/candidates/search').expect(403);
  });

  it('marks results the employer has already saved', async () => {
    await CandidateProfile.updateOne({ _id: ctx.candidateProfileId }, { $set: { openToWork: true } });

    await as(ctx.employerToken, 'post', '/api/v1/bookmarks')
      .send({ entityType: BOOKMARK_ENTITY.CANDIDATE, entityId: ctx.candidateProfileId })
      .expect(200);

    const res = await as(ctx.employerToken, 'get', '/api/v1/candidates/search').expect(200);
    expect(res.body.data[0].isSaved).toBe(true);
  });
});

describe('★ admin analytics', () => {
  it('reports the moderation health an operator can act on', async () => {
    const res = await as(ctx.adminToken, 'get', '/api/v1/admin/analytics/moderation').expect(200);

    // Median as well as mean: one company left over a holiday weekend ruins a mean.
    expect(res.body.data.verification).toHaveProperty('medianReviewHours');
    expect(res.body.data.verification).toHaveProperty('oldestPendingWaitHours');
    expect(res.body.data.moderation).toHaveProperty('pendingNow');
    expect(Array.isArray(res.body.data.oldestPending)).toBe(true);
  });

  it('zero-fills the daily series so a quiet day is not drawn as a straight line', async () => {
    const res = await as(ctx.adminToken, 'get', '/api/v1/admin/analytics/users?range=7d').expect(200);

    expect(res.body.data.series).toHaveLength(8); // inclusive of both endpoints
    for (const point of res.body.data.series) {
      expect(point).toHaveProperty('date');
      expect(typeof point.total).toBe('number');
    }
  });

  it('refuses an out-of-range analytics window', async () => {
    await as(ctx.adminToken, 'get', '/api/v1/admin/analytics/overview?range=100000d').expect(422);
  });

  /** ★ The invariant, queryable on demand rather than only at 3am. */
  it('reports a clean visibility check on a healthy dataset', async () => {
    const res = await as(ctx.adminToken, 'get', '/api/v1/admin/health/visibility').expect(200);

    expect(res.body.data.isHealthy).toBe(true);
    expect(res.body.data.drifted).toBe(0);
    expect(res.body.data.scanned).toBeGreaterThan(0);
  });

  /**
   * ★ Drift is detected, not assumed away. A row edited straight in the database — a bad
   * migration, a manual fix — is exactly the case the reconciliation exists for.
   */
  it('detects a job whose visibility flag was tampered with directly', async () => {
    await Job.collection.updateOne(
      { _id: (await Job.findOne({ _id: ctx.jobId }))._id },
      { $set: { status: JOB_STATUS.PENDING } }, // still flagged publicly visible
    );

    const res = await as(ctx.adminToken, 'get', '/api/v1/admin/health/visibility').expect(200);

    expect(res.body.data.isHealthy).toBe(false);
    expect(res.body.data.wronglyVisible).toBe(1);
  });

  it('keeps non-admins out of analytics', async () => {
    await as(ctx.employerToken, 'get', '/api/v1/admin/analytics/overview').expect(403);
    await as(ctx.candidateToken, 'get', '/api/v1/admin/health/visibility').expect(403);
  });

  it('returns the trust numbers the product is judged on', async () => {
    const res = await as(ctx.adminToken, 'get', '/api/v1/admin/analytics/overview').expect(200);

    expect(res.body.data.trust.liveJobsFromVerifiedCompanies).toBe(1);
    expect(res.body.data.jobs.live).toBe(1);
    expect(res.body.data.employers.verified).toBe(1);
  });
});
