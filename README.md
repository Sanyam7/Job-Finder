# VeriHire — The Verified Job Portal

> **No job appears publicly until an admin has verified the employer *and* approved that
> specific job.**

A production-grade MERN job portal built around a single idea: eliminate fake listings by
putting a human verification gate in front of both the company and every individual posting.

**Status:** ✅ Built, tested and deployed.

---

## Live

| | URL | Host |
|---|---|---|
| **Web** | https://verihire-portal.netlify.app | Netlify |
| **API** | https://verihire-api.onrender.com/api/v1/health | Render |
| **Database** | — | MongoDB Atlas (M0, AWS Singapore) |

> The API runs on Render's free tier, which sleeps when idle. The **first** request after a
> quiet period takes ~50 s to wake the container; everything after it is fast. The web client
> proxies `/api/*` to the API from its own origin, so the refresh cookie stays `SameSite=Strict`.

---

## The Core Invariant

```js
// A job is public if and only if:
job.status === 'APPROVED'
  && job.isPubliclyVisible === true
  && job.deletedAt === null
  && job.deadline >= now
  && employer.verificationStatus === 'VERIFIED'
  && employer.status === 'ACTIVE'
```

Implemented **once**, in `buildPublicJobFilter()`. Enforced on the write side by middleware, on
the read side by that filter, and repaired nightly by a reconciliation cron.
See [08 §7](docs/08-BACKEND-ARCHITECTURE.md#7-the-two-gate-visibility-guard).

Two consequences that are easy to get wrong and are covered by tests:

- Verifying an employer flips their approved, in-deadline jobs public **in one transaction**;
  suspending one pulls their live listings **in the same request**.
- A hidden job returns **404, not 403** — a 403 would confirm to a scraper that the listing
  exists.

---

## Resume Autofill

Uploading a resume fills the profile automatically. The parser extracts headline, skills,
experience, education, contact details and links, and writes them straight into the live
profile — no review screen, no checkbox list.

What protects your work is **provenance**, not friction. Every field carries a source:

```
USER    — you typed it        → a re-parse can never overwrite it
PARSER  — the resume gave it  → a re-parse refreshes it
```

So on a second upload, a headline you corrected by hand survives while everything you never
touched updates to the new resume. `hasPendingDraft` flags only the fields where the new
resume disagrees with something you typed, and those are yours to accept or ignore.

> **Note:** this supersedes points 3–4 of
> [ADR-006](docs/00-OVERVIEW.md#adr-006--resume-parsing-is-asynchronous-and-ai-output-is-provenance-tagged-never-authoritative),
> which specified a side-by-side review screen with nothing pre-selected. The `USER`-never-
> overwritten guarantee — the part that actually matters — is unchanged.

---

## Quick Start

```bash
git clone https://github.com/Sanyam7/Job-Finder.git && cd Job-Finder
npm install                          # workspaces: shared, server, client

cp server/.env.example server/.env   # then edit — see below
docker compose up -d mongo redis     # Mongo runs as a single-node replica set (transactions)

npm run seed:admin && npm run seed:skills
npm run dev                          # api :5000 · web :5173
```

**Minimum you must edit in `server/.env`:**

| Variable | Why |
|---|---|
| `JWT_ACCESS_SECRET` | 32+ random chars. Boot fails on the placeholder. |
| `JWT_REFRESH_SECRET` | Must **differ** from the access secret. |
| `COOKIE_SECRET` | Signs the refresh cookie. |
| `MONGO_URI` | Defaults to the compose instance; point at Atlas for a real deployment. |

Everything else has a working default. Three things are **off** unless you opt in, and the app
degrades cleanly rather than crashing:

- `EMAIL_ENABLED=false` → the mailer no-ops and logs instead of requiring SMTP.
- `LLM_ENABLED=false` → the deterministic resume parser runs alone. It is not a fallback; it
  is the primary path.
- No `REDIS_URL` → rate limiting uses memory and resume parsing runs inline, so `npm run dev`
  parses resumes without a separate worker process.

The client needs no env file locally — `VITE_API_URL` defaults to `/api/v1` and Vite proxies it.

---

## Verified Working

| Check | Result |
|---|---|
| Server test suite | ✅ **151/151**, 6 suites, against a real replica-set MongoDB |
| API boots with every router mounted | ✅ **110 route handlers** across 10 routers |
| Client production build | ✅ every screen its own chunk |
| Client module smoke test | ✅ **44 modules** evaluate |
| ESLint (client + server + shared) | ✅ 0 errors |
| Typecheck (`checkJs`, both workspaces) | ✅ 0 errors |

```bash
npm run test --workspace=server
npm run build --workspace=client
npm run smoke --workspace=client     # catches modules that crash on import
npm run lint --workspaces
npm run typecheck --workspaces
```

`npm run smoke` exists because a build can succeed on a module that throws the moment it is
evaluated — a temporal-dead-zone bug shipped exactly that way and blanked the profile page.
The smoke test imports every page, feature, component and route module and fails on any that
will not evaluate.

See [STATUS.md](STATUS.md) for the full breakdown, including what each integration suite
proves and the defects found along the way.

---

## Stack

**Frontend** React 18 · Vite · React Router v6 · Redux Toolkit + Persist · TanStack Query v5 ·
React Hook Form + Yup · Tailwind · Framer Motion · Recharts · Axios

**Backend** Node 20 · Express 4 · MongoDB 7 · Mongoose 8 · JWT (rotating refresh) · bcrypt ·
Helmet · express-validator · Multer · Cloudinary · pdf-parse · mammoth · BullMQ + Redis ·
Winston · Nodemailer

**Infra** Docker · docker-compose · MongoDB Atlas · Netlify (web) · Render (API)

---

## Security

| Control | Implementation |
|---|---|
| Headers | Helmet, plus a CSP and `nosniff` on the deployed client |
| Rate limiting | Redis-or-memory, IPv6 /64 bucketing, **fail-open** |
| Auth | JWT access (15 m, memory only) + rotating refresh with family reuse detection |
| Refresh token | Hashed at rest; `httpOnly` + `Secure` + `SameSite=Strict` cookie |
| Passwords | bcrypt, 12 rounds; account lockout; timing-equalised login |
| Injection | Mongoose strict schemas; operator keys rejected at the validator |
| XSS | `sanitize-html` on stored rich text; no token in `localStorage` (ESLint-enforced) |
| Validation | express-validator on every mutating route |
| RBAC | Five guard middlewares plus a separate actor-permission map for state transitions |
| Secrets | Fail-fast env validation at boot; Winston redacts them from logs |
| Resumes | Cloudinary `authenticated` type, short-lived signed URLs, every download audited |

---

## Architecture Package

Read in order. Each document is self-contained and cross-linked.

| # | Document | What's inside |
|---|---|---|
| 00 | [Overview & Decisions](docs/00-OVERVIEW.md) | Problem, scope, roles, **12 ADRs**, NFRs, feature list |
| 01 | [System Architecture](docs/01-SYSTEM-ARCHITECTURE.md) | C4 diagrams, middleware chain, auth flow, USP flow, resume pipeline |
| 02 | [Folder Structure](docs/02-FOLDER-STRUCTURE.md) | Full enterprise tree for `client/`, `server/`, `shared/` |
| 03 | [Database Design](docs/03-DATABASE-DESIGN.md) | ER diagram, 14 collections field-by-field, indexes, transactions |
| 04 | [API Specification](docs/04-API-SPECIFICATION.md) | Endpoint reference, response envelope, error codes, rate limits |
| 05 | [User Flows](docs/05-USER-FLOWS.md) | Onboarding, both gates, apply pipeline, resume autofill, moderation |
| 06 | [Wireframes & Design System](docs/06-WIREFRAMES.md) | Tokens, 9 screen wireframes, responsive + state rules |
| 07 | [Frontend Architecture](docs/07-FRONTEND-ARCHITECTURE.md) | Routing, Redux, Query layer, forms, theming, perf, a11y |
| 08 | [Backend Architecture](docs/08-BACKEND-ARCHITECTURE.md) | Layer contracts, repositories, RBAC matrix, **the visibility guard**, events |
| 09 | [Development Roadmap](docs/09-ROADMAP.md) | Phases with exit criteria, risk register, v2 backlog |
| 10 | [Deployment](docs/10-DEPLOYMENT.md) | Hosting topology, env matrix, Netlify + Render setup |

An **OpenAPI 3.0** spec is served at `/api/v1/docs` via Swagger UI — off in production by
default, since it documents the moderation endpoints and the verification checklist.

---

## Roles

| Role | Can |
|---|---|
| **Candidate** | Browse verified jobs, upload a resume, autofill and edit a profile, apply, track applications, save jobs |
| **Employer** | Submit the company for verification, draft and post jobs, review applicants, schedule interviews |
| **Admin** | **Gate 1** — verify or reject employers · **Gate 2** — approve or reject each job · suspend accounts · analytics |

Roles are immutable after sign-up, so the sign-up screen is two deliberate cards rather than a
dropdown, and the employer card states the document and review requirement **before** the
account exists.

---

## Deployment

Both hosts deploy from this repository.

- **Render** — `render.yaml` blueprint, auto-deploys on push to `main`.
  `REDIS_URL` is deliberately unset: `registerWorkers` runs only in `worker.js`, so Redis
  without a paid worker dyno would queue resumes forever instead of parsing them.
- **Netlify** — `netlify.toml` for the build; redirects and headers live in
  `client/public/` so they travel with the build artifact.

The `_redirects` ordering matters and is documented in the file itself: `/assets/*` must fall
through to a **404** before the SPA catch-all, or a stale chunk request gets `200 text/html`
and the browser refuses to execute it under `nosniff`.

Full walkthrough in [docs/10-DEPLOYMENT.md](docs/10-DEPLOYMENT.md).

---

## Known Gaps

1. No CI pipeline — `lint`, `typecheck` and `test` all pass clean but nothing runs them on push.
2. `/forgot-password` accepts the request and returns its success message but sends nothing
   while `EMAIL_ENABLED=false`. Sign-up no longer depends on email; password reset still does.
3. Netlify is not git-linked, so the web client needs a manual redeploy after a push.
4. Some parser fields are weak — company and location extraction misread common layouts.
   Autofill writes them faithfully; they are marked `PARSER` and are editable.
5. `npm audit` reports vulnerabilities that have not been triaged.
6. Legacy `.doc` resumes are stored and attach to applications but are not text-extracted.
7. No component or E2E tests on the client; the build and module graph are verified, the
   behaviour is not.

---

## License

Private project. All rights reserved.
