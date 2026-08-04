# 09 — Development Roadmap

11 phases. Each phase has **exit criteria** — verifiable conditions, not "it feels done".
Phases 0–6 are strictly sequential (each builds on the last); 7–8 can interleave.

---

## Phase 0 — Foundation
**Deliverables**
- Monorepo + npm workspaces; `client/`, `server/`, `shared/` scaffolding
- ESLint (incl. layer-boundary `no-restricted-imports`), Prettier, EditorConfig, `jsconfig.json` with `checkJs`
- `shared/` constants + limits + JSDoc typedefs
- `server`: `app.js`, `server.js`, full middleware chain, `env.js` fail-fast validation, Winston, `ApiError`, `ApiResponse`, `asyncHandler`, global error handler, `/health`
- `client`: Vite + Tailwind + tokens + `ThemeProvider` + dark mode + router shell + store + queryClient + Axios instance
- `docker-compose.yml` (mongo, redis, api, client, worker); `.env.example`
- GitHub Actions: lint → typecheck → test → build

**Exit:** `docker compose up` serves the SPA and `GET /api/v1/health` returns the standard
envelope. Booting with a missing `JWT_ACCESS_SECRET` fails loudly at startup. CI is green.

---

## Phase 1 — Authentication & RBAC
**Deliverables**
- All models: `User`, `RefreshToken`, `VerificationToken` + plugins (softDelete, toJSON, paginate)
- `auth.service`, `token.service` (rotation + family reuse detection), `user.repository`
- 13 auth endpoints
- Middleware: `authenticate`, `optionalAuth`, `authorize`, `can`, `requireVerifiedEmail`, `isOwnerOf`
- Email templates + Nodemailer + email queue
- Client: Login, Signup (role select), VerifyEmail, Forgot/Reset, `authSlice`, persist config, **refresh-queue interceptor**, all route guards, `AppBootstrap`
- Admin seeder

