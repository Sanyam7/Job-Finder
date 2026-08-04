import {
  ACCOUNT_STATUS,
  JOB_STATUS,
  ROLES,
  VERIFICATION_STATUS,
  slugify,
} from '@verihire/shared';
import { User } from '../../models/user.model.js';
import { EmployerProfile } from '../../models/employerProfile.model.js';
import { CandidateProfile } from '../../models/candidateProfile.model.js';
import { Job } from '../../models/job.model.js';
import logger from '../../config/logger.js';

/**
 * Demo dataset for development.
 *
 * Deliberately covers **every UI state**, not just the happy path. Building the employer
 * dashboard against only verified companies means the pending and rejected screens get
 * written blind and are usually wrong; this seeds one of each so every state is reachable
 * without manually clicking a company through the whole workflow.
 */

const DEMO_PASSWORD = 'Demo!Pass123';

/**
 * One company per verification outcome, so every badge and gate state is reachable in a demo.
 *
 * `verificationStatus` is widened to `string` deliberately. Left to infer, it becomes the
 * union of exactly the three values used below, which makes the seeder's defensive handling
 * of the fourth (`UNSUBMITTED`) a "no overlap" type error — the checker would be telling us to
 * delete the branch that keeps this seeder correct when someone adds an unsubmitted company.
 *
 * @type {Array<{key: string, companyName: string, email: string, website: string,
 *   industry: string, companySize: string, verificationStatus: string, status?: string,
 *   rejection?: {reason: string, category: string}}>}
 */
const COMPANIES = [
  {
    key: 'verified',
    companyName: 'Acme Technologies',
    email: 'hr@acmetech.io',
    website: 'https://acmetech.io',
    industry: 'Information Technology',
    companySize: '51-200',
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
    status: ACCOUNT_STATUS.ACTIVE,
  },
  {
    key: 'pending',
    companyName: 'Northwind Labs',
    email: 'careers@northwindlabs.io',
    website: 'https://northwindlabs.io',
    industry: 'Software Product',
    companySize: '11-50',
    verificationStatus: VERIFICATION_STATUS.PENDING,
    status: ACCOUNT_STATUS.ACTIVE,
  },
  {
    key: 'rejected',
    companyName: 'Quickhire Consulting',
    email: 'quickhire.jobs@gmail.com', // free domain — trips the automated signal
    website: 'https://quickhire-consulting.io',
    industry: 'IT Services & Consulting',
    companySize: '1-10',
    verificationStatus: VERIFICATION_STATUS.REJECTED,
    status: ACCOUNT_STATUS.ACTIVE,
    rejection: {
      reason:
        'The contact address uses a free mail provider (gmail.com) and does not match the ' +
        'stated company website. Please resubmit using a company email address.',
      category: 'DOMAIN_MISMATCH',
    },
  },
];

/**
 * One job per status, so every badge and empty state is reachable.
 *
 * `status` widened to `string` for the same reason as `COMPANIES` above.
 *
 * @type {Array<{title: string, status: string, workMode: string,
 *   rejection?: {reason: string, category: string}}>}
 */
/**
 * The states that imply a human has already looked. Named consts typed `string[]` so the
 * membership tests below compare against the full status union rather than two literals.
 *
 * @type {string[]}
 */
const REVIEWED_VERIFICATION_STATUSES = [
  VERIFICATION_STATUS.VERIFIED,
  VERIFICATION_STATUS.REJECTED,
];

/** @type {string[]} */
const REVIEWED_JOB_STATUSES = [JOB_STATUS.APPROVED, JOB_STATUS.REJECTED];

