# 04 — API Specification

Base URL: `/api/v1` · 118 endpoints · OpenAPI 3 served at `/api/docs` (dev + staging only).

**Legend** — 🌐 public · 🔐 authenticated · 👤 candidate · 🏢 employer · ✅ verified employer only
· 🛡️ admin

---

## 1. Response Envelope (every single response)

**Success**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Jobs fetched successfully",
  "data": { },
  "meta": { "requestId": "b1f2…", "timestamp": "2026-07-31T10:00:00.000Z" }
}
```

**Paginated**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Jobs fetched successfully",
  "data": [ ],
  "pagination": {
    "page": 1, "limit": 20, "totalItems": 243, "totalPages": 13,
    "hasNextPage": true, "hasPrevPage": false, "nextCursor": "eyJ…"
  },
  "meta": { "requestId": "…", "timestamp": "…" }
}
```

**Error**
```json
{
  "success": false,
  "statusCode": 422,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      { "field": "email",    "message": "Must be a valid email address" },
      { "field": "password", "message": "Must be at least 8 characters" }
    ]
  },
  "meta": { "requestId": "…", "timestamp": "…" }
}
```
`error.stack` is included **only** when `NODE_ENV !== 'production'`.

### Error codes (`shared/constants/errorCodes.js`)

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request |
| 401 | `INVALID_CREDENTIALS` / `TOKEN_EXPIRED` / `TOKEN_INVALID` / `SESSION_REVOKED` | Auth |
| 403 | `FORBIDDEN` | Role lacks permission |
| 403 | `EMAIL_NOT_VERIFIED` | Must verify email first |
| 403 | **`EMPLOYER_NOT_VERIFIED`** | ★ The USP gate — company awaiting admin approval |
| 403 | `ACCOUNT_SUSPENDED` | |
| 404 | `NOT_FOUND` | |
| 409 | `EMAIL_ALREADY_EXISTS` / `ALREADY_APPLIED` / `INVALID_STATUS_TRANSITION` / `DUPLICATE_SUBMISSION` | Conflict |
| 413 | `FILE_TOO_LARGE` | > 5 MB |
| 415 | `UNSUPPORTED_FILE_TYPE` | Not pdf/doc/docx |
| 422 | `VALIDATION_ERROR` | Field-level failures |
| 429 | `TOO_MANY_REQUESTS` | Rate limited (`Retry-After` header set) |
| 500 | `INTERNAL_ERROR` | Never leaks internals in prod |

### Universal query contract (all list endpoints)
`?page=1&limit=20&sort=-createdAt&search=&fields=title,slug` — `limit` capped at 50,
`sort` whitelisted per resource, `fields` drives projection.

---

## 2. Auth — `/auth` (13)

| M | Endpoint | Access | Notes |
|---|---|---|---|
| POST | `/auth/register` | 🌐 | `{firstName,lastName,email,password,role}` — role ∈ {CANDIDATE, EMPLOYER}; **ADMIN rejected**. Creates empty profile, sends verify email. Rate: 5/hr/IP |
| POST | `/auth/login` | 🌐 | Returns access token + sets refresh cookie. Rate: 5/15min/IP+email; lockout after 5 fails |
| POST | `/auth/refresh` | 🌐+cookie | Rotates. Reuse ⇒ family revoke + 401 |
| POST | `/auth/logout` | 🔐 | Revokes current refresh token, clears cookie |
| POST | `/auth/logout-all` | 🔐 | Revokes every session for the user |
| GET | `/auth/me` | 🔐 | User + role-specific profile summary + verification status |
| POST | `/auth/verify-email` | 🌐 | `{token}` |
| POST | `/auth/resend-verification` | 🌐 | Rate: 3/hr. Always 200 (no enumeration) |
| POST | `/auth/forgot-password` | 🌐 | Always 200 regardless of existence. Rate: 3/hr |
| POST | `/auth/reset-password` | 🌐 | `{token,password}` → revokes all sessions, notifies |
| PATCH | `/auth/change-password` | 🔐 | Requires current password; revokes other sessions |
| GET | `/auth/sessions` | 🔐 | Active devices |
| DELETE | `/auth/sessions/:id` | 🔐 | Revoke one device |

---

## 3. Public — `/public` (11) — **no auth, only gate-passing data**