**Exit:** All 8 non-negotiable auth tests in [08 §11](08-BACKEND-ARCHITECTURE.md#11-testing-strategy)
pass. Refresh works across a browser reload with **zero tokens in localStorage** (verify in
DevTools → Application). Role guards redirect correctly.

---

## Phase 2 — Profiles (Candidate + Employer)
**Deliverables**
- `CandidateProfile` + `EmployerProfile` models, all embedded sub-schemas, `Skill` model + seeder (~500)
- Cloudinary config, `upload.service`, magic-byte file validation, avatar/logo endpoints
- Candidate profile CRUD incl. experience/education/projects/certifications sub-resources
- Employer company profile CRUD + document upload
- `profileCompleteness` calculator
- Client: full profile editor, `SkillPicker` with autocomplete, section editor modals, completeness meter, company profile form
- Design system: all 28 `ui/` primitives + Storybook-less usage page

**Exit:** A candidate can build a 100%-complete profile by hand. An employer can complete a
company profile and upload documents. Every `ui/` primitive is used somewhere and works in both
themes.

---

## Phase 3 — ★ The USP: Verification & Approval Gates
> **This is the phase the whole product exists for. Nothing here gets deferred.**

**Deliverables**
- `VerificationRequest` model + `verification.service` with immutable snapshots
- Employer verification submit / resubmit / status endpoints
- `Job` model + `job.service` with the full status machine + `recomputeVisibility()`
- **`buildPublicJobFilter()`** + the ESLint rule forbidding raw `Job.find(` outside its repository
- `requireVerifiedEmployer` middleware
- Admin: employer queue, employer detail + checklist, verify/reject/suspend/restore; job queue, approve/reject/bulk-approve
- `AuditLog` model + `audit.subscriber` on every admin action
- Transactional approve/reject/suspend (with the bulk visibility flip)
- `reconcileVisibility` + `expireJobs` crons
- Client: verification wizard, locked employer dashboard, rejection-reason card, admin queues, document viewer, decision dialogs with blast-radius warnings

**Exit — the gate test suite:**
1. Unverified employer: `POST /jobs/:id/submit` → `403 EMPLOYER_NOT_VERIFIED` ✅
2. `PENDING` job invisible in `/public/jobs`; `/public/jobs/:slug` → **404** ✅
3. Admin verifies employer → their approved in-deadline jobs become public **in the same transaction** ✅
4. Admin suspends employer → all their jobs vanish from public results immediately ✅
5. Deadline passes → hourly cron archives + hides ✅
6. Every admin decision produces an audit entry with before/after ✅
7. Rejection without a reason is rejected at the schema level ✅
8. `reconcileVisibility` reports **0 corrections** on a healthy dataset ✅

---

## Phase 4 — Job Posting & Public Job Board
**Deliverables**
- Job CRUD, submit, archive, reopen, clone; material-vs-cosmetic edit rule
- Public job endpoints + facet aggregation + Redis cache-aside (60 s)
- All job indexes created and verified with `explain()`
- Client: 5-step job form wizard with autosave, employer job table, public browse with URL-synced filters, job detail, company directory, company detail, similar jobs

**Exit:** Public job list p95 < 300 ms at 10k seeded jobs, and `explain()` shows an
`IXSCAN` (not `COLLSCAN`) on every filter combination in the UI. Filters survive a page refresh
and are shareable by URL.

---

## Phase 5 — Applications & Pipeline
**Deliverables**
- `Application` model with the unique compound index + embedded timeline
- Apply flow inside a transaction (with the re-check of public visibility)
- Status machine + all transition endpoints + bulk update + interview scheduling
- Employer applicant board with funnel tabs, filters, drawer, bulk actions
- Candidate application tracker + `StatusTimeline` + withdraw
- Resume access proxy with RBAC + audit logging

**Exit:** Two concurrent apply requests produce exactly one document and one `409`. Backward
status transitions are refused. A candidate response body never contains `employerNotes` or
`rating` (asserted in an integration test).

---

## Phase 6 — Resume Parsing & Autofill
**Deliverables**
- BullMQ setup + `resume-parse` queue + worker process
- `resumeParser.service`: pdf-parse / mammoth → text → deterministic extractors (email, phone,
  URLs, section splitting, date ranges, skills ∩ taxonomy)
- Optional `llmEnrichment.service` behind a provider-agnostic adapter (feature-flagged off)
- `parsedDraft` + `fieldSources` provenance map + the merge rule
- Apply-draft endpoint with per-field opt-in
- Client: uploader with progress, parse-status polling, **`ParsedFieldReview` side-by-side screen**

**Exit:** Upload → 202 → parsed draft appears without blocking the request thread. **Nothing
reaches the live profile without an explicit click.** A field previously edited by hand is shown
with a conflict warning and is unchecked by default. The whole flow works with the LLM disabled.

---

## Phase 7 — Search, Discovery & Notifications
**Deliverables**
- Advanced job search (all filters, 4 sorts, relevance via `textScore`), interval-overlap range logic
- Employer candidate search + privacy rules (masking, `openToWork`, visibility)
- Bookmarks (polymorphic) + saved jobs + saved searches
- Recommendations (skill overlap + preference scoring) + nightly precompute cron
- `Notification` model + 17 event types + `notificationConfig` channel table
- `NotificationBell` + tray + unread polling + optimistic read
- Email subscriber for the email-enabled subset

**Exit:** Every notification in the [05 §9](05-USER-FLOWS.md#9-notification-triggers-17-events)
table fires end-to-end. Candidate search respects `openToWork` and `profileVisibility` — asserted
in tests. Contact details are masked pre-shortlist.

---

## Phase 8 — Admin Analytics & Moderation
**Deliverables**
- `analytics.repository` aggregation pipelines (all six analytics endpoints)
- Admin dashboard: KPI grid, signup chart, status pie, funnel chart, activity feed
- User management (search, filter, suspend, restore, delete, promote)
- `Report` model + abuse queue + resolution workflow
- Audit-log explorer with filters + detail drawer
- Skills management (approve, merge, alias)

**Exit:** Dashboard loads in < 1 s against 10k users / 10k jobs / 50k applications. Every KPI
number is verifiable against a direct DB query. Pending-count tiles link into their queues.

---

## Phase 9 — Hardening, UX Polish & Accessibility
**Deliverables**
- Security pass: Helmet CSP tuning, all rate limits, sanitisation audit, `npm audit`, upload fuzzing
- Full loading / empty / error state coverage on **every** list surface
- Skeletons matched to real geometry; Framer Motion page + list transitions
- `prefers-reduced-motion`, focus traps, aria wiring, keyboard-only pass, AA contrast in both themes
- Performance: bundle analysis, manual chunks, virtualised tables, image transforms
- Playwright E2E: (a) candidate signup → resume → apply, (b) employer signup → verify → post → approve → live, (c) admin rejects an employer and their jobs disappear, (d) refresh-token rotation across a reload
- Error tracking hook, 404/500 pages, SEO meta + OG tags + sitemap

**Exit:** Lighthouse ≥ 90 across Performance / Accessibility / Best Practices / SEO on the public
pages. Zero critical `npm audit` findings. All 4 E2E journeys green. Keyboard-only completion of
the apply flow.

---

## Phase 10 — Documentation & Deployment
**Deliverables**
- OpenAPI 3 spec complete; Swagger UI at `/api/docs` (non-prod)
- Postman collection with environment files
- `README.md`: overview, USP, screenshots, quick start, scripts, architecture summary
- `DEPLOYMENT.md`: Docker prod, Atlas setup, Cloudinary, SMTP, env checklist, first-admin seeding, backup/restore, rollback
- `CONTRIBUTING.md` + `ARCHITECTURE.md` (condensed from this package)
- Production `docker-compose.prod.yml`, multi-stage builds, non-root users, healthchecks
- Seed scripts for a live demo dataset (every UI state reachable)

**Exit:** A fresh machine goes from `git clone` to a running, seeded application by following the
README alone — no tribal knowledge required.

---

## Cross-Cutting Definition of Done

A phase is not complete until **all** of the following hold:

- [ ] Every new endpoint has a validator, a DTO, and an integration test
- [ ] Every new service function has a unit test (happy + error paths)
- [ ] No controller imports a model; no service touches `req`/`res` (ESLint enforced)
- [ ] Every list UI implements loading / empty / error / success
- [ ] Every destructive action goes through `ConfirmDialog` and states its blast radius
- [ ] Both light and dark themes verified
- [ ] Mobile (375 px) verified
- [ ] No hardcoded strings — messages in `constants/messages.js`, routes in `paths.js`, enums in `shared/`
- [ ] No `console.log` in `server/src` (logger only)
- [ ] CI green: lint + typecheck + tests + build

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Admin verification becomes a throughput bottleneck | Employers churn waiting | Bulk approve, oldest-first queue, checklist UI, nightly digest, avg-review-time metric on the dashboard |
| Visibility flag drifts from the truth | **A hidden job leaks publicly — the product's core promise breaks** | Redundant read-side filter + nightly reconcile cron that logs corrections + 12-case integration matrix |
| Resume parsing accuracy is poor | Bad autofill frustrates candidates | Nothing auto-applies (ADR-006); deterministic extractors first; confidence shown; manual editing always available |
| Text-index search quality plateaus | Weak relevance ranking | Repository seam already isolates it — swap to Atlas Search behind `searchJobs()` |
| Redis unavailable | Queue + rate limiting degrade | In-process fallback with a loud startup warning; parsing falls back to synchronous |
| Cloudinary quota / outage | Uploads fail | Graceful error + retry; storage adapter is an interface, S3 is a drop-in |
| Scope creep into messaging/ATS/billing | Never ships | Explicitly out of scope in [00 §3](00-OVERVIEW.md#3-scope); v2 backlog below |

---

## v2 Backlog (deliberately not in v1)

Real-time chat (Socket.io) · Interview scheduling with calendar sync · Multi-recruiter teams with
per-seat roles · ATS integrations · Assessment tests · Video intros · Company reviews ·
Referral system · Job alerts by email digest · i18n · PWA/offline · Atlas Search with synonyms ·
Elasticsearch · Semantic job↔candidate matching with embeddings.