const JOB_TEMPLATES = [
  { title: 'Senior React Developer', status: JOB_STATUS.APPROVED, workMode: 'REMOTE' },
  { title: 'Backend Engineer (Node.js)', status: JOB_STATUS.APPROVED, workMode: 'HYBRID' },
  { title: 'DevOps Engineer', status: JOB_STATUS.PENDING, workMode: 'ONSITE' },
  { title: 'Product Designer', status: JOB_STATUS.DRAFT, workMode: 'REMOTE' },
  {
    title: 'Data Analyst',
    status: JOB_STATUS.REJECTED,
    workMode: 'ONSITE',
    rejection: {
      reason: 'The salary range is missing and the description does not list responsibilities.',
      category: 'INCOMPLETE',
    },
  },
  { title: 'QA Automation Engineer', status: JOB_STATUS.ARCHIVED, workMode: 'REMOTE' },
];

export const seedDemoData = async () => {
  const created = { employers: 0, jobs: 0, candidates: 0 };

  for (const spec of COMPANIES) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await User.findOne({ email: spec.email });
    if (existing) continue;

    /* eslint-disable no-await-in-loop */
    const owner = await User.create({
      firstName: spec.companyName.split(' ')[0],
      lastName: 'Recruiter',
      email: spec.email,
      passwordHash: DEMO_PASSWORD,
      role: ROLES.EMPLOYER,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    });

    const employer = await EmployerProfile.create({
      owner: owner._id,
      companyName: spec.companyName,
      slug: slugify(spec.companyName),
      description: `${spec.companyName} builds products used by teams around the world. This is demo data seeded for local development.`,
      website: spec.website,
      industry: spec.industry,
      companySize: spec.companySize,
      foundedYear: 2015,
      contact: { email: spec.email, phone: '+919876543210', hrName: 'Demo Recruiter' },
      address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
      documents: [
        {
          type: 'INCORPORATION',
          publicId: `demo/${slugify(spec.companyName)}-inc`,
          url: 'https://placehold.co/600x800?text=Incorporation',
          originalName: 'incorporation.pdf',
          sizeBytes: 128_000,
        },
        {
          type: 'IDENTITY',
          publicId: `demo/${slugify(spec.companyName)}-id`,
          url: 'https://placehold.co/600x400?text=ID',
          originalName: 'signatory-id.pdf',
          sizeBytes: 96_000,
        },
      ],
      verificationStatus: spec.verificationStatus,
      status: spec.status,
      verification: {
        submittedAt: spec.verificationStatus === VERIFICATION_STATUS.UNSUBMITTED ? null : new Date(),
        reviewedAt: REVIEWED_VERIFICATION_STATUSES.includes(spec.verificationStatus)
          ? new Date()
          : null,
        attemptCount: 1,
        rejectionReason: spec.rejection?.reason ?? null,
        rejectionCategory: spec.rejection?.category ?? null,
      },
    });

    created.employers += 1;

    const isPublishable =
      spec.verificationStatus === VERIFICATION_STATUS.VERIFIED &&
      spec.status === ACCOUNT_STATUS.ACTIVE;

    for (const [index, template] of JOB_TEMPLATES.entries()) {
      const deadline =
        template.status === JOB_STATUS.ARCHIVED
          ? new Date(Date.now() - 5 * 86_400_000)
          : new Date(Date.now() + (30 + index) * 86_400_000);

      // ★ Visibility is derived, exactly as it is at runtime. Seeding a "live" job for an
      // unverified company would create the very state the product forbids.
      const isPubliclyVisible =
        isPublishable && template.status === JOB_STATUS.APPROVED && deadline > new Date();

      await Job.create({
        employer: employer._id,
        postedBy: owner._id,
        title: template.title,
        slug: `${slugify(template.title)}-${slugify(spec.companyName)}-${index}`,
        companySnapshot: {
          name: employer.companyName,
          slug: employer.slug,
          logo: null,
          industry: employer.industry,
          companySize: employer.companySize,
          isVerified: isPublishable,
        },
        description: `We are hiring a ${template.title}. You will work with a small team on products that matter. This listing is demo data for local development, and is long enough to satisfy the minimum description length.`,
        responsibilities: ['Ship features', 'Review code', 'Mentor teammates'],
        requirements: ['Relevant experience', 'Strong fundamentals', 'Clear communication'],
        skillsRequired: [
          { name: 'React', isMandatory: true },
          { name: 'Node.js', isMandatory: false },
        ],
        experience: { minMonths: 36, maxMonths: 84 },
        employmentType: 'FULL_TIME',
        workMode: template.workMode,
        location: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
        salary: { min: 1_800_000, max: 2_800_000, currency: 'INR', period: 'YEARLY', isDisclosed: true },
        openings: 2,
        deadline,
        industry: employer.industry,
        status: template.status,
        isPubliclyVisible,
        publishedAt: template.status === JOB_STATUS.APPROVED ? new Date() : null,
        archivedAt: template.status === JOB_STATUS.ARCHIVED ? new Date() : null,
        moderation: {
          submittedAt: template.status === JOB_STATUS.DRAFT ? null : new Date(),
          reviewedAt: REVIEWED_JOB_STATUSES.includes(template.status) ? new Date() : null,
          rejectionReason: template.rejection?.reason ?? null,
          rejectionCategory: template.rejection?.category ?? null,
        },
      });

      created.jobs += 1;
    }
    /* eslint-enable no-await-in-loop */
  }

  /* ------------------------------------------------------------- candidates */

  for (let i = 1; i <= 5; i += 1) {
    const email = `candidate${i}@example.test`;
    // eslint-disable-next-line no-await-in-loop
    if (await User.findOne({ email })) continue;

    /* eslint-disable no-await-in-loop */
    const user = await User.create({
      firstName: ['Priya', 'Rahul', 'Ananya', 'Vikram', 'Meera'][i - 1],
      lastName: ['Sharma', 'Verma', 'Iyer', 'Singh', 'Nair'][i - 1],
      email,
      passwordHash: DEMO_PASSWORD,
      role: ROLES.CANDIDATE,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    });

    await CandidateProfile.create({
      user: user._id,
      headline: ['Senior Frontend Engineer', 'Backend Engineer', 'Full-stack Developer', 'DevOps Engineer', 'Product Designer'][i - 1],
      bio: 'Demo candidate profile seeded for local development. Long enough to count toward the completeness score.',
      currentCompany: 'Zeta Systems',
      currentDesignation: 'Software Engineer',
      totalExperienceMonths: 24 + i * 12,
      location: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
      skills: [
        { name: 'React', level: 'ADVANCED', yearsOfExperience: 4 },
        { name: 'Node.js', level: 'INTERMEDIATE', yearsOfExperience: 3 },
        { name: 'TypeScript', level: 'ADVANCED', yearsOfExperience: 3 },
      ],
      experience: [
        {
          title: 'Software Engineer',
          company: 'Zeta Systems',
          startDate: new Date('2022-01-10'),
          isCurrent: true,
          description: 'Building and maintaining customer-facing web applications.',
        },
      ],
      education: [
        {
          degree: 'B.Tech',
          fieldOfStudy: 'Computer Science',
          institution: 'Demo Institute of Technology',
          startYear: 2016,
          endYear: 2020,
        },
      ],
      preferences: {
        jobTypes: ['FULL_TIME'],
        workModes: ['REMOTE', 'HYBRID'],
        preferredLocations: ['Bengaluru', 'Remote'],
        expectedSalary: { min: 2_000_000, max: 3_000_000, currency: 'INR', period: 'YEARLY' },
        noticePeriodDays: 30,
        availability: 'WITHIN_30_DAYS',
      },
      // Mixed on purpose so employer search returns some and not others.
      openToWork: i % 2 === 1,
    });

    created.candidates += 1;
    /* eslint-enable no-await-in-loop */
  }

  logger.info('Demo data seeded', {
    ...created,
    credentials: `All demo accounts use the password: ${DEMO_PASSWORD}`,
  });

  return created;
};

export default seedDemoData;
