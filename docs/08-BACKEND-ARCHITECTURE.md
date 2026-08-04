# 08 — Backend Architecture

---

## 1. Layered Design (ADR-003)

```
HTTP ─► Route ─► RateLimit ─► Auth ─► RBAC ─► Gate ─► Validator ─► Controller
                                                                       │
                                                                       ▼
                                                                    Service ──► EventBus ──► Subscribers
                                                                       │                     (notify · email · audit)
                                                                       ▼
                                                                  Repository
                                                                       │
                                                                       ▼
                                                             Mongoose Model ──► MongoDB
```

### Layer contracts (enforced by ESLint `no-restricted-imports`)

| Layer | May import | May **never** | Responsibility |
|---|---|---|---|
| Route | middleware, validator, controller | service, model | Wiring only |
| Validator | express-validator, shared limits | model, service | Shape + type + bounds |
| Controller | service, DTO, ApiResponse | **model**, repository | `req` → DTO → service → respond. ~8 lines |
| Service | repository, other services, EventBus, errors | `req`/`res`, model | Business rules, orchestration, transactions |
| Repository | model, query helpers | service, controller | **All** query construction |
| Model | mongoose, sub-schemas, plugins | anything above | Shape, indexes, hooks, instance methods |

**Why this is worth the ceremony:** a business rule like "an employer can only see applications
for their own jobs" lives in exactly one place and is unit-testable without booting Express or
Mongo. The typical MERN controller-does-everything file makes that rule untestable and quietly
duplicated in six routes.

### Canonical example

```js
// routes/v1/job.routes.js
router.post('/',
  authenticate,
  authorize(ROLES.EMPLOYER),
  requireVerifiedEmployer,            // ★ the USP gate
  validate(jobValidator.create),
  asyncHandler(jobController.create)
);

// controllers/job.controller.js
export const create = async (req, res) => {
  const dto = toCreateJobDto(req.body, req.user);
  const job = await jobService.createJob(dto);
  return ApiResponse.created(res, toJobResponse(job, req.user), MESSAGES.JOB.CREATED);
};

// services/job.service.js
export const createJob = async (dto) => {
  const employer = await employerRepo.findByOwner(dto.ownerId);
  if (!employer) throw new NotFoundError(ERROR_CODES.EMPLOYER_PROFILE_MISSING);
  assertCanPostJobs(employer);                        // pure, unit-tested guard
  const job = await jobRepo.create({
    ...dto,
    employer: employer._id,
    companySnapshot: buildCompanySnapshot(employer),  // denormalise for read path
    status: JOB_STATUS.DRAFT,
    isPubliclyVisible: false,                         // ★ never true on create
    slug: await slugHelper.uniqueJobSlug(dto.title, employer.companyName),
  });
  eventBus.emit(EVENTS.JOB_CREATED, { jobId: job._id, employerId: employer._id });
  return job;
};
```

---

## 2. Response Wrapper

```js
// utils/apiResponse.js
class ApiResponse {
  static send(res, { statusCode = 200, message = 'Success', data = null, pagination = null }) {
    return res.status(statusCode).json({
      success: statusCode < 400, statusCode, message,
      ...(data !== null && { data }),
      ...(pagination && { pagination }),
      meta: { requestId: res.locals.requestId, timestamp: new Date().toISOString() },
    });
  }
  static ok(res, data, message)        { return this.send(res, { statusCode: 200, data, message }); }
  static created(res, data, message)   { return this.send(res, { statusCode: 201, data, message }); }
  static accepted(res, data, message)  { return this.send(res, { statusCode: 202, data, message }); }
  static noContent(res)                { return res.status(204).end(); }
  static paginated(res, { items, page, limit, totalItems }, message) {
    const totalPages = Math.ceil(totalItems / limit) || 1;
    return this.send(res, { statusCode: 200, message, data: items,
      pagination: { page, limit, totalItems, totalPages,
                    hasNextPage: page < totalPages, hasPrevPage: page > 1 } });
  }
}
```
**No controller ever calls `res.json()` directly.** One shape, guaranteed, forever.

---

## 3. Error Handling

```js
// errors/ApiError.js
export class ApiError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;            // machine-readable, from shared/errorCodes
    this.details = details;
    this.isOperational = true;   // distinguishes expected from programmer errors
    Error.captureStackTrace(this, this.constructor);
  }
}
export class ForbiddenError extends ApiError {
  constructor(code = ERROR_CODES.FORBIDDEN, message = MESSAGES.ERROR.FORBIDDEN, details) {
    super(403, code, message, details);
  }
}
```