| M | Endpoint | Notes |
|---|---|---|
| GET | `/public/jobs` | ★ Applies `buildPublicJobFilter()`. Filters: `q, skills, location, workMode, employmentType, minSalary, maxSalary, minExp, maxExp, industry, company, education, postedWithin`. Sort: `newest, oldest, salary_high, relevance`. Cached 60 s |
| GET | `/public/jobs/:slug` | 404 (not 403) if the job fails either gate — **we never reveal that a hidden job exists** |
| GET | `/public/jobs/:slug/similar` | 6 related, same filter applied |
| GET | `/public/jobs/filters` | Facet counts for the sidebar (aggregation) |
| GET | `/public/companies` | Only `VERIFIED` + `ACTIVE` |
| GET | `/public/companies/:slug` | Company + its publicly visible jobs |
| GET | `/public/skills/suggest?q=` | Autocomplete from taxonomy |
| GET | `/public/locations/suggest?q=` | |
| GET | `/public/stats` | Landing-page counters: verified companies, live jobs, candidates |
| POST | `/public/contact` | Rate: 3/hr/IP + honeypot field |
| POST | `/public/reports` | Report a job/company; optional auth |

---

## 4. Candidate — `/candidates` (22) 👤

### Profile
| M | Endpoint | Notes |
|---|---|---|
| GET | `/candidates/me` | Full self projection |
| PATCH | `/candidates/me` | Partial update; sets `fieldSources[path]='USER'` on every touched path |
| PATCH | `/candidates/me/preferences` | Job prefs, salary, notice period, availability |
| PATCH | `/candidates/me/open-to-work` | `{openToWork:boolean}` |
| PATCH | `/candidates/me/visibility` | PUBLIC / EMPLOYERS_ONLY / PRIVATE |
| POST | `/candidates/me/avatar` | multipart, ≤2 MB image |
| DELETE | `/candidates/me/avatar` | |
| GET | `/candidates/me/completeness` | Score + prioritised missing-field list |

### Resume & parsing ★
| M | Endpoint | Notes |
|---|---|---|
| POST | `/candidates/me/resume` | multipart ≤5 MB pdf/doc/docx → **202** `{parseStatus:'PARSING'}` |
| GET | `/candidates/me/resume` | Signed short-lived URL (self) |
| GET | `/candidates/me/resume/status` | Poll target for the parsing UI |
| GET | `/candidates/me/parsed-draft` | The extracted draft + per-field confidence |
| POST | `/candidates/me/parsed-draft/apply` | `{fields:['headline','skills','experience']}` — **explicit opt-in per field** |
| DELETE | `/candidates/me/parsed-draft` | Discard entirely |
| POST | `/candidates/me/resume/reparse` | Re-run without re-uploading |
| DELETE | `/candidates/me/resume` | |

### Sub-resources (CRUD each)
| M | Endpoint |
|---|---|
| POST / PATCH / DELETE | `/candidates/me/experience[/:itemId]` |
| POST / PATCH / DELETE | `/candidates/me/education[/:itemId]` |
| POST / PATCH / DELETE | `/candidates/me/projects[/:itemId]` |
| POST / PATCH / DELETE | `/candidates/me/certifications[/:itemId]` |
| PUT | `/candidates/me/skills` (replace whole set) |

### Discovery
| M | Endpoint | Notes |
|---|---|---|
| GET | `/candidates/me/dashboard` | Counters, recent applications, recommended jobs |
| GET | `/candidates/me/recommendations` | Skill-overlap + preference scoring |
| GET | `/candidates/:id` | 🏢/🛡️ — employer view. Requires the candidate applied to them **or** `openToWork && visibility!==PRIVATE`. Contact details masked until shortlisted |
| GET | `/candidates/:id/resume` | 🏢/🛡️ — RBAC-checked signed URL, **audit-logged** |

---

## 5. Employer — `/employers` (16) 🏢

