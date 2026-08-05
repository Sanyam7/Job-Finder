import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import {
  ERROR_CODES,
  JOB_STATUS,
  ROLES,
  VERIFICATION_STATUS,
  ACCOUNT_STATUS,
} from '@verihire/shared';

import { connectTestDb, clearTestDb, closeTestDb } from '../setup.js';
import app from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { EmployerProfile } from '../../src/models/employerProfile.model.js';
import { Job } from '../../src/models/job.model.js';

/**
 * ★ The end-to-end proof of the product's core promise.
 *
 * The unit suite proves `computeVisibility` is correct in isolation. This suite proves the
 * whole HTTP stack honours it: middleware, services, repositories and the public read path
 * together. If any of these fail, a fake job can reach a candidate.
 */

const PASSWORD = 'Str0ng!Passw0rd';

/** @type {{employerToken: string, adminToken: string, employerId: string, employerUserId: string}} */
let ctx;

beforeAll(async () => {
  await connectTestDb();
}, 120_000);

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  ctx = await seedActors();
});

/** Creates an unverified employer, an admin, and signs both in. */
const seedActors = async () => {
  const employerUser = await User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'employer@acme.test',
    passwordHash: PASSWORD,
    role: ROLES.EMPLOYER,
    isEmailVerified: true,
  });

  const adminUser = await User.create({
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'admin@verihire.test',
    passwordHash: PASSWORD,
    role: ROLES.ADMIN,
    isEmailVerified: true,
  });

  const employer = await EmployerProfile.create({
    owner: employerUser._id,
    companyName: 'Acme Technologies',
    description: 'We build things that work, and we have written more than fifty characters.',
    website: 'https://acmetech.io',
    industry: 'Information Technology',
    companySize: '51-200',
    contact: { email: 'hr@acmetech.io', phone: '+919876543210' },
    address: { city: 'Bengaluru', country: 'India' },
    documents: [
      {
        type: 'INCORPORATION',
        publicId: 'docs/inc-1',
        url: 'https://res.cloudinary.com/x/inc-1',
        originalName: 'incorporation.pdf',
      },
      {
        type: 'IDENTITY',
        publicId: 'docs/id-1',
        url: 'https://res.cloudinary.com/x/id-1',
        originalName: 'id.pdf',
      },
    ],
  });

  const login = async (email) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.data.accessToken;
  };

  return {
    employerToken: await login('employer@acme.test'),
    adminToken: await login('admin@verihire.test'),
    employerId: String(employer._id),
    employerUserId: String(employerUser._id),
  };
};

/** Creates a DRAFT job directly, bypassing the create endpoint. */
const seedDraftJob = async (overrides = {}) =>
  Job.create({
    employer: ctx.employerId,
    postedBy: ctx.employerUserId,
    title: 'Senior React Developer',
    slug: `senior-react-developer-${Date.now()}`,
    companySnapshot: { name: 'Acme Technologies', slug: 'acme-technologies', isVerified: false },
    description:
      'We are looking for a senior React developer to own our design system and lead the frontend guild.',
    employmentType: 'FULL_TIME',
    workMode: 'REMOTE',
    deadline: new Date(Date.now() + 30 * 86_400_000),
    status: JOB_STATUS.DRAFT,
    isPubliclyVisible: false,
    ...overrides,
  });

