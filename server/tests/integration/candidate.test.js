import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import {
  ACCOUNT_STATUS,
  FIELD_SOURCE,
  PARSE_STATUS,
  PROFILE_VISIBILITY,
  ROLES,
  VERIFICATION_STATUS,
} from '@verihire/shared';

import { connectTestDb, clearTestDb, closeTestDb } from '../setup.js';
import app from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { EmployerProfile } from '../../src/models/employerProfile.model.js';
import { CandidateProfile } from '../../src/models/candidateProfile.model.js';
import { Application } from '../../src/models/application.model.js';

/**
 * ★ ADR-006 — "Never force AI extracted values. Manual editing should always be allowed."
 *
 * This suite exists to make that sentence from the brief enforceable rather than aspirational.
 * The claim under test is narrow and absolute: **nothing a machine extracted reaches a live
 * profile field without an explicit, per-field request from the person it belongs to.**
 *
 * It also covers the candidate's own discoverability switch, which is the candidate-side
 * mirror of employer verification: employers are visible only after a human approves them,
 * candidates are searchable only after they opt in.
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

const login = async (email) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
};

const seedWorld = async () => {
  const candidateUser = await User.create({
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'candidate@example.test',
    phone: '+919876543210',
    passwordHash: PASSWORD,
    role: ROLES.CANDIDATE,
    isEmailVerified: true,
  });

  const employerUser = await User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'employer@acme.test',
    passwordHash: PASSWORD,
    role: ROLES.EMPLOYER,
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
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
    status: ACCOUNT_STATUS.ACTIVE,
  });

  return {
    candidateToken: await login('candidate@example.test'),
    employerToken: await login('employer@acme.test'),
    candidateUserId: String(candidateUser._id),
    employerId: String(employer._id),
    employerUserId: String(employerUser._id),
  };
};

const asCandidate = (method, path) =>
  request(app)[method](path).set('Authorization', `Bearer ${ctx.candidateToken}`);

/**
 * Writes a parsed draft directly.
 *
 * The parse worker is exercised by the unit suite; what matters here is the *boundary*, and
 * seeding the draft lets these tests assert it without a Cloudinary round trip.
 */
const seedDraft = async (fields, { userEditedPaths = [] } = {}) => {
  const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });

  profile.parsedDraft = {
    extractedAt: new Date(),
    engine: 'deterministic',
    llmUsed: false,
    fields,
    appliedAt: null,
  };
  profile.resume = { ...profile.resume, parseStatus: PARSE_STATUS.PARSED, version: 1 };
  for (const path of userEditedPaths) profile.fieldSources.set(path, FIELD_SOURCE.USER);

  await profile.save();
  return profile;
};

/* ========================================================================== */

