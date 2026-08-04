# 03 — Database Design

MongoDB 7 · Mongoose 8 · 14 collections. Design principle: **normalise across aggregate roots,
embed within them** (ADR-009).

---

## 1. ER Diagram

```mermaid
erDiagram
    USERS ||--o| CANDIDATE_PROFILES : "has (role=CANDIDATE)"
    USERS ||--o| EMPLOYER_PROFILES : "owns (role=EMPLOYER)"
    USERS ||--o{ REFRESH_TOKENS : "sessions"
    USERS ||--o{ VERIFICATION_TOKENS : "email/reset"
    USERS ||--o{ NOTIFICATIONS : "receives"
    USERS ||--o{ BOOKMARKS : "creates"
    USERS ||--o{ AUDIT_LOGS : "actor"
    USERS ||--o{ REPORTS : "reporter"

    EMPLOYER_PROFILES ||--o{ VERIFICATION_REQUESTS : "submits"
    EMPLOYER_PROFILES ||--o{ JOBS : "publishes"

    JOBS ||--o{ APPLICATIONS : "receives"
    CANDIDATE_PROFILES ||--o{ APPLICATIONS : "submits"

    SKILLS ||--o{ CANDIDATE_PROFILES : "tagged in"
    SKILLS ||--o{ JOBS : "required by"

    JOBS ||--o{ REPORTS : "reported"
    JOBS ||--o{ BOOKMARKS : "saved"
    CANDIDATE_PROFILES ||--o{ BOOKMARKS : "shortlisted"

    USERS {
        ObjectId _id
        string  email UK
        string  passwordHash
        enum    role
        enum    status
        bool    isEmailVerified
        date    createdAt
    }
    CANDIDATE_PROFILES {
        ObjectId _id
        ObjectId user FK UK
        string   headline
        array    skills
        array    experience "embedded"
        array    education  "embedded"
        object   resume
        object   parsedDraft
        bool     openToWork
    }
    EMPLOYER_PROFILES {
        ObjectId _id
        ObjectId owner FK UK
        string   companyName
        string   slug UK
        enum     verificationStatus
        enum     status
    }
    JOBS {
        ObjectId _id
        ObjectId employer FK
        string   title
        string   slug UK
        enum     status
        bool     isPubliclyVisible
        date     deadline
    }
    APPLICATIONS {
        ObjectId _id
        ObjectId job FK
        ObjectId candidate FK
        ObjectId employer FK
        enum     status
        array    timeline "embedded"
    }
```

---

## 2. Collection: `users`

The **authentication identity only**. Profile data lives in role-specific collections. This keeps
the hot auth document tiny (one index-covered read per request).

| Field | Type | Rules |
|---|---|---|
| `_id` | ObjectId | |
| `firstName` | String | required, 2–50, trimmed |
| `lastName` | String | required, 2–50 |
| `email` | String | **unique**, lowercase, indexed, validated |
| `passwordHash` | String | `select: false`, bcrypt(12) |
| `role` | Enum | `CANDIDATE` \| `EMPLOYER` \| `ADMIN` — **immutable after creation** |
| `status` | Enum | `ACTIVE` \| `SUSPENDED` \| `DELETED`, default `ACTIVE` |
| `isEmailVerified` | Boolean | default `false` |
| `emailVerifiedAt` | Date | |
| `avatar` | `documentSchema` | Cloudinary `{ publicId, url, format, bytes }` |
| `phone` | String | sparse, E.164 validated |
| `lastLoginAt` / `lastLoginIp` | Date / String | |
| `failedLoginAttempts` | Number | default 0 |
| `lockedUntil` | Date | brute-force lockout after 5 fails / 15 min |
| `passwordChangedAt` | Date | **invalidates JWTs issued before it** |
| `suspendedReason` / `suspendedBy` / `suspendedAt` | String / ObjectId / Date | |
| `deletedAt` / `deletedBy` | Date / ObjectId | soft delete |
| `createdAt` / `updatedAt` | Date | |