const verifyEmployer = () =>
  request(app)
    .post(`/api/v1/admin/employers/${ctx.employerId}/verify`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({
      checklist: {
        companyNameMatches: true,
        websiteLive: true,
        emailDomainMatches: true,
        documentsValid: true,
        identityValid: true,
      },
    });

/* ========================================================================== */

/**
 * ★ Registration is exercised through the API, not by constructing documents.
 *
 * Every other suite here builds its employer with `EmployerProfile.create(...)`, which is
 * fast and readable but starts from a state the real sign-up path never produced: the
 * company profile was never created at registration, so a genuinely registered employer got
 * 404 EMPLOYER_PROFILE_MISSING from every employer endpoint — including `PATCH
 * /employers/me`, leaving no way to create one and no way into the product at all. The gate
 * suites all passed throughout, because none of them ever registered anybody.
 */
describe('★ Employer sign-up produces a usable account', () => {
  const signUp = () =>
    request(app).post('/api/v1/auth/register').send({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'newemployer@acme.test',
      password: PASSWORD,
      confirmPassword: PASSWORD,
      role: ROLES.EMPLOYER,
      companyName: 'Hopper Systems',
    });

  it('creates the company profile in the same breath as the account', async () => {
    const res = await signUp();
    expect(res.status).toBe(201);

    const user = await User.findOne({ email: 'newemployer@acme.test' });
    expect(user).not.toBeNull();

    const profile = await EmployerProfile.findOne({ owner: user._id });
    expect(profile).not.toBeNull();
    expect(profile.companyName).toBe('Hopper Systems');
    expect(profile.verificationStatus).toBe(VERIFICATION_STATUS.UNSUBMITTED);
  });

  it('lets a freshly registered employer reach their own company', async () => {
    await signUp();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'newemployer@acme.test', password: PASSWORD });
    expect(login.status).toBe(200);

    // The check that matters: this returned 404 for every real sign-up, so onboarding
    // could never begin.
    const me = await request(app)
      .get('/api/v1/employers/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    expect(me.status).toBe(200);
  });

  it('does not create a company profile for a candidate', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      firstName: 'Alan',
      lastName: 'Turing',
      email: 'newcandidate@acme.test',
      password: PASSWORD,
      confirmPassword: PASSWORD,
      role: ROLES.CANDIDATE,
    });
    expect(res.status).toBe(201);

    const user = await User.findOne({ email: 'newcandidate@acme.test' });
    expect(await EmployerProfile.findOne({ owner: user._id })).toBeNull();
  });
});

