# 00 — Product Overview & Architectural Decisions

> **Working name:** VeriHire — The Verified Job Portal
> **Status:** `ARCHITECTURE — AWAITING APPROVAL`. No implementation code exists yet.

---

## 1. Problem Statement

Mainstream job boards optimise for **listing volume**. Volume attracts fraud: ghost jobs,
data-harvesting "recruiters", pyramid schemes, and fee-for-placement scams. Candidates burn
weeks applying into voids and leak PII (phone, resume, salary) to unverified parties.

## 2. Product Thesis

We optimise for **listing trust** instead of listing volume. The entire system is built around
one non-negotiable invariant:

> ### 🔒 THE CORE INVARIANT
> A job is visible to the public **if and only if**:
> ```
> job.status              === APPROVED
> AND job.deletedAt        == null
> AND job.deadline         >= now
> AND employer.verification === VERIFIED
> AND employer.status       === ACTIVE      (not suspended / deleted)
> ```
> This is a **two-gate system**: the *employer* is verified once by a human admin, and *every
> individual job* is approved by a human admin. Failing either gate means the job does not
> exist as far as anonymous traffic is concerned.

This invariant is not scattered across controllers. It is implemented **exactly once**, in
`server/src/repositories/job.repository.js` as `buildPublicJobFilter()`, and every public-facing
read path is required to compose it. See [08-BACKEND-ARCHITECTURE.md](08-BACKEND-ARCHITECTURE.md#7-the-two-gate-visibility-guard).

## 3. Scope

| In scope | Out of scope (explicitly) |
|---|---|
| 4 portals: Public, Candidate, Employer, Admin | Pricing / plans / billing / payments |
| Manual admin verification of employers | Premium job boosts, sponsored listings |
| Manual admin approval of every job | Native mobile apps |
| Resume upload + automated field extraction | Real-time chat / video interviews (v2) |
| Advanced job & candidate search | ATS integrations (v2) |
| Application pipeline with timeline | Multi-tenant white-labelling |
| In-app + email notifications | i18n / multi-language (structured for it, not shipped) |
| Admin analytics dashboard | |

> **Note:** the brief says *"Pricing Page should NOT exist. No premium plans."* — there is no
> `Plan`, `Subscription`, `Invoice`, or `Payment` model anywhere in the design, and no route
> reserves `/pricing`. Monetisation is deliberately absent from the domain model.

## 4. Roles & Permission Summary

| Role | Obtained by | Core capability | Gated by |
|---|---|---|---|
| **GUEST** | No account | Browse approved jobs, view verified companies, search | — |
| **CANDIDATE** | Self sign-up + email verification | Profile, resume, apply, save jobs, track applications | Email verified |
| **EMPLOYER** | Self sign-up + email verification + **admin company verification** | Post jobs, search candidates, manage applications | `VERIFIED` company |
| **ADMIN** | Seeded / promoted by another admin only | Verify employers, approve jobs, moderate, analytics | — |

Full permission matrix: [08-BACKEND-ARCHITECTURE.md §6](08-BACKEND-ARCHITECTURE.md#6-rbac-permission-matrix).

**Escalation rule:** `EMPLOYER` and `CANDIDATE` are chosen at sign-up and immutable thereafter.
`ADMIN` can never be self-assigned — the first admin comes from a seed script, subsequent admins
are promoted by an existing admin and the promotion is written to the audit log.

## 5. Technology Stack (locked)

### Frontend
`React 18` · `React Router DOM v6` · `Redux Toolkit` · `Redux Persist` · `TanStack Query v5` ·
`Axios` · `React Hook Form` · `Yup` · `Tailwind CSS v3` · `Framer Motion` · `React Icons` ·
`Recharts` (admin analytics) · `Vite` (build)

### Backend
`Node.js 20 LTS` · `Express 4` · `MongoDB 7` · `Mongoose 8` · `JWT` · `bcrypt` · `Helmet` ·
`CORS` · `Morgan` + `Winston` · `express-rate-limit` · `express-validator` · `cookie-parser` ·
`Multer` · `Cloudinary` · `pdf-parse` · `mammoth` (DOCX) · `Nodemailer` · `BullMQ` + `Redis` ·
`Zod`-free (validators are express-validator per brief)

### Infrastructure
`Docker` + `docker-compose` · `MongoDB Atlas` (prod) · `Redis` · `Cloudinary` CDN ·
GitHub Actions CI

---

## 6. Architecture Decision Records (ADR)

These are the decisions that shape everything downstream. **Please review these carefully —
they are the expensive-to-reverse ones.**

### ADR-001 — JavaScript with JSDoc, not TypeScript
The brief specifies *"Type-safe coding style even in JavaScript"*. We therefore ship **JS +
JSDoc typedefs + `checkJs: true`** in `jsconfig.json`. This gives editor-level type safety,
`tsc --noEmit` in CI as a type gate, and full IntelliSense — with zero build-step change and no
`.ts` files. All DTOs, model shapes, and service signatures carry `@typedef` / `@param` /
`@returns` annotations.
*Trade-off:* weaker than real TS at runtime boundaries; mitigated by express-validator on every
inbound request and Mongoose schema strictness on every DB write.

### ADR-002 — npm-workspaces monorepo with a shared contract package
```
job-portal/
├─ client/      (React SPA)
├─ server/      (Express API)
└─ shared/      (enums, constants, regex, error codes — imported by BOTH)
```
Role names, job statuses, application statuses and API error codes are declared **once** in
`shared/` . This eliminates the classic MERN bug where the frontend checks `"shortlisted"` and
the backend writes `"SHORTLISTED"`.
*Trade-off:* requires workspace-aware Docker builds (handled in the Dockerfiles).

### ADR-003 — Strict layered backend, controllers own zero logic
`Route → RateLimit → Auth → RBAC → Validator → Controller → Service → Repository → Mongoose`.
**A controller may never import a Mongoose model.** A service may never touch `req`/`res`.
Repositories are the only place query construction lives. Enforced by an ESLint
`no-restricted-imports` rule.

### ADR-004 — Access token in memory, rotating refresh token in an httpOnly cookie
- **Access JWT**: 15 min, returned in the JSON body, held in Redux **memory only**.
- **Refresh token**: 7 days, opaque random 64-byte string, **SHA-256 hashed at rest**, delivered
  as `httpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`.
- **Rotation + reuse detection**: every refresh issues a new token and revokes the old one.
  Presenting an already-revoked token kills the entire token *family* (all sessions for that
  user) and raises a `SECURITY` audit event.
*Why:* XSS cannot read the refresh cookie; CSRF cannot use the access token (it's not a cookie).
This is materially stronger than the common "both tokens in localStorage" MERN pattern.

### ADR-005 — Redux Toolkit and TanStack Query have disjoint responsibilities
| Redux Toolkit | TanStack Query |
|---|---|
| Session identity, UI state, theme, filter *drafts*, multi-step form wizards, notification tray badge | **All** server-owned data: jobs, applications, profiles, admin queues, analytics |

**Redux Persist whitelists `ui`, `theme`, and `auth.user` only — never `auth.accessToken`.**
Persisting an access token to localStorage would undo ADR-004 entirely.
Details: [07-FRONTEND-ARCHITECTURE.md §4](07-FRONTEND-ARCHITECTURE.md#4-redux-architecture).

### ADR-006 — Resume parsing is asynchronous, and AI output is *provenance-tagged*, never authoritative
The brief is emphatic: *"Never force AI extracted values. Manual editing should always be
allowed."* Our design:
1. Upload returns `202 Accepted` immediately; a **BullMQ** job does the parsing.
2. `pdf-parse`/`mammoth` → deterministic regex/heuristic extractors → optional LLM enrichment.
3. Results land in `candidateProfile.parsedDraft`, **not** in the live profile.
4. The candidate sees a **side-by-side review screen** and accepts fields individually.
5. Every field carries `{ value, source: 'USER' | 'PARSER' | 'AI', confidence, updatedAt }`.
   **A re-parse can overwrite `PARSER`/`AI` fields but never a `USER` field.**
*This provenance model is the single most important correctness guarantee in the candidate module.*

### ADR-007 — Resumes are private objects served through an authenticated proxy
Resumes go to Cloudinary as `type: 'authenticated'` (never `public`). The raw Cloudinary URL is
never sent to the browser. Downloads go through
`GET /api/v1/candidates/:id/resume` → RBAC check → short-lived signed URL → 302, and **every
download is written to the audit log**. An employer can only download a resume for a candidate
who applied to their job, or who has `openToWork: true`.

### ADR-008 — Domain events decouple side effects
Services emit `job.approved`, `application.shortlisted`, `employer.verified`, … through a central
`EventBus`. Subscribers (notification writer, email sender, audit logger) are registered at boot.
Adding "also send an SMS on shortlist" becomes a new subscriber, not a service edit — this is the
Open/Closed principle applied where it actually pays off.
*Implementation:* Node `EventEmitter` v1 → swap the bus for a BullMQ topic in v2 with no service
changes.

### ADR-009 — Embedded subdocuments for profile-owned collections
The brief lists `Experience`, `Education`, `Skills` as collections. We **embed** experience,
education, projects, and certifications as subdocuments inside `candidateProfiles`, because they
are (a) always read with the parent, (b) bounded (<100 entries), and (c) never queried
independently. `skills` **is** a real collection — a normalised taxonomy that powers autocomplete,
canonical naming (`ReactJS`→`React`), and faceted search.
*Trade-off & escape hatch:* each subdocument has its own schema file in `models/schemas/`, so
promoting any of them to a standalone collection later is a repository-layer change only.
**Flagging this for your explicit approval — it's a deliberate deviation from the literal brief.**

### ADR-010 — API versioning at the path root
All routes under `/api/v1`. A `v2` router can mount alongside without breaking deployed clients.

### ADR-011 — Soft deletes everywhere + immutable audit log
Nothing is hard-deleted. `deletedAt` + `deletedBy` on all moderatable documents, filtered by a
global Mongoose pre-hook. Every admin action writes an `AuditLog` entry with actor, target,
before/after diff, IP, and user agent. This is a trust platform; moderation must be reviewable.

### ADR-012 — Search: MongoDB compound + text indexes now, Atlas Search later
v1 uses a weighted `$text` index plus compound indexes tuned to the actual filter combinations
(see [03-DATABASE-DESIGN.md §5](03-DATABASE-DESIGN.md#5-index-strategy)). The repository exposes
`searchJobs(criteria)` as the single seam, so migrating to Atlas Search `$search` (fuzzy,
synonyms, relevance scoring) later touches one file.

---

## 7. Non-Functional Requirements

| Concern | Target |
|---|---|
| Public job list p95 | < 300 ms (indexed, lean, projected) |
| Search p95 | < 500 ms up to 100k jobs |
| Auth endpoints rate limit | 5 attempts / 15 min / IP+email |
| Global API rate limit | 100 req / 15 min / IP (authenticated: 300) |
| Resume upload | ≤ 5 MB, `pdf`/`doc`/`docx` only, magic-byte checked |
| Password | bcrypt cost 12, min 8 chars, complexity enforced |
| Uptime design | Stateless API → horizontally scalable behind a load balancer |
| Accessibility | WCAG 2.1 AA, keyboard-navigable, focus-visible, aria-live on toasts |
| Test gate | Services + repositories ≥ 80% line coverage |

---

## 8. Master Feature List

<details>
<summary><b>Public / Guest</b> (click to expand)</summary>

Landing page · Browse & search approved jobs · Job detail (public) · Verified company directory ·
Company profile page · About · How It Works · Features · Why Verified Jobs · FAQ · Contact form ·
Report a listing · 404/500 pages · Dark mode · Responsive
</details>

<details>
<summary><b>Candidate</b></summary>

Sign-up · Email verification · Login/Logout · Forgot/Reset password · Resume upload · **AI-assisted
profile autofill with per-field accept/reject** · Full profile editor (headline, bio, skills,
experience, education, projects, achievements, certifications, languages) · Social links (GitHub,
LinkedIn, portfolio) · Job preferences (type, salary expected/current, location, remote, notice
period, availability) · **Open To Work** toggle · Profile completeness meter · Resume preview &
download · Apply to job (with cover note) · Application tracker + **visual timeline** · Saved jobs ·
Recommended jobs · Notifications · Account settings · Change password · Delete account
</details>

<details>
<summary><b>Employer</b></summary>

Sign-up · Email verification · **Company verification submission** (name, website, company email,
LinkedIn, GST optional, documents, identity proof) · Verification status tracker with rejection
reasons · Resubmit after rejection · Company profile (logo, description, industry, founded, size,
address, contacts) · Create/edit/clone/archive job · Job list with status badges · **Pending →
Approved/Rejected** visibility · Applicant list per job · Applicant filtering · Application status
transitions (Applied → Viewed → Shortlisted → Interview → Rejected/Hired) · Interview scheduling
note · **Candidate database search** (skills, experience, location, salary, notice period,
availability, open-to-work) · View candidate profile · Download resume · Shortlist / Reject /
Bookmark candidate · Dashboard analytics · Notifications · Team-ready ownership model
</details>

<details>
<summary><b>Admin</b></summary>

Dashboard KPIs (users, employers by status, jobs by status, applications) · Charts (signups over
time, jobs by status, applications funnel, top industries) · Recent activity feed · **Employer
verification queue** with document viewer, approve/reject + reason · Suspend/restore/delete
employer · **Job approval queue** with diff view, approve/reject + reason · Bulk actions · Delete
job · User management (candidates + employers, search, filter, suspend) · View candidate profile ·
Reports/abuse queue · Audit log explorer · Admin promotion · Settings
</details>

---

## 9. What Needs Your Approval Before Coding Starts

| # | Decision | Default proposed |
|---|---|---|
| 1 | **ADR-009** — embed Experience/Education/Projects instead of separate collections | Embed ✅ |
| 2 | **Redis dependency** for BullMQ (async resume parsing) + distributed rate limiting | Include; graceful in-process fallback if `REDIS_URL` unset |
| 3 | LLM provider for resume enrichment | Optional & pluggable; **works fully without it** via deterministic parser |
| 4 | Product name `VeriHire` | Placeholder — trivially renamed via `shared/constants/brand.js` |
| 5 | Vite instead of CRA | Vite ✅ (CRA is deprecated) |
| 6 | `Bookmarks` + `SavedJobs` merged into one polymorphic `bookmarks` collection | Merge ✅ |

Read the rest of the package, then reply with **approve** (or tell me what to change) and I'll
begin Phase 0 of [09-ROADMAP.md](09-ROADMAP.md).