| M | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/employers/me` | 🏢 | Company + verification status + rejection reason |
| PATCH | `/employers/me` | 🏢 | Editing verified core fields (name/website) resets to `PENDING` — and the response says so |
| POST | `/employers/me/logo` | 🏢 | |
| POST | `/employers/me/cover` | 🏢 | |
| POST | `/employers/me/documents` | 🏢 | multipart, up to 5 files |
| DELETE | `/employers/me/documents/:docId` | 🏢 | Blocked while `PENDING` |
| POST | `/employers/me/verification` | 🏢 | ★ Submit for review → `PENDING`. Requires all mandatory fields + ≥1 doc |
| GET | `/employers/me/verification` | 🏢 | Current + full submission history |
| GET | `/employers/me/dashboard` | ✅ | KPIs, funnel, recent applicants |
| GET | `/employers/me/jobs` | 🏢 | All statuses (own jobs visible even when hidden publicly) |
| GET | `/employers/me/applications` | ✅ | Across all jobs; filter by status/job/date |
| GET | `/employers/me/analytics` | ✅ | Views→applications→hires funnel over time |
| GET | `/employers/candidates/search` | ✅ | ★ Candidate database search |
| GET | `/employers/me/bookmarks` | ✅ | Bookmarked candidates |
| GET | `/employers/:slug` | 🌐 | Public company profile (verified only) |
| DELETE | `/employers/me` | 🏢 | Soft delete + cascade |

> **The gate in practice:** every ✅ route sits behind `requireVerifiedEmployer`. An unverified
> employer hitting them gets `403 EMPLOYER_NOT_VERIFIED` with
> `{ verificationStatus, rejectionReason, canResubmit }` in `error.details` — enough for the UI to
> render the right empty state without a second round-trip.

---

## 6. Jobs — `/jobs` (13)

| M | Endpoint | Access | Notes |
|---|---|---|---|
| POST | `/jobs` | ✅ | Create as `DRAFT` |
| GET | `/jobs/:id` | 🔐 | Owner / admin view (any status) |
| PATCH | `/jobs/:id` | ✅ | Editing an `APPROVED` job's material fields (title, description, salary, skills) → back to `PENDING`. Cosmetic edits don't. The field list is explicit and documented |
| POST | `/jobs/:id/submit` | ✅ | `DRAFT`/`REJECTED` → `PENDING` |
| POST | `/jobs/:id/archive` | ✅ | → `ARCHIVED`, invisible |
| POST | `/jobs/:id/reopen` | ✅ | → `PENDING` (re-review required) |
| POST | `/jobs/:id/clone` | ✅ | Duplicate as `DRAFT` |
| DELETE | `/jobs/:id` | ✅ | Soft delete |
| GET | `/jobs/:id/applications` | ✅ | Applicants for one job + funnel counts |
| GET | `/jobs/:id/stats` | ✅ | Views, applications, conversion |
| POST | `/jobs/:id/view` | 🌐 | Fire-and-forget view counter (debounced client-side) |
| GET | `/jobs/meta/form-options` | ✅ | Enums for the job form |
| POST | `/jobs/:id/report` | 🌐 | |

---

## 7. Applications — `/applications` (11)

| M | Endpoint | Access | Notes |
|---|---|---|---|
| POST | `/applications` | 👤 | `{jobId, coverLetter, expectedSalary, noticePeriodDays}`. Transactional. 409 on duplicate. Requires a resume on file |
| GET | `/applications/me` | 👤 | Candidate tracker; filter by status |
| GET | `/applications/:id` | 👤🏢 | Candidate view hides `employerNotes`/`rating` |
| GET | `/applications/:id/timeline` | 👤🏢 | ★ Ordered event history |
| POST | `/applications/:id/withdraw` | 👤 | Non-terminal states only |
| PATCH | `/applications/:id/status` | ✅ | `{status, note, rejectionReason?}` — validated against the state machine |
| POST | `/applications/:id/view` | ✅ | `APPLIED` → `VIEWED` (idempotent) |
| POST | `/applications/:id/shortlist` | ✅ | Convenience wrapper |
| POST | `/applications/:id/reject` | ✅ | Reason required |
| POST | `/applications/:id/interview` | ✅ | `{scheduledAt, mode, link, round, notes}` → `INTERVIEW` + notification |
| PATCH | `/applications/:id/notes` | ✅ | Employer-private notes + rating |
| PATCH | `/applications/bulk/status` | ✅ | Up to 50 ids, one transaction |

---

## 8. Search — `/search` (4)

| M | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/search/jobs` | 🌐 | Full filter set + `sort=relevance` (text score) |
| GET | `/search/candidates` | ✅ | `q, skills[], minExp, maxExp, location, maxSalary, maxNoticePeriod, availability, openToWork, education, remotePreference` |
| GET | `/search/companies` | 🌐 | |
| GET | `/search/suggestions?q=` | 🌐 | Typeahead across jobs/skills/companies |

---

## 9. Bookmarks — `/bookmarks` (5)

| M | Endpoint | Access |
|---|---|---|
| GET | `/bookmarks?entityType=JOB\|CANDIDATE` | 🔐 |
| POST | `/bookmarks` | 🔐 (candidate→JOB, employer→CANDIDATE) |
| DELETE | `/bookmarks/:id` | 🔐 |
| DELETE | `/bookmarks/entity/:entityType/:entityId` | 🔐 (un-save by target) |
| GET | `/bookmarks/check?entityType=&entityId=` | 🔐 (card render state) |