describe('★ Gate 1 — an unverified employer cannot publish', () => {
  it('blocks POST /jobs with EMPLOYER_NOT_VERIFIED', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({
        title: 'Senior React Developer',
        description: 'A'.repeat(60),
        employmentType: 'FULL_TIME',
        workMode: 'REMOTE',
        deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.EMPLOYER_NOT_VERIFIED);
    // The client needs enough detail to render the right locked state in one round trip.
    expect(res.body.error.details).toMatchObject({
      verificationStatus: VERIFICATION_STATUS.UNSUBMITTED,
      canResubmit: true,
    });
  });

  it('blocks submitting an existing draft for review', async () => {
    const job = await seedDraftJob();

    const res = await request(app)
      .post(`/api/v1/jobs/${job._id}/submit`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.EMPLOYER_NOT_VERIFIED);

    const unchanged = await Job.findById(job._id);
    expect(unchanged.status).toBe(JOB_STATUS.DRAFT);
    expect(unchanged.isPubliclyVisible).toBe(false);
  });

  it('still allows reading their own jobs while unverified', async () => {
    await seedDraftJob();
    const res = await request(app)
      .get('/api/v1/employers/me/jobs')
      .set('Authorization', `Bearer ${ctx.employerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('★ Gate 2 — an approved employer still needs each job approved', () => {
  beforeEach(async () => {
    await EmployerProfile.findByIdAndUpdate(ctx.employerId, {
      verificationStatus: VERIFICATION_STATUS.VERIFIED,
    });
  });

  it('creates jobs as DRAFT, never visible', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({
        title: 'Backend Engineer',
        description: 'B'.repeat(60),
        employmentType: 'FULL_TIME',
        workMode: 'ONSITE',
        deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe(JOB_STATUS.DRAFT);
    expect(res.body.data.isPubliclyVisible).toBe(false);
  });

  it('keeps a PENDING job out of the public list', async () => {
    await seedDraftJob({ status: JOB_STATUS.PENDING, moderation: { submittedAt: new Date() } });

    const res = await request(app).get('/api/v1/public/jobs');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns 404 — not 403 — for a pending job fetched by slug', async () => {
    const job = await seedDraftJob({ status: JOB_STATUS.PENDING });

    const res = await request(app).get(`/api/v1/public/jobs/${job.slug}`);

    // 403 would confirm the listing exists, which is exactly what a scraper wants.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ERROR_CODES.JOB_NOT_FOUND);
  });

  it('publishes only after an admin approves', async () => {
    const job = await seedDraftJob({ status: JOB_STATUS.PENDING });

    const before = await request(app).get('/api/v1/public/jobs');
    expect(before.body.data).toHaveLength(0);

    const approve = await request(app)
      .post(`/api/v1/admin/jobs/${job._id}/approve`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ note: 'Looks good' });

    expect(approve.status).toBe(200);
    expect(approve.body.data.isPubliclyVisible).toBe(true);

    const after = await request(app).get('/api/v1/public/jobs');
    expect(after.body.data).toHaveLength(1);
    expect(after.body.data[0].title).toBe('Senior React Developer');
  });

  it('refuses a rejection with no reason', async () => {
    const job = await seedDraftJob({ status: JOB_STATUS.PENDING });

    const res = await request(app)
      .post(`/api/v1/admin/jobs/${job._id}/reject`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ category: 'MISLEADING' });

    expect(res.status).toBe(422);
    expect(res.body.error.details.some((d) => d.field === 'reason')).toBe(true);
  });
});

describe('★ Verifying an employer publishes their already-approved jobs', () => {
  it('flips visibility for approved, in-deadline jobs in one transaction', async () => {
    // Approved by an admin earlier, but hidden because the company was never verified.
    await seedDraftJob({ status: JOB_STATUS.APPROVED, isPubliclyVisible: false });
    await EmployerProfile.findByIdAndUpdate(ctx.employerId, {
      verificationStatus: VERIFICATION_STATUS.PENDING,
      'verification.submittedAt': new Date(),
    });

    const before = await request(app).get('/api/v1/public/jobs');
    expect(before.body.data).toHaveLength(0);

    const res = await verifyEmployer();
    expect(res.status).toBe(200);
    expect(res.body.data.jobsMadeVisible).toBe(1);

    const after = await request(app).get('/api/v1/public/jobs');
    expect(after.body.data).toHaveLength(1);
  });

  it('does not publish jobs whose deadline has already passed', async () => {
    await seedDraftJob({
      status: JOB_STATUS.APPROVED,
      isPubliclyVisible: false,
      deadline: new Date(Date.now() - 86_400_000),
    });
    await EmployerProfile.findByIdAndUpdate(ctx.employerId, {
      verificationStatus: VERIFICATION_STATUS.PENDING,
    });

    await verifyEmployer();

    const res = await request(app).get('/api/v1/public/jobs');
    expect(res.body.data).toHaveLength(0);
  });
});

describe('★ Suspension removes live listings immediately', () => {
  it('hides every job in the same request', async () => {
    await EmployerProfile.findByIdAndUpdate(ctx.employerId, {
      verificationStatus: VERIFICATION_STATUS.VERIFIED,
    });
    await seedDraftJob({
      status: JOB_STATUS.APPROVED,
      isPubliclyVisible: true,
      publishedAt: new Date(),
    });

    const before = await request(app).get('/api/v1/public/jobs');
    expect(before.body.data).toHaveLength(1);

    const suspend = await request(app)
      .post(`/api/v1/admin/employers/${ctx.employerId}/suspend`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ reason: 'Multiple verified reports of fraudulent listings.' });

    expect(suspend.status).toBe(200);
    expect(suspend.body.data.jobsHidden).toBe(1);

    // This is the case a write-time-only check cannot handle.
    const after = await request(app).get('/api/v1/public/jobs');
    expect(after.body.data).toHaveLength(0);
  });

  it('restores visibility only if the company is still verified', async () => {
    await EmployerProfile.findByIdAndUpdate(ctx.employerId, {
      verificationStatus: VERIFICATION_STATUS.UNSUBMITTED,
      status: ACCOUNT_STATUS.SUSPENDED,
    });
    await seedDraftJob({ status: JOB_STATUS.APPROVED, isPubliclyVisible: false });

    await request(app)
      .post(`/api/v1/admin/employers/${ctx.employerId}/restore`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send();

    const res = await request(app).get('/api/v1/public/jobs');
    expect(res.body.data).toHaveLength(0);
  });
});

describe('★ RBAC on the moderation surface', () => {
  it('refuses an employer access to the admin queue', async () => {
    const res = await request(app)
      .get('/api/v1/admin/employers')
      .set('Authorization', `Bearer ${ctx.employerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.INSUFFICIENT_PERMISSIONS);
  });

  it('refuses an anonymous caller', async () => {
    const res = await request(app).get('/api/v1/admin/jobs');
    expect(res.status).toBe(401);
  });

  it('refuses ADMIN as a sign-up role', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      firstName: 'Mallory',
      lastName: 'Attacker',
      email: 'mallory@evil.test',
      password: PASSWORD,
      role: ROLES.ADMIN,
    });

    expect(res.status).toBe(422);
    expect(await User.findOne({ email: 'mallory@evil.test' })).toBeNull();
  });
});