describe('profile lifecycle', () => {
  it('creates the profile on first access instead of at registration', async () => {
    expect(await CandidateProfile.countDocuments({})).toBe(0);

    const res = await asCandidate('get', '/api/v1/candidates/me').expect(200);

    expect(res.body.data.profileCompleteness).toBe(0);
    expect(await CandidateProfile.countDocuments({ user: ctx.candidateUserId })).toBe(1);
  });

  it('is idempotent — two concurrent first visits create one profile', async () => {
    await Promise.all([
      asCandidate('get', '/api/v1/candidates/me'),
      asCandidate('get', '/api/v1/candidates/me'),
    ]);

    expect(await CandidateProfile.countDocuments({ user: ctx.candidateUserId })).toBe(1);
  });

  it('marks every field the candidate edits as USER-authored', async () => {
    await asCandidate('get', '/api/v1/candidates/me').expect(200);

    const res = await asCandidate('patch', '/api/v1/candidates/me')
      .send({ headline: 'Staff Frontend Engineer', bio: 'A'.repeat(80) })
      .expect(200);

    expect(res.body.data.touched).toEqual(expect.arrayContaining(['headline', 'bio']));

    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });
    expect(profile.fieldSources.get('headline')).toBe(FIELD_SOURCE.USER);
    expect(profile.fieldSources.get('bio')).toBe(FIELD_SOURCE.USER);
  });

  /**
   * ★ Regression: Mongoose maps reject keys containing a dot, so a naive provenance write
   * threw on the first nested edit anyone made — `preferences.noticePeriodDays` 500s while
   * `headline` works fine, which is exactly the kind of bug that ships.
   */
  it('records provenance for nested paths, not just top-level ones', async () => {
    await asCandidate('get', '/api/v1/candidates/me').expect(200);

    await asCandidate('patch', '/api/v1/candidates/me/preferences')
      .send({ noticePeriodDays: 30, willingToRelocate: true })
      .expect(200);

    const res = await asCandidate('get', '/api/v1/candidates/me').expect(200);

    // The API speaks dot-paths whatever the storage encoding is.
    expect(res.body.data.fieldSources['preferences.noticePeriodDays']).toBe(FIELD_SOURCE.USER);
    expect(res.body.data.preferences.noticePeriodDays).toBe(30);
  });

  it('recomputes weighted completeness as the profile fills in', async () => {
    await asCandidate('get', '/api/v1/candidates/me').expect(200);

    const before = await asCandidate('patch', '/api/v1/candidates/me')
      .send({ headline: 'Staff Frontend Engineer' })
      .expect(200);

    const after = await asCandidate('put', '/api/v1/candidates/me/skills')
      .send({ skills: [{ name: 'React' }, { name: 'Node.js' }, { name: 'TypeScript' }] })
      .expect(200);

    expect(after.body.data.profileCompleteness).toBeGreaterThan(
      before.body.data.profile.profileCompleteness,
    );
  });

  it('de-duplicates skills case-insensitively', async () => {
    await asCandidate('get', '/api/v1/candidates/me').expect(200);

    const res = await asCandidate('put', '/api/v1/candidates/me/skills')
      .send({ skills: [{ name: 'React' }, { name: 'react' }, { name: ' REACT ' }] })
      .expect(200);

    expect(res.body.data.skills).toHaveLength(1);
  });

  it('adds, edits and removes an experience entry', async () => {
    await asCandidate('get', '/api/v1/candidates/me').expect(200);

    const added = await asCandidate('post', '/api/v1/candidates/me/experience')
      .send({
        title: 'Software Engineer',
        company: 'Zeta Systems',
        startDate: '2022-01-10',
        isCurrent: true,
      })
      .expect(201);

    const itemId = added.body.data.experience[0]._id ?? added.body.data.experience[0].id;

    const updated = await asCandidate('patch', `/api/v1/candidates/me/experience/${itemId}`)
      .send({ title: 'Senior Software Engineer' })
      .expect(200);
    expect(updated.body.data.experience[0].title).toBe('Senior Software Engineer');

    const removed = await asCandidate('delete', `/api/v1/candidates/me/experience/${itemId}`)
      .expect(200);
    expect(removed.body.data.experience).toHaveLength(0);
  });

  it('refuses an unknown profile section', async () => {
    await asCandidate('get', '/api/v1/candidates/me').expect(200);
    await asCandidate('post', '/api/v1/candidates/me/salaryHistory')
      .send({ name: 'x' })
      .expect(422);
  });

  it('keeps employers out of the candidate-only endpoints', async () => {
    await request(app)
      .get('/api/v1/candidates/me')
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(403);
  });
});