**Methods:** `comparePassword()`, `isPasswordChangedAfter(jwtIat)`, `isLocked()`.
**Hooks:** `pre('save')` hashes password + stamps `passwordChangedAt`; `toJSON` strips
`passwordHash`, `failedLoginAttempts`, `__v`.

> `passwordChangedAt` is the mechanism that makes "Change password logs out other devices"
> actually work — the auth middleware compares it against the JWT `iat`.

---

## 3. Collection: `candidateProfiles`

1:1 with a `CANDIDATE` user. Every user-editable text field uses the **traced field** shape from
ADR-006 where AI can populate it.

```js
{
  user: ObjectId,            // ref User, unique, indexed
  // ---- Presentation ----
  headline:   String,        // max 120  "Senior React Engineer @ Acme"
  bio:        String,        // max 2000
  profilePicture: documentSchema,
  location: { city, state, country, coordinates:[lng,lat] },

  // ---- Professional ----
  currentCompany:   String,
  currentDesignation: String,
  totalExperienceMonths: Number,   // canonical unit = MONTHS (never "3.5 years")
  skills: [{ skill: ObjectId(Skill), name: String, level: Enum, yearsOfExperience: Number }],
  experience:     [experienceSchema],     // embedded, max 30
  education:      [educationSchema],      // embedded, max 15
  projects:       [projectSchema],        // embedded, max 20
  certifications: [certificationSchema],  // embedded, max 30
  achievements:   [String],
  languages:      [{ name, proficiency }],

  // ---- Links ----
  links: { github, linkedin, portfolio, twitter, other:[{label,url}] },

  // ---- Resume ----
  resume: {
    publicId, url, originalName, format, sizeBytes, version,
    uploadedAt,
    parseStatus: Enum['NONE','PARSING','PARSED','FAILED'],
    parseError: String
  },
  parsedDraft: {                 // ★ ADR-006 — never auto-applied
    extractedAt: Date,
    engine: 'pdf-parse' | 'mammoth',
    llmUsed: Boolean,
    fields: Mixed,               // same shape as profile, each {value,confidence}
    appliedAt: Date
  },
  fieldSources: Map<String, Enum['USER','PARSER','AI']>,   // dot-path → provenance

  // ---- Preferences ----
  preferences: {
    jobTypes:        [employmentTypeEnum],
    workModes:       [workModeEnum],
    preferredLocations: [String],
    expectedSalary:  salaryRangeSchema,
    currentSalary:   { amount, currency, period, isConfidential: Boolean },
    noticePeriodDays: Number,
    availability:    Enum['IMMEDIATE','WITHIN_15_DAYS','WITHIN_30_DAYS','WITHIN_60_DAYS','NOT_LOOKING'],
    willingToRelocate: Boolean
  },
  openToWork:       Boolean,     // ★ controls employer-search discoverability
  profileVisibility: Enum['PUBLIC','EMPLOYERS_ONLY','PRIVATE'],  default EMPLOYERS_ONLY

  // ---- Derived ----
  profileCompleteness: Number,   // 0-100, recomputed on save
  searchKeywords: [String],      // denormalised for the text index
  stats: { profileViews, applicationsSent, shortlistedCount },
  deletedAt: Date
}
```

**Embedded sub-schemas**

| Schema | Fields |
|---|---|
| `experienceSchema` | `title, company, employmentType, location, workMode, startDate, endDate, isCurrent, description, skills[], source` |
| `educationSchema` | `degree, fieldOfStudy, institution, startYear, endYear, grade, description, source` |
| `projectSchema` | `name, description, techStack[], url, repoUrl, startDate, endDate, source` |
| `certificationSchema` | `name, issuer, issueDate, expiryDate, credentialId, credentialUrl, source` |

**Validation rule:** `isCurrent === true` ⇒ `endDate` must be null; `endDate` must be ≥ `startDate`.
Enforced at the schema level so bad data cannot enter via any path.

---

## 4. Collection: `employerProfiles`

1:1 with an `EMPLOYER` user (`owner`). Carries the **first verification gate**.