---

## 10. Notifications — `/notifications` (6)

| M | Endpoint |
|---|---|
| GET | `/notifications?isRead=&type=` |
| GET | `/notifications/unread-count` (badge; polled 60 s) |
| PATCH | `/notifications/:id/read` |
| PATCH | `/notifications/read-all` |
| DELETE | `/notifications/:id` |
| DELETE | `/notifications/clear-read` |

---

## 11. Admin — `/admin` (28) 🛡️

### Dashboard & analytics
| M | Endpoint | Notes |
|---|---|---|
| GET | `/admin/dashboard` | All KPI counters in one aggregation |
| GET | `/admin/analytics/overview?range=30d` | |
| GET | `/admin/analytics/users?groupBy=day` | Signups over time by role |
| GET | `/admin/analytics/jobs` | By status / industry / work mode |
| GET | `/admin/analytics/applications` | Funnel + conversion |
| GET | `/admin/analytics/employers` | Verification throughput, avg review time |
| GET | `/admin/activity` | Recent activity feed from audit logs |

### ★ Employer verification queue
| M | Endpoint | Notes |
|---|---|---|
| GET | `/admin/employers?status=PENDING&sort=oldest` | The queue |
| GET | `/admin/employers/:id` | Full profile + docs + submission history |
| GET | `/admin/employers/:id/documents/:docId` | Signed URL, audit-logged |
| POST | `/admin/employers/:id/verify` | `{checklist, note}` → `VERIFIED`, **flips all their approved jobs public**, notifies |
| POST | `/admin/employers/:id/reject` | `{reason, category}` — reason mandatory |
| POST | `/admin/employers/:id/suspend` | `{reason}` → hides every job immediately |
| POST | `/admin/employers/:id/restore` | |
| DELETE | `/admin/employers/:id` | Soft delete + cascade |
| GET | `/admin/verification-requests` | Full history across employers |

### ★ Job approval queue
| M | Endpoint | Notes |
|---|---|---|
| GET | `/admin/jobs?status=PENDING&sort=oldest` | The queue |
| GET | `/admin/jobs/:id` | Job + employer verification context + **diff vs last approved version** |
| POST | `/admin/jobs/:id/approve` | → `APPROVED` + `isPubliclyVisible` computed + notify |
| POST | `/admin/jobs/:id/reject` | `{reason, category}` mandatory |
| POST | `/admin/jobs/bulk/approve` | ≤50 ids |
| DELETE | `/admin/jobs/:id` | |

### Users & moderation
| M | Endpoint |
|---|---|
| GET | `/admin/users?role=&status=&q=` |
| GET | `/admin/users/:id` |
| POST | `/admin/users/:id/suspend` · `/restore` |
| DELETE | `/admin/users/:id` |
| POST | `/admin/users/:id/promote` (→ ADMIN, audit-logged) |
| GET | `/admin/reports?status=OPEN` · `GET /admin/reports/:id` · `POST /admin/reports/:id/resolve` |
| GET | `/admin/audit-logs?actor=&entityType=&from=&to=` |
| GET | `/admin/skills` · `POST /admin/skills` · `PATCH /admin/skills/:id` · `POST /admin/skills/:id/approve` · `POST /admin/skills/merge` |
| GET | `/admin/contact-messages` · `PATCH /admin/contact-messages/:id` |

---

## 12. Upload & Health (5)

| M | Endpoint | Access |
|---|---|---|
| POST | `/uploads/image` | 🔐 (generic image, ≤2 MB) |
| POST | `/uploads/document` | 🔐 (≤5 MB) |
| DELETE | `/uploads/:publicId` | 🔐 owner |
| GET | `/health` | 🌐 liveness |
| GET | `/health/ready` | 🌐 Mongo + Redis ping |

---

## 13. Rate Limit Policy

| Scope | Window | Max | Key |
|---|---|---|---|
| Global (anonymous) | 15 min | 100 | IP |
| Global (authenticated) | 15 min | 300 | userId |
| `/auth/login` | 15 min | 5 | IP + email |
| `/auth/register` | 1 hr | 5 | IP |
| `/auth/forgot-password`, `/resend-verification` | 1 hr | 3 | IP + email |
| `POST /applications` | 1 hr | 30 | userId |
| `POST /jobs` | 1 hr | 20 | employerId |
| Upload endpoints | 1 hr | 20 | userId |
| `/public/contact` | 1 hr | 3 | IP |
| `/search/*` | 1 min | 30 | IP |

429 responses include `Retry-After` and `RateLimit-*` headers.