describe('★ ADR-006 — extracted values are never forced', () => {
  beforeEach(async () => {
    await asCandidate('get', '/api/v1/candidates/me').expect(200);
  });

  /**
   * ★ The core claim. A parse landed a full draft; the live profile is still empty.
   */
  it('leaves the live profile untouched when a draft exists', async () => {
    await seedDraft({
      headline: 'Senior Frontend Engineer',
      totalExperienceMonths: 60,
      skills: [{ name: 'React' }, { name: 'Node.js' }],
    });

    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });
    expect(profile.headline).toBeUndefined();
    expect(profile.totalExperienceMonths).toBe(0);
    expect(profile.skills).toHaveLength(0);

    const res = await asCandidate('get', '/api/v1/candidates/me').expect(200);
    expect(res.body.data.headline).toBeNull();
    expect(res.body.data.hasPendingDraft).toBe(true);
  });

  it('returns the draft side by side with the current value', async () => {
    await asCandidate('patch', '/api/v1/candidates/me')
      .send({ headline: 'What I actually call myself' })
      .expect(200);

    await seedDraft(
      { headline: 'Senior Frontend Engineer', bio: 'B'.repeat(60) },
      { userEditedPaths: ['headline'] },
    );

    const res = await asCandidate('get', '/api/v1/candidates/me/resume/draft').expect(200);

    const headline = res.body.data.fields.find((f) => f.path === 'headline');
    expect(headline.current).toBe('What I actually call myself');
    expect(headline.extracted).toBe('Senior Frontend Engineer');
    // ★ The warning that keeps the review honest.
    expect(headline.conflictsWithUserEdit).toBe(true);

    const bio = res.body.data.fields.find((f) => f.path === 'bio');
    expect(bio.conflictsWithUserEdit).toBe(false);
    expect(bio.isEmpty).toBe(true);

    // Nothing is pre-selected — a pre-ticked checkbox is not consent.
    expect(headline).not.toHaveProperty('selected');
  });

  /**
   * ★ Selective application. The candidate takes the bio and leaves the headline; the
   * headline they wrote must survive untouched.
   */
  it('applies only the paths the candidate names', async () => {
    await asCandidate('patch', '/api/v1/candidates/me')
      .send({ headline: 'What I actually call myself' })
      .expect(200);

    await seedDraft(
      { headline: 'Senior Frontend Engineer', bio: 'C'.repeat(60), totalExperienceMonths: 60 },
      { userEditedPaths: ['headline'] },
    );

    const res = await asCandidate('post', '/api/v1/candidates/me/resume/draft/apply')
      .send({ paths: ['bio'] })
      .expect(200);

    expect(res.body.data.applied).toEqual(['bio']);

    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });
    expect(profile.bio).toBe('C'.repeat(60));
    expect(profile.headline).toBe('What I actually call myself');
    expect(profile.totalExperienceMonths).toBe(0);
  });

  /**
   * ★ An applied value is marked PARSER, not USER.
   *
   * The candidate accepted a machine's reading; they did not write it. Only their own typing
   * locks a field against a future re-parse.
   */
  it('records an accepted value as PARSER-sourced, not USER', async () => {
    await seedDraft({ headline: 'Senior Frontend Engineer' });

    await asCandidate('post', '/api/v1/candidates/me/resume/draft/apply')
      .send({ paths: ['headline'] })
      .expect(200);

    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });
    expect(profile.headline).toBe('Senior Frontend Engineer');
    expect(profile.fieldSources.get('headline')).toBe(FIELD_SOURCE.PARSER);
  });

  it('refuses an apply request with no paths — there is no "accept everything"', async () => {
    await seedDraft({ headline: 'Senior Frontend Engineer', bio: 'D'.repeat(60) });

    await asCandidate('post', '/api/v1/candidates/me/resume/draft/apply')
      .send({ paths: [] })
      .expect(422);

    await asCandidate('post', '/api/v1/candidates/me/resume/draft/apply').send({}).expect(422);

    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });
    expect(profile.headline).toBeUndefined();
  });

  /**
   * `paths` is fed to `profile.set()`, so a path that reaches Mongoose unchecked is a write
   * primitive. The validator's allowlist is what stops that.
   */
  it('rejects a path that is not a plain dot path', async () => {
    await seedDraft({ headline: 'Senior Frontend Engineer' });

    for (const path of ['$where', 'a.$.b', '__proto__.polluted', 'skills.0.name']) {
      // eslint-disable-next-line no-await-in-loop
      await asCandidate('post', '/api/v1/candidates/me/resume/draft/apply')
        .send({ paths: [path] })
        .expect(422);
    }
  });

  it('reports a path that is not in the draft instead of inventing a value', async () => {
    await seedDraft({ headline: 'Senior Frontend Engineer' });

    const res = await asCandidate('post', '/api/v1/candidates/me/resume/draft/apply')
      .send({ paths: ['headline', 'currentCompany'] })
      .expect(200);

    expect(res.body.data.applied).toEqual(['headline']);
    expect(res.body.data.skipped).toEqual([{ path: 'currentCompany', reason: 'NOT_IN_DRAFT' }]);
  });

  it('discards a draft without changing the profile', async () => {
    await seedDraft({ headline: 'Senior Frontend Engineer', bio: 'E'.repeat(60) });

    await asCandidate('delete', '/api/v1/candidates/me/resume/draft').expect(200);

    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });
    expect(profile.parsedDraft.fields).toBeNull();
    expect(profile.headline).toBeUndefined();
    expect(profile.bio).toBeUndefined();
  });

  it('reports parse status when there is no draft', async () => {
    const res = await asCandidate('get', '/api/v1/candidates/me/resume/draft').expect(200);

    expect(res.body.data.hasDraft).toBe(false);
    expect(res.body.data.parseStatus).toBe(PARSE_STATUS.NONE);
    expect(res.body.data.fields).toEqual([]);
  });
});