```js
{
  owner: ObjectId,             // ref User, unique
  members: [{ user: ObjectId, role: Enum['OWNER','RECRUITER'], addedAt }],  // v2-ready

  companyName: String,         // required, 2-100
  slug:        String,         // unique, generated, used in /companies/:slug
  logo:        documentSchema,
  coverImage:  documentSchema,
  tagline:     String,
  description: String,         // max 5000
  industry:    String,         // from a controlled list
  foundedYear: Number,         // 1800..currentYear
  companySize: Enum['1-10','11-50','51-200','201-500','501-1000','1001-5000','5000+'],
  website:     String,         // URL validated
  linkedin:    String,         // must match linkedin.com/company/*
  address:     addressSchema,
  contact: {
    email:    String,          // company domain email
    phone:    String,
    hrName:   String
  },

  // ---- ★ VERIFICATION GATE 1 ----
  verificationStatus: Enum['UNSUBMITTED','PENDING','VERIFIED','REJECTED'],  default UNSUBMITTED,
  verification: {
    submittedAt, reviewedAt,
    reviewedBy:      ObjectId,   // ref User(ADMIN)
    rejectionReason: String,
    rejectionCategory: Enum['INVALID_DOCS','DOMAIN_MISMATCH','SUSPECTED_FRAUD',
                            'INCOMPLETE','DUPLICATE','OTHER'],
    attemptCount:    Number,     // resubmissions
    checks: {                    // admin checklist snapshot
      companyNameMatches:  Boolean,
      websiteLive:         Boolean,
      emailDomainMatches:  Boolean,   // contact.email domain === website domain
      linkedinValid:       Boolean,
      documentsValid:      Boolean,
      identityValid:       Boolean,
      gstValid:            Boolean    // optional
    }
  },
  gstNumber: String,           // optional, GSTIN regex
  documents: [{
    type: Enum['INCORPORATION','GST','PAN','IDENTITY','ADDRESS_PROOF','OTHER'],
    publicId, url, originalName, sizeBytes, uploadedAt
  }],

  status: Enum['ACTIVE','SUSPENDED','DELETED'],  default ACTIVE,
  suspension: { reason, by, at },

  stats: { totalJobsPosted, activeJobs, totalApplications, totalHires },
  deletedAt: Date
}
```

**Invariant enforced in `verification.service.js`:** transitioning to `VERIFIED` requires
`documents.length > 0` and all mandatory `checks` true. Transitioning to `REJECTED` requires a
non-empty `rejectionReason` — the brief says *"Employer receives rejection reason"*, so the
schema makes a reason-less rejection impossible.

---

## 5. Collection: `jobs`

Carries the **second verification gate**.

```js
{
  employer:    ObjectId,        // ref EmployerProfile, indexed
  postedBy:    ObjectId,        // ref User
  title:       String,          // required, 3-120, indexed (text)
  slug:        String,          // unique: "senior-react-developer-acme-a1b2c3"

  // ---- denormalised employer snapshot (read-path optimisation) ----
  companySnapshot: { name, logo, slug, industry, companySize, isVerified },

  description:      String,     // required, 50-10000, sanitised HTML
  responsibilities: [String],
  requirements:     [String],
  niceToHave:       [String],
  benefits:         [String],

  skillsRequired: [{ skill: ObjectId, name: String, isMandatory: Boolean }],
  experience: { minMonths: Number, maxMonths: Number },       // canonical MONTHS
  education:  { level: Enum['ANY','HIGH_SCHOOL','DIPLOMA','BACHELORS','MASTERS','PHD'], fields:[String] },

  employmentType: Enum['FULL_TIME','PART_TIME','CONTRACT','INTERNSHIP','FREELANCE'],
  workMode:       Enum['REMOTE','HYBRID','ONSITE'],
  location: { city, state, country, isRemoteAnywhere: Boolean },
  salary: { min, max, currency, period:'YEARLY'|'MONTHLY'|'HOURLY', isDisclosed: Boolean },
  openings:  Number,            // ≥1
  deadline:  Date,              // must be future at submit time
  industry:  String,
  department: String,

  // ---- ★ VERIFICATION GATE 2 ----
  status: Enum['DRAFT','PENDING','APPROVED','REJECTED','ARCHIVED'],  default DRAFT,
  moderation: {
    submittedAt, reviewedAt,
    reviewedBy:        ObjectId,
    rejectionReason:   String,
    rejectionCategory: Enum['MISLEADING','INCOMPLETE','DUPLICATE','SPAM',
                            'POLICY_VIOLATION','SALARY_UNREALISTIC','OTHER'],
    revisionCount:     Number,
    previousStatus:    String
  },

  // ---- ★ THE COMPUTED VISIBILITY FLAG (ADR / §7 of doc 01) ----
  isPubliclyVisible: Boolean,   // default false — maintained by service + cron
  publishedAt: Date,
  archivedAt:  Date,

  stats: { views, uniqueViews, applications, shortlisted, saves },
  searchText: String,           // concatenated title+skills+company for the text index
  deletedAt: Date
}
```

