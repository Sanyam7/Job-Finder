import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import {
  ACCOUNT_STATUS,
  APPLICATION_STATUS,
  ERROR_CODES,
  JOB_STATUS,
  ROLES,
  VERIFICATION_STATUS,
} from '@verihire/shared';

import { connectTestDb, clearTestDb, closeTestDb } from '../setup.js';
import app from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { EmployerProfile } from '../../src/models/employerProfile.model.js';
import { CandidateProfile } from '../../src/models/candidateProfile.model.js';
import { Job } from '../../src/models/job.model.js';
import { Application } from '../../src/models/application.model.js';

/**
 * ★ The applications pipeline, proved through the real HTTP stack.
 *
 * The two things this suite exists to prevent:
 *
 *  1. **Applying to a job that is not publicly visible.** The apply path is the one write
 *     a candidate makes against an employer's listing, so it is where a hole in the two-gate
 *     promise would actually hurt someone.
 *  2. **Leaking the employer's private assessment to the candidate.** `employerNotes` and
 *     `rating` reaching the person they are about is not a privacy nuisance — it is a legal
 *     problem, and the kind of bug a projection refactor introduces silently.
 */

const PASSWORD = 'Str0ng!Passw0rd';

/** @type {Record<string, any>} */
let ctx;

beforeAll(async () => {
  await connectTestDb();
}, 120_000);

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  ctx = await seedWorld();
});

/* ------------------------------------------------------------------ fixtures */

const login = async (email) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
};

/**
 * A verified, active employer with one live job, plus a candidate who has a resume on file.
 * The happy path is the fixture so that every test below is about a deviation from it.
 */
const seedWorld = async () => {
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

  const candidateUser = await User.create({
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'candidate@example.test',
    phone: '+919876543210',
    passwordHash: PASSWORD,
    role: ROLES.CANDIDATE,
    isEmailVerified: true,
  });

  const otherCandidateUser = await User.create({
    firstName: 'Rahul',
    lastName: 'Verma',
    email: 'other@example.test',
    passwordHash: PASSWORD,
    role: ROLES.CANDIDATE,
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
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
    status: ACCOUNT_STATUS.ACTIVE,
  });

  const candidateProfile = await CandidateProfile.create({
    user: candidateUser._id,
    headline: 'Senior Frontend Engineer',
    totalExperienceMonths: 60,
    skills: [{ name: 'React' }, { name: 'TypeScript' }],
    location: { city: 'Bengaluru', country: 'India' },
    resume: {
      publicId: 'resumes/priya-v1',
      originalName: 'priya-sharma.pdf',
      format: 'pdf',
      sizeBytes: 240_000,
      version: 1,
      uploadedAt: new Date(),
    },
  });

  // The other candidate deliberately has NO resume — used to prove the resume gate.
  await CandidateProfile.create({
    user: otherCandidateUser._id,
    headline: 'Backend Engineer',
    totalExperienceMonths: 24,
  });

  const job = await Job.create({
    employer: employer._id,
    postedBy: employerUser._id,
    title: 'Senior React Developer',
    slug: 'senior-react-developer-acme',
    companySnapshot: {
      name: 'Acme Technologies',
      slug: 'acme-technologies',
      isVerified: true,
    },
    description:
      'We are looking for a senior React developer to own our design system and lead the frontend guild.',
    employmentType: 'FULL_TIME',
    workMode: 'REMOTE',
    location: { city: 'Bengaluru', country: 'India' },
    deadline: new Date(Date.now() + 30 * 86_400_000),
    status: JOB_STATUS.APPROVED,
    isPubliclyVisible: true,
    publishedAt: new Date(),
  });

  return {
    employerToken: await login('employer@acme.test'),
    adminToken: await login('admin@verihire.test'),
    candidateToken: await login('candidate@example.test'),
    otherCandidateToken: await login('other@example.test'),
    employerId: String(employer._id),
    employerUserId: String(employerUser._id),
    candidateUserId: String(candidateUser._id),
    candidateProfileId: String(candidateProfile._id),
    adminUserId: String(adminUser._id),
    jobId: String(job._id),
  };
};