### Global handler — the single exit point

```js
export const globalErrorHandler = (err, req, res, _next) => {
  let error = err;

  // Normalise third-party errors into our own hierarchy
  if (err.name === 'CastError')       error = new BadRequestError(ERROR_CODES.INVALID_ID);
  if (err.name === 'ValidationError') error = new ValidationError(mapMongooseErrors(err));
  if (err.code === 11000)             error = new ConflictError(...mapDuplicateKey(err));
  if (err.name === 'JsonWebTokenError')  error = new UnauthorizedError(ERROR_CODES.TOKEN_INVALID);
  if (err.name === 'TokenExpiredError')  error = new UnauthorizedError(ERROR_CODES.TOKEN_EXPIRED);
  if (err instanceof multer.MulterError)  error = mapMulterError(err);

  if (!error.isOperational) {
    logger.error('UNHANDLED', { err: error, requestId: req.id, url: req.originalUrl,
                                userId: req.user?.id, stack: error.stack });
    error = new ApiError(500, ERROR_CODES.INTERNAL_ERROR, MESSAGES.ERROR.INTERNAL);
  } else {
    logger.warn(error.code, { requestId: req.id, url: req.originalUrl, userId: req.user?.id });
  }

  return res.status(error.statusCode).json({
    success: false, statusCode: error.statusCode, message: error.message,
    error: { code: error.code, ...(error.details && { details: error.details }),
             ...(!isProd && { stack: error.stack }) },
    meta: { requestId: req.id, timestamp: new Date().toISOString() },
  });
};
```
`E11000` on `{job, applicant}` becomes `409 ALREADY_APPLIED` automatically — the race condition
between two simultaneous Apply clicks is handled by the database and translated here, not by a
check-then-insert in the service (which would still race).

Process-level: `unhandledRejection` and `uncaughtException` are logged then trigger a graceful
shutdown. A crashed process is safer than a corrupted one.

---

## 4. Repository Layer

```js
// repositories/base.repository.js
export class BaseRepository {
  constructor(model) { this.model = model; }
  create(data, opts)            { return this.model.create([data], opts).then(r => r[0]); }
  findById(id, { select, populate, lean = true } = {}) { … }
  findOne(filter, opts)         { … }
  async paginate(filter, { page = 1, limit = 20, sort = '-createdAt', select, populate }) {
    const skip = (page - 1) * limit;
    const [items, totalItems] = await Promise.all([
      this.model.find(filter).select(select).populate(populate)
                .sort(sort).skip(skip).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return { items, page, limit, totalItems };
  }
  updateById(id, update, opts)  { … }
  softDelete(id, deletedBy)     { … }
}
```

`.lean()` is the default on every read path — Mongoose hydration is the single biggest avoidable
cost in a list endpoint. Documents are only hydrated when instance methods or `save()` hooks are
needed.

---

## 5. Search Implementation

```js
// repositories/job.repository.js
export const buildSearchQuery = (c) => {
  const filter = buildPublicJobFilter();                          // ★ always first
  if (c.keyword)          filter.$text = { $search: c.keyword };
  if (c.skills?.length)   filter['skillsRequired.name'] = { $in: c.skills };
  if (c.location)         filter['location.city'] = new RegExp(`^${escapeRegex(c.location)}`, 'i');
  if (c.workMode?.length) filter.workMode = { $in: c.workMode };
  if (c.employmentType?.length) filter.employmentType = { $in: c.employmentType };
  if (c.minSalary)        filter['salary.max'] = { $gte: c.minSalary };
  if (c.maxSalary)        filter['salary.min'] = { $lte: c.maxSalary };
  if (c.minExp != null)   filter['experience.maxMonths'] = { $gte: c.minExp * 12 };
  if (c.maxExp != null)   filter['experience.minMonths'] = { $lte: c.maxExp * 12 };
  if (c.industry)         filter.industry = c.industry;
  if (c.postedWithin)     filter.publishedAt = { $gte: subDays(new Date(), c.postedWithin) };
  return filter;
};

const SORT_MAP = {
  newest:      { publishedAt: -1 },
  oldest:      { publishedAt: 1 },
  salary_high: { 'salary.max': -1, publishedAt: -1 },
  relevance:   { score: { $meta: 'textScore' }, publishedAt: -1 },
};
```

**Overlap semantics for ranges:** a candidate with 4 years should match a "3–6 yrs" job *and* a
"2–5 yrs" job. The inverted comparison above (`job.max >= filter.min` AND `job.min <= filter.max`)
implements true interval overlap — the naive `job.min >= filter.min` version silently hides
matching jobs, and it is one of the most common bugs in job-board search.