### `isPubliclyVisible` maintenance

| Trigger | Action |
|---|---|
| Admin approves job | `true` if employer VERIFIED+ACTIVE and deadline future |
| Admin rejects / employer archives | `false` |
| Admin verifies employer | bulk `true` for that employer's APPROVED, in-deadline jobs |
| Admin suspends/rejects employer | bulk `false` for all their jobs |
| `expireJobs` cron (hourly) | `false` + `ARCHIVED` where `deadline < now` |
| `reconcileVisibility` cron (nightly) | recomputes from source of truth, logs any drift |

The denormalised flag exists purely so the public list query is a **single indexed collection
scan with no `$lookup`** — that is what buys the < 300 ms p95 target.

---

## 6. Collection: `applications`

```js
{
  job:       ObjectId,   // ref Job
  candidate: ObjectId,   // ref CandidateProfile
  employer:  ObjectId,   // ref EmployerProfile  (denormalised for employer-side queries)
  applicant: ObjectId,   // ref User

  jobSnapshot:       { title, companyName, location, employmentType },  // survives job edits
  candidateSnapshot: { name, headline, totalExperienceMonths, currentCompany },

  resume: { publicId, url, originalName, version },   // ★ frozen copy at apply time
  coverLetter: String,          // max 3000
  answers: [{ question, answer }],   // screening questions (v2-ready)
  expectedSalary: salaryRangeSchema,
  noticePeriodDays: Number,

  status: Enum['APPLIED','VIEWED','SHORTLISTED','INTERVIEW','REJECTED','HIRED'],  default APPLIED,

  timeline: [{                  // ★ embedded, append-only
    status:    String,
    changedBy: ObjectId,
    changedByRole: Enum['CANDIDATE','EMPLOYER','ADMIN','SYSTEM'],
    note:      String,
    metadata:  Mixed,           // interview: {scheduledAt, mode, link, round}
    at:        Date
  }],

  interview: { scheduledAt, mode:Enum['ONLINE','ONSITE','PHONE'], location, meetingLink, round, notes },
  rejection: { reason, category, at, isVisibleToCandidate: Boolean },

  employerNotes: String,        // ★ NEVER returned by candidate-facing DTOs
  rating: Number,               // 1-5, employer-private
  isBookmarked: Boolean,
  viewedAt: Date,
  withdrawnAt: Date,
  deletedAt: Date
}
```

**Unique compound index `{ job:1, applicant:1 }`** — the database, not application code, is what
guarantees "one application per job per candidate". Duplicate insert → Mongo `E11000` →
mapped to `409 ALREADY_APPLIED` by the error handler.

### Status machine (enforced in `application.service.js`)

```
APPLIED ──► VIEWED ──► SHORTLISTED ──► INTERVIEW ──► HIRED
   │           │            │              │
   └───────────┴────────────┴──────────────┴──► REJECTED
Candidate may WITHDRAW from any non-terminal state.
Backward transitions are rejected with 409 INVALID_STATUS_TRANSITION.
```
Transitions are declared as a `TRANSITIONS` map, not `if/else` chains — adding a stage is a
one-line change.