const applyToJob = (token = ctx.candidateToken, body = {}) =>
  request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ jobId: ctx.jobId, coverLetter: 'I would love to work on your design system.', ...body });

/** Applies and returns the created application id. */
const applyAndGetId = async () => {
  const res = await applyToJob();
  expect(res.status).toBe(201);
  return res.body.data.id;
};

/* ========================================================================== */

describe('★ Applying is gated on the job being publicly visible', () => {
  it('accepts an application to a live job and snapshots it', async () => {
    const res = await applyToJob();

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe(APPLICATION_STATUS.APPLIED);
    // The snapshot, not a populated join — this is what makes the record survive an edit.
    expect(res.body.data.job.title).toBe('Senior React Developer');
    expect(res.body.data.job.company.name).toBe('Acme Technologies');

    const stored = await Application.findById(res.body.data.id);
    expect(stored.resumeSnapshot.publicId).toBe('resumes/priya-v1');
    expect(stored.candidateSnapshot.email).toBe('candidate@example.test');
    expect(stored.timeline).toHaveLength(1);
    expect(stored.timeline[0].status).toBe(APPLICATION_STATUS.APPLIED);
  });

  it('refuses an application to a PENDING job', async () => {
    await Job.updateOne(
      { _id: ctx.jobId },
      { $set: { status: JOB_STATUS.PENDING, isPubliclyVisible: false } },
    );

    const res = await applyToJob();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.JOB_NOT_ACCEPTING_APPLICATIONS);
    expect(await Application.countDocuments({})).toBe(0);
  });

  /**
   * ★ The retroactive case. The job row still says APPROVED; the *company* was suspended.
   * A write-time check that only looked at the job would let this through.
   */
  it('refuses an application once the employer is suspended', async () => {
    await request(app)
      .post(`/api/v1/admin/employers/${ctx.employerId}/suspend`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ reason: 'Reported for requesting payment from applicants.' })
      .expect(200);

    const res = await applyToJob();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.JOB_NOT_ACCEPTING_APPLICATIONS);
    expect(await Application.countDocuments({})).toBe(0);
  });

  it('refuses an application after the deadline has passed', async () => {
    await Job.updateOne(
      { _id: ctx.jobId },
      { $set: { deadline: new Date(Date.now() - 86_400_000) } },
    );

    const res = await applyToJob();
    expect(res.status).toBe(409);
    expect(await Application.countDocuments({})).toBe(0);
  });

  it('requires a resume on file', async () => {
    const res = await applyToJob(ctx.otherCandidateToken);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.RESUME_REQUIRED);
  });

  it('refuses an employer applying to a job', async () => {
    const res = await applyToJob(ctx.employerToken);
    expect(res.status).toBe(403);
  });
});

describe('★ One application per job per candidate', () => {
  it('returns 409 ALREADY_APPLIED on a second attempt', async () => {
    await applyToJob().expect(201);
    const res = await applyToJob();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.ALREADY_APPLIED);
    expect(await Application.countDocuments({})).toBe(1);
  });

  /**
   * ★ The race the unique index exists for.
   *
   * Two concurrent submissions — a double-click, or a client retry — both pass any
   * service-level "have they applied?" read. Exactly one row must survive.
   */
  it('survives two concurrent applications and creates exactly one row', async () => {
    const [a, b] = await Promise.all([applyToJob(), applyToJob()]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await Application.countDocuments({})).toBe(1);
  });

  it('does not free the slot after withdrawing', async () => {
    const id = await applyAndGetId();

    await request(app)
      .post(`/api/v1/applications/${id}/withdraw`)
      .set('Authorization', `Bearer ${ctx.candidateToken}`)
      .send({ reason: 'Accepted another offer' })
      .expect(200);

    const res = await applyToJob();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.ALREADY_APPLIED);
  });

  it('increments the job and employer counters in the same commit', async () => {
    await applyToJob().expect(201);

    const job = await Job.findById(ctx.jobId);
    const employer = await EmployerProfile.findById(ctx.employerId);

    expect(job.stats.applications).toBe(1);
    expect(employer.stats.totalApplications).toBe(1);
  });
});