Facet counts for the sidebar come from a single `$facet` aggregation so the UI gets all groups in
one round trip.

---

## 6. RBAC Permission Matrix

```js
// constants/permissions.js
export const PERMISSIONS = {
  JOB_CREATE:'job:create', JOB_UPDATE_OWN:'job:update:own', JOB_APPROVE:'job:approve',
  APPLICATION_CREATE:'application:create', APPLICATION_UPDATE_STATUS:'application:update:status',
  CANDIDATE_SEARCH:'candidate:search', RESUME_DOWNLOAD:'resume:download',
  EMPLOYER_VERIFY:'employer:verify', USER_SUSPEND:'user:suspend', AUDIT_READ:'audit:read', …
};
export const ROLE_PERMISSIONS = { [ROLES.CANDIDATE]: [...], [ROLES.EMPLOYER]: [...], [ROLES.ADMIN]: [...] };
```

| Capability | Guest | Candidate | Employer (unverified) | Employer (verified) | Admin |
|---|:--:|:--:|:--:|:--:|:--:|
| Browse approved jobs | ✅ | ✅ | ✅ | ✅ | ✅ |
| View pending/rejected jobs | ✕ | ✕ | own only | own only | ✅ all |
| Apply to a job | ✕ | ✅ | ✕ | ✕ | ✕ |
| Create/edit **draft** job | ✕ | ✕ | ✅ | ✅ | ✕ |
| **Submit job for review** | ✕ | ✕ | **✕** | ✅ | ✕ |
| Search candidate database | ✕ | ✕ | ✕ | ✅ | ✅ |
| Download a resume | ✕ | own | ✕ | ✅ (scoped) | ✅ |
| Change application status | ✕ | withdraw own | ✕ | ✅ own jobs | ✕ |
| Approve job / verify employer | ✕ | ✕ | ✕ | ✕ | ✅ |
| Suspend user, read audit log | ✕ | ✕ | ✕ | ✕ | ✅ |

Two-level authorisation: `authorize(...roles)` for coarse role checks, `can(PERMISSION)` for fine
capability checks, plus `isOwnerOf(resource)` for row-level ownership. Ownership is **always**
re-verified in the service against the DB — never trusted from a request body.

---

## 7. The Two-Gate Visibility Guard

```js
// repositories/job.repository.js  ── THE most important 10 lines in the codebase
export const buildPublicJobFilter = (extra = {}) => ({
  status: JOB_STATUS.APPROVED,
  isPubliclyVisible: true,
  deletedAt: null,
  deadline: { $gte: new Date() },
  ...extra,
});
```

Rules that keep it honest:
1. **Every** public read composes this function. An ESLint rule forbids `Job.find(` outside
   `job.repository.js`.
2. `isPubliclyVisible` is written only by `job.service.js#recomputeVisibility(job, employer)` —
   one function, one place, fully unit-tested against a truth table.
3. `reconcileVisibility.cron.js` runs nightly, recomputes from source data, fixes drift, and
   **logs every correction as a defect signal**. If that cron ever reports a non-zero fix count,
   something upstream is wrong and we want to know.
4. Integration test suite `tests/integration/visibility.test.js` asserts all 12 combinations of
   (job status × employer verification × employer status × deadline) return the correct public
   visibility.

---

## 8. Events & Subscribers

```js
// events/subscribers/notification.subscriber.js
eventBus.on(EVENTS.JOB_APPROVED, async ({ jobId, employerUserId, title, slug }) => {
  await notificationService.create({
    recipient: employerUserId,
    type: NOTIFICATION_TYPES.JOB_APPROVED,
    title: 'Your job is live 🎉',
    message: `"${title}" has been approved and is now visible to candidates.`,
    link: `/jobs/${slug}`, entityType: 'JOB', entityId: jobId,
  });
});
```
Subscribers are `try/catch`-wrapped: a failing email must never roll back an approval. Failures
are logged and, for email, retried by BullMQ with exponential backoff.

**Events:** `user.registered` `user.emailVerified` `password.changed` `employer.submitted`
`employer.verified` `employer.rejected` `employer.suspended` `job.created` `job.submitted`
`job.approved` `job.rejected` `job.expired` `application.created` `application.viewed`
`application.shortlisted` `application.interview` `application.rejected` `application.hired`
`resume.parsed` `report.created` `security.tokenReuse`

---

## 9. Background Jobs & Cron