---

## 7. Remaining Collections

### `skills` — normalised taxonomy
`{ name (unique), slug, category, aliases[], usageCount, isApproved, createdBy }`
Powers autocomplete, canonicalisation (`ReactJS`/`React.js` → `React`), and faceted counts.
Seeded with ~500 entries; new candidate-entered skills land as `isApproved:false` for admin curation.

### `notifications`
`{ recipient, type (17 enum values), title, message, link, entityType, entityId, isRead, readAt, priority, channels:{inApp,email}, emailSentAt, expiresAt }`
Index `{ recipient:1, isRead:1, createdAt:-1 }`. TTL index on `expiresAt` (90 days).

### `bookmarks` — polymorphic (merges "Bookmarks" + "Saved Jobs")
`{ user, entityType: 'JOB'|'CANDIDATE', job?, candidate?, folder, note, createdAt }`
Unique `{ user:1, entityType:1, job:1, candidate:1 }`.
Candidate saving a job and an employer bookmarking a candidate are the same operation with a
different `entityType` — one repository, one hook, one UI component.

### `verificationRequests` — the audit trail of gate 1
`{ employer, submittedBy, submissionNumber, snapshot (full company data at submit time), documents[], status, reviewedBy, reviewedAt, decision, reason, category, adminChecklist, adminNotes }`
Kept **separate from** `employerProfiles` so every resubmission is a durable, immutable record.
An admin can see attempt #1 was rejected for a domain mismatch and attempt #2 changed the website.

### `reports` — abuse/fraud reports
`{ reporter, entityType:'JOB'|'EMPLOYER'|'CANDIDATE', entityId, reason (enum), description, evidence[], status:'OPEN'|'UNDER_REVIEW'|'RESOLVED'|'DISMISSED', resolvedBy, resolution, actionTaken }`

### `auditLogs` — immutable
`{ actor, actorRole, action (enum ~40), entityType, entityId, before, after, diff, reason, ip, userAgent, requestId, at }`
**No update or delete methods are exposed on this model at all.** Index `{ entityType:1, entityId:1, at:-1 }` and `{ actor:1, at:-1 }`.

### `refreshTokens` — sessions
`{ user, tokenHash (sha256, unique), family (uuid), expiresAt, revokedAt, revokedReason, replacedBy, ip, userAgent, device }`
TTL index on `expiresAt`. Family-wide revoke implements ADR-004 reuse detection.

### `verificationTokens` — email verify + password reset
`{ user, tokenHash, type:'EMAIL_VERIFY'|'PASSWORD_RESET', expiresAt, usedAt, ip }`
Raw token is emailed, only the hash is stored — a DB leak cannot be replayed. TTL: 24 h / 1 h.

### `contactMessages`
`{ name, email, subject, message, status:'NEW'|'READ'|'REPLIED', ip, repliedBy, repliedAt }`

---

## 8. Index Strategy

Indexes are designed **from the query patterns**, not guessed.