describe('★ candidate discoverability is opt-in', () => {
  beforeEach(async () => {
    await asCandidate('get', '/api/v1/candidates/me').expect(200);
  });

  it('defaults to not open to work', async () => {
    const res = await asCandidate('get', '/api/v1/candidates/me').expect(200);
    expect(res.body.data.openToWork).toBe(false);
  });

  it('hides a candidate who has not opted in, even from a verified employer', async () => {
    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });

    const res = await request(app)
      .get(`/api/v1/candidates/${profile._id}`)
      .set('Authorization', `Bearer ${ctx.employerToken}`);

    // 404, not 403 — a private profile must not be confirmable by its id.
    expect(res.status).toBe(404);
  });

  it('shows a candidate who opted in', async () => {
    await asCandidate('patch', '/api/v1/candidates/me/visibility')
      .send({ openToWork: true, profileVisibility: PROFILE_VISIBILITY.EMPLOYERS_ONLY })
      .expect(200);

    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });

    const res = await request(app)
      .get(`/api/v1/candidates/${profile._id}`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(200);

    expect(res.body.data.visibleVia).toBe('DISCOVERABLE');
  });

  it('keeps PRIVATE hidden even when open to work', async () => {
    await asCandidate('patch', '/api/v1/candidates/me/visibility')
      .send({ openToWork: true, profileVisibility: PROFILE_VISIBILITY.PRIVATE })
      .expect(200);

    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });

    await request(app)
      .get(`/api/v1/candidates/${profile._id}`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(404);
  });

  /**
   * ★ The second door. Applying to a company's job makes you visible to *that* company,
   * whatever your search settings — you chose to be seen by them.
   */
  it('reveals an applicant to the company they applied to, even when private', async () => {
    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });
    profile.profileVisibility = PROFILE_VISIBILITY.PRIVATE;
    await profile.save();

    await Application.create({
      job: profile._id, // any ObjectId — the lookup is on employer + candidateProfile
      employer: ctx.employerId,
      applicant: ctx.candidateUserId,
      candidateProfile: profile._id,
      jobSnapshot: { title: 'Senior React Developer', slug: 'x', companyName: 'Acme Technologies' },
    });

    const res = await request(app)
      .get(`/api/v1/candidates/${profile._id}`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(200);

    expect(res.body.data.visibleVia).toBe('APPLICATION');
  });

  it('masks contact details and hides current salary from an employer', async () => {
    await asCandidate('patch', '/api/v1/candidates/me/visibility')
      .send({ openToWork: true })
      .expect(200);

    await asCandidate('patch', '/api/v1/candidates/me/preferences')
      .send({ currentSalary: { amount: 1_800_000, isConfidential: true } })
      .expect(200);

    const profile = await CandidateProfile.findOne({ user: ctx.candidateUserId });

    const res = await request(app)
      .get(`/api/v1/candidates/${profile._id}`)
      .set('Authorization', `Bearer ${ctx.employerToken}`)
      .expect(200);

    expect(res.body.data.contactUnlocked).toBe(false);
    expect(res.body.data.email).not.toBe('candidate@example.test');

    // ★ Current pay never reaches the person negotiating the offer, at any status.
    expect(res.body.data.preferences).not.toHaveProperty('currentSalary');
    expect(JSON.stringify(res.body)).not.toContain('1800000');
  });
});