| Queue | Trigger | Retry |
|---|---|---|
| `resume-parse` | Resume upload | 3× exp. backoff → `parseStatus: FAILED` + notification |
| `email` | Every outbound email | 5× exp. backoff → dead-letter |
| `bulk-notify` | Employer verified (flip N jobs, notify) | 3× |

| Cron | Schedule | Job |
|---|---|---|
| `expireJobs` | hourly | `deadline < now` → `ARCHIVED`, `isPubliclyVisible: false`, notify |
| `jobExpiringSoon` | daily 09:00 | 3-day warning to employers |
| `purgeTokens` | daily 03:00 | Delete expired refresh/verification tokens |
| `reconcileVisibility` | daily 03:30 | ★ Repair visibility drift, log corrections |
| `pendingQueueDigest` | daily 09:00 | Email admins the pending counts and oldest wait time |
| `cleanupSoftDeleted` | weekly | Hard-delete records soft-deleted > 90 days + purge Cloudinary assets |
| `recommendationRefresh` | daily 02:00 | Precompute candidate job matches |

Cron runs **only in the worker process** (guarded by `process.env.ROLE === 'worker'`), so scaling
the API to 4 replicas doesn't run the job four times — a classic and expensive mistake.

---

## 10. Security Implementation

| Threat | Control |
|---|---|
| Password cracking | bcrypt cost 12; complexity rules; 5-attempt lockout with 15-min cooldown |
| Token theft (XSS) | Access token never in localStorage; refresh cookie `httpOnly` |
| CSRF | Refresh cookie `SameSite=Strict`, path-scoped; API auth is a header, not a cookie |
| Token replay | Rotation + family reuse detection + hashed-at-rest storage |
| NoSQL injection | `express-mongo-sanitize` + `ObjectId` validation on every `:id` param |
| XSS (stored) | `sanitize-html` allowlist on all rich text (job descriptions, bios) before persistence |
| Clickjacking / MIME sniff | Helmet: `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, CSP, HSTS |
| Brute force / scraping | Layered rate limits (§13 of doc 04) + `/search` throttle |
| Mass assignment | DTO mappers whitelist fields; Mongoose `strict: true`; `role`/`status` `immutable` |
| Malicious upload | Magic-byte sniffing (not just MIME header), extension allowlist, 5 MB cap, Cloudinary-only storage, no local execution path |
| IDOR | Ownership re-verified server-side on every resource access |
| Enumeration | Login, forgot-password, and resend-verification return identical responses/timings regardless of account existence |
| PII exposure | Response DTOs have explicit public/employer/self/admin projections; phone+email masked pre-shortlist |
| Privilege escalation | `role` immutable; admin promotion is admin-only and audit-logged |
| Secret leakage | `env.js` fail-fast validation; secrets never logged; `.env` gitignored; `passwordHash` has `select:false` |
| Dependency risk | `npm audit` + Dependabot in CI |

---

## 11. Testing Strategy

```
tests/
  unit/          services (mocked repos) · guards · state machine · DTO mappers · utils
  integration/   supertest + mongodb-memory-server, per module
  fixtures/      factories/  setup.js
```

| Layer | Tool | Target |
|---|---|---|
| Unit — services | Jest + mocked repositories | ≥ 85% |
| Unit — repositories | mongodb-memory-server | ≥ 80% |
| Integration — routes | supertest, real middleware chain | All auth + all gate paths |
| E2E (Phase 9) | Playwright | 4 critical journeys |

**Non-negotiable test cases:**
1. Unverified employer → `POST /jobs/:id/submit` → 403.
2. `PENDING` job is absent from `GET /public/jobs` and returns **404** at `/public/jobs/:slug`.
3. Suspending a verified employer removes their approved jobs from public results **in the same request**.
4. Duplicate application → 409, and only one document exists.
5. Refresh-token reuse revokes the whole family.
6. Applying `parsedDraft` does not overwrite a field whose `source === 'USER'`.
7. Candidate DTO never contains `employerNotes` or `rating`.
8. Password change invalidates previously issued access tokens.

---

## 12. Observability

- **Winston**: JSON in prod, colourised in dev; daily rotation; `requestId` on every line, so one
  grep reconstructs an entire request across layers.
- **Morgan** → Winston stream, custom token includes `:id` and response time.
- Slow-query logging: Mongoose `debug` hook logs any op > 200 ms with the collection and filter.
- `/health` (liveness) and `/health/ready` (Mongo + Redis ping) for orchestrators.
- Error taxonomy: `isOperational` separates "user did something invalid" (warn) from "we have a
  bug" (error + alert).