| Collection | Index | Serves |
|---|---|---|
| `users` | `{ email:1 }` unique | login, signup dup-check |
| | `{ role:1, status:1, createdAt:-1 }` | admin user management |
| `candidateProfiles` | `{ user:1 }` unique | profile fetch |
| | `{ openToWork:1, 'preferences.availability':1, totalExperienceMonths:1 }` | employer candidate search |
| | `{ 'skills.name':1 }` | skill filter |
| | `{ 'location.city':1, openToWork:1 }` | location + open-to-work |
| | **text**: `headline`, `bio`, `searchKeywords`, `currentDesignation` (weights 10/2/5/8) | keyword search |
| `employerProfiles` | `{ owner:1 }` unique · `{ slug:1 }` unique | |
| | `{ verificationStatus:1, createdAt:-1 }` | **admin verification queue** |
| | `{ verificationStatus:1, status:1 }` | public company directory |
| `jobs` | `{ isPubliclyVisible:1, publishedAt:-1 }` | ★ public job list (primary) |
| | `{ isPubliclyVisible:1, workMode:1, employmentType:1, publishedAt:-1 }` | filtered browse |
| | `{ isPubliclyVisible:1, 'location.city':1, publishedAt:-1 }` | location browse |
| | `{ isPubliclyVisible:1, 'salary.max':-1 }` | sort by salary |
| | `{ isPubliclyVisible:1, 'skillsRequired.name':1 }` | skill filter |
| | `{ status:1, 'moderation.submittedAt':1 }` | ★ **admin job approval queue** |
| | `{ employer:1, status:1, createdAt:-1 }` | employer's own job list |
| | `{ slug:1 }` unique · `{ deadline:1 }` (cron) | |
| | **text**: `title`(10), `searchText`(5), `description`(1) | keyword search |
| `applications` | `{ job:1, applicant:1 }` **unique** | dedupe guarantee |
| | `{ employer:1, status:1, createdAt:-1 }` | employer applicant board |
| | `{ candidate:1, createdAt:-1 }` | candidate application tracker |
| | `{ job:1, status:1 }` | per-job funnel counts |
| `notifications` | `{ recipient:1, isRead:1, createdAt:-1 }` · TTL `expiresAt` | tray + badge |
| `bookmarks` | `{ user:1, entityType:1, createdAt:-1 }` · unique compound | |
| `refreshTokens` | `{ tokenHash:1 }` unique · `{ family:1 }` · TTL `expiresAt` | rotation + reuse detect |
| `auditLogs` | `{ entityType:1, entityId:1, at:-1 }` · `{ actor:1, at:-1 }` | audit explorer |
| `skills` | `{ slug:1 }` unique · `{ name:'text', aliases:'text' }` | autocomplete |

> **Rule adopted:** every compound index for the public job list **leads with
> `isPubliclyVisible`**, because that predicate is present in 100% of public queries and is the
> most selective early filter. This is the difference between a covered index scan and a COLLSCAN
> at 100k documents.

---

## 9. Data Integrity Rules

| # | Rule | Enforced by |
|---|---|---|
| 1 | One application per (job, candidate) | unique compound index |
| 2 | A job cannot be `APPROVED` if its employer is not `VERIFIED` | service guard + nightly reconcile cron |
| 3 | A rejection (job or employer) must carry a reason | schema `required: function(){ return this.status==='REJECTED' }` |
| 4 | `role` never changes after creation | `immutable: true` on the path |
| 5 | Deadline must be in the future when submitting for review | validator + service |
| 6 | `salary.min ≤ salary.max`, `experience.min ≤ experience.max` | schema `validate` |
| 7 | Application status transitions follow the state machine | `TRANSITIONS` map in service |
| 8 | `USER`-sourced profile fields survive re-parsing | `fieldSources` map check in merge |
| 9 | Applying to a job requires that job to be publicly visible **at apply time** | service pre-check inside the transaction |
| 10 | Deleting an employer cascades to soft-deleting their jobs | service + transaction |

### Transactional operations (`withTransaction`)
1. **Apply to job** — insert application + increment `job.stats.applications` + notify.
2. **Approve employer** — update profile + close verification request + bulk-flip job visibility + notify.
3. **Approve/reject job** — update job + moderation record + visibility flag + audit + notify.
4. **Suspend employer** — profile + all jobs invisible + audit + notify.
5. **Delete account** — soft-delete user + profile + revoke all tokens + anonymise applications.

---

## 10. Seed Data

| Seeder | Content |
|---|---|
| `admin.seeder.js` | First admin from `ADMIN_SEED_EMAIL`/`_PASSWORD`; idempotent |
| `skills.seeder.js` | ~500 canonical skills with aliases and categories |
| `demoData.seeder.js` | Dev only: 3 employers (verified / pending / rejected), 25 jobs across all statuses, 20 candidates, 60 applications spanning every stage — so every UI state is reachable without manual clicking |