describe('★ The candidate never receives the employer’s private assessment', () => {
  it('omits employerNotes, rating and tags from the candidate projection', async () => {
    const id = await applyAndGetId();

    await request(app)
      .patch(`/api/v1/applications/${id}/notes`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({ notes: 'Weak on system design. Do not progress.', rating: 2, tags: ['maybe-later'] })
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/applications/${id}`)
      .set('Authorization', `Bearer ${ctx.candidateToken}`)
      .expect(200);

    const body = JSON.stringify(res.body);
    expect(res.body.data).not.toHaveProperty('employerNotes');
    expect(res.body.data).not.toHaveProperty('rating');
    expect(res.body.data).not.toHaveProperty('tags');
    // Belt and braces: the text must not appear anywhere in the payload, however nested.
    expect(body).not.toContain('Weak on system design');
  });

  it('gives the employer their own notes back', async () => {
    const id = await applyAndGetId();

    await request(app)
      .patch(`/api/v1/applications/${id}/notes`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({ notes: 'Strong portfolio.', rating: 5 })
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/applications/${id}`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(200);

    expect(res.body.data.employerNotes).toBe('Strong portfolio.');
    expect(res.body.data.rating).toBe(5);
  });

  it('hides an internal timeline note from the candidate but shows it to the employer', async () => {
    const id = await applyAndGetId();

    await request(app)
      .patch(`/api/v1/applications/${id}/status`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({ status: APPLICATION_STATUS.SHORTLISTED, note: 'Internal: refer to hiring manager' })
      .expect(200);

    const candidateView = await request(app)
      .get(`/api/v1/applications/${id}/timeline`)
      .set('Authorization', `Bearer ${ctx.candidateToken}`)
      .expect(200);

    expect(JSON.stringify(candidateView.body)).not.toContain('refer to hiring manager');

    const employerView = await request(app)
      .get(`/api/v1/applications/${id}/timeline`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(200);

    expect(JSON.stringify(employerView.body)).toContain('refer to hiring manager');
  });

  /**
   * ★ Contact details are the asset an employer would otherwise scrape. Masked until they
   * commit to the candidate by shortlisting.
   */
  it('masks contact details until the candidate is shortlisted', async () => {
    const id = await applyAndGetId();

    const before = await request(app)
      .get(`/api/v1/applications/${id}`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(200);

    expect(before.body.data.candidate.contactUnlocked).toBe(false);
    expect(before.body.data.candidate.email).not.toBe('candidate@example.test');
    expect(before.body.data.candidate.phone).not.toBe('+919876543210');

    await request(app)
      .post(`/api/v1/applications/${id}/shortlist`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send()
      .expect(200);

    const after = await request(app)
      .get(`/api/v1/applications/${id}`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(200);

    expect(after.body.data.candidate.contactUnlocked).toBe(true);
    expect(after.body.data.candidate.email).toBe('candidate@example.test');
  });
});

describe('★ The status machine', () => {
  it('rejects a backwards transition with 409', async () => {
    const id = await applyAndGetId();

    await request(app)
      .post(`/api/v1/applications/${id}/shortlist`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send()
      .expect(200);

    const res = await request(app)
      .patch(`/api/v1/applications/${id}/status`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({ status: APPLICATION_STATUS.VIEWED });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.INVALID_STATUS_TRANSITION);
  });

  it('refuses any change once the application is terminal', async () => {
    const id = await applyAndGetId();

    await request(app)
      .post(`/api/v1/applications/${id}/reject`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({ reason: 'We moved forward with a candidate closer to the role.' })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/applications/${id}/shortlist`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send();

    expect(res.status).toBe(409);
  });

  /**
   * ★ Legal move, wrong actor. An employer withdrawing on a candidate's behalf would let
   * them clean up their own funnel by disappearing people they never replied to.
   */
  it('refuses to let an employer withdraw on the candidate’s behalf', async () => {
    const id = await applyAndGetId();

    const res = await request(app)
      .patch(`/api/v1/applications/${id}/status`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({ status: APPLICATION_STATUS.WITHDRAWN });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.INSUFFICIENT_PERMISSIONS);
  });

  it('refuses to let a candidate shortlist themselves', async () => {
    const id = await applyAndGetId();

    const res = await request(app)
      .patch(`/api/v1/applications/${id}/status`)
      .set('Authorization', `Bearer ${ctx.candidateToken}`)
      .send({ status: APPLICATION_STATUS.SHORTLISTED });

    expect([403, 404]).toContain(res.status);
  });

  it('requires a substantive reason to reject', async () => {
    const id = await applyAndGetId();

    const empty = await request(app)
      .post(`/api/v1/applications/${id}/reject`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({});
    expect(empty.status).toBe(422);

    const tooShort = await request(app)
      .post(`/api/v1/applications/${id}/reject`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({ reason: 'no' });
    expect(tooShort.status).toBe(422);

    expect((await Application.findById(id)).status).toBe(APPLICATION_STATUS.APPLIED);
  });

  it('marking as viewed is idempotent', async () => {
    const id = await applyAndGetId();

    await request(app)
      .post(`/api/v1/applications/${id}/view`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send()
      .expect(200);

    // The employer's UI fires this on every open; the second one must not 409.
    await request(app)
      .post(`/api/v1/applications/${id}/view`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send()
      .expect(200);

    const stored = await Application.findById(id);
    expect(stored.status).toBe(APPLICATION_STATUS.VIEWED);
    expect(stored.timeline.filter((e) => e.status === APPLICATION_STATUS.VIEWED)).toHaveLength(1);
  });

  it('appends to the timeline on every transition and never rewrites it', async () => {
    const id = await applyAndGetId();

    await request(app)
      .post(`/api/v1/applications/${id}/view`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send()
      .expect(200);

    await request(app)
      .post(`/api/v1/applications/${id}/shortlist`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send()
      .expect(200);

    const stored = await Application.findById(id);
    expect(stored.timeline.map((e) => e.status)).toEqual([
      APPLICATION_STATUS.APPLIED,
      APPLICATION_STATUS.VIEWED,
      APPLICATION_STATUS.SHORTLISTED,
    ]);

    // The model refuses to let an existing entry be edited, whatever the caller intends.
    stored.timeline[0].status = APPLICATION_STATUS.HIRED;
    await expect(stored.save()).rejects.toThrow(/append-only/i);
  });

  /**
   * ★ The USP does not stop at the listing. A company suspended for running a scam must not
   * still be able to schedule "interviews" with the people who already applied.
   */
  it('blocks a suspended employer from acting on existing applications', async () => {
    const id = await applyAndGetId();

    // Shortlist first, so the interview below is a legal transition and the ONLY thing
    // standing in its way is the suspension.
    await request(app)
      .post(`/api/v1/applications/${id}/shortlist`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send()
      .expect(200);

    await request(app)
      .post(`/api/v1/admin/employers/${ctx.employerId}/suspend`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ reason: 'Reported for requesting payment from applicants.' })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/applications/${id}/interview`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({
        scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        mode: 'ONLINE',
        meetingLink: 'https://meet.example.com/abc-defg-hij',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.EMPLOYER_SUSPENDED);
  });

  it('requires a meeting link for an online interview', async () => {
    const id = await applyAndGetId();

    await request(app)
      .post(`/api/v1/applications/${id}/shortlist`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send()
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/applications/${id}/interview`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({ scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), mode: 'ONLINE' });

    expect(res.status).toBe(422);
    expect(res.body.error.details.some((d) => d.field === 'meetingLink')).toBe(true);
  });
});

describe('★ Cross-tenant isolation', () => {
  it('returns 404 — not 403 — when another company asks for an application', async () => {
    const id = await applyAndGetId();

    const rivalUser = await User.create({
      firstName: 'Bob',
      lastName: 'Rival',
      email: 'rival@rival.test',
      passwordHash: PASSWORD,
      role: ROLES.EMPLOYER,
      isEmailVerified: true,
    });
    await EmployerProfile.create({
      owner: rivalUser._id,
      companyName: 'Rival Corp',
      description: 'A different company entirely, with a description over fifty characters long.',
      website: 'https://rival.test',
      industry: 'Information Technology',
      companySize: '11-50',
      contact: { email: 'hr@rival.test', phone: '+919876543211' },
      verificationStatus: VERIFICATION_STATUS.VERIFIED,
      status: ACCOUNT_STATUS.ACTIVE,
    });

    const rivalToken = await login('rival@rival.test');

    const res = await request(app)
      .get(`/api/v1/applications/${id}`)
      .set('Authorization', `Bearer ${rivalToken}`);

    // 403 would confirm the id is real — enough to count a competitor's applicants.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ERROR_CODES.APPLICATION_NOT_FOUND);
  });

  it('keeps one candidate out of another candidate’s application', async () => {
    const id = await applyAndGetId();

    const res = await request(app)
      .get(`/api/v1/applications/${id}`)
      .set('Authorization', `Bearer ${ctx.otherCandidateToken}`);

    expect(res.status).toBe(404);
  });

  it('scopes the candidate tracker to the signed-in candidate', async () => {
    await applyAndGetId();

    const mine = await request(app)
      .get('/api/v1/applications/me')
      .set('Authorization', `Bearer ${ctx.candidateToken}`)
      .expect(200);
    expect(mine.body.data).toHaveLength(1);

    const theirs = await request(app)
      .get('/api/v1/applications/me')
      .set('Authorization', `Bearer ${ctx.otherCandidateToken}`)
      .expect(200);
    expect(theirs.body.data).toHaveLength(0);
  });
});

describe('★ The employer inbox', () => {
  it('lists applicants for one job with a funnel summary', async () => {
    const id = await applyAndGetId();

    await request(app)
      .post(`/api/v1/applications/${id}/shortlist`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send()
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/jobs/${ctx.jobId}/applications`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.summary.funnel.stages).toEqual(
      expect.arrayContaining([
        { status: APPLICATION_STATUS.APPLIED, count: 1 },
        { status: APPLICATION_STATUS.SHORTLISTED, count: 1 },
      ]),
    );
    // Shortlisted implies viewed, even though nobody clicked "view" — otherwise the funnel
    // shows a candidate skipping a stage they demonstrably passed through.
    expect(res.body.summary.funnel.stages).toEqual(
      expect.arrayContaining([{ status: APPLICATION_STATUS.VIEWED, count: 1 }]),
    );
  });

  it('never puts a resume URL in a list or detail payload', async () => {
    const id = await applyAndGetId();

    const res = await request(app)
      .get(`/api/v1/applications/${id}`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(200);

    // Resumes are private assets; the only way to one is the audited signing endpoint.
    expect(res.body.data.resume).not.toHaveProperty('url');
    expect(res.body.data.resume).not.toHaveProperty('publicId');
    expect(res.body.data.resume.hasResume).toBe(true);
  });

  it('reports per-id outcomes for a bulk change instead of failing the batch', async () => {
    const first = await applyAndGetId();

    // A second application from the other candidate, withdrawn so it cannot be rejected.
    await CandidateProfile.updateOne(
      { user: ctx.candidateUserId },
      { $set: { 'resume.publicId': 'resumes/priya-v1' } },
    );
    const second = await Application.create({
      job: ctx.jobId,
      employer: ctx.employerId,
      applicant: (await User.findOne({ email: 'other@example.test' }))._id,
      jobSnapshot: { title: 'Senior React Developer', slug: 'x', companyName: 'Acme Technologies' },
      status: APPLICATION_STATUS.WITHDRAWN,
    });

    const res = await request(app)
      .patch('/api/v1/applications/bulk/status')
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .send({
        ids: [first, String(second._id)],
        status: APPLICATION_STATUS.REJECTED,
        reason: 'We have filled this role internally and are closing the pipeline.',
      })
      .expect(200);

    expect(res.body.data.updated).toBe(1);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.results.find((r) => r.id === first).ok).toBe(true);
    expect(res.body.data.results.find((r) => r.id === String(second._id)).ok).toBe(false);
  });
});
