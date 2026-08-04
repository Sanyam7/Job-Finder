# VeriHire — The Verified Job Portal

> **No job appears publicly until an admin has verified the employer *and* approved the job.**

A production-grade MERN job portal built around a single idea: eliminate fake listings by putting
a human verification gate in front of both the company and every individual posting.

**Status:** 🏗 Architecture complete — awaiting approval. No implementation code yet.

---

## Architecture Package

Read in order. Each document is self-contained and cross-linked.

| # | Document | What's inside |
|---|---|---|
| 00 | [Overview & Decisions](docs/00-OVERVIEW.md) | Problem, scope, roles, **12 ADRs**, NFRs, master feature list, open questions |
| 01 | [System Architecture](docs/01-SYSTEM-ARCHITECTURE.md) | C4 diagrams, middleware chain, auth flow, USP flow, resume pipeline, deployment, env vars |
| 02 | [Folder Structure](docs/02-FOLDER-STRUCTURE.md) | Full enterprise tree for `client/`, `server/`, `shared/` with the rules that keep it navigable |
| 03 | [Database Design](docs/03-DATABASE-DESIGN.md) | ER diagram, 14 collections field-by-field, index strategy, integrity rules, transactions |
| 04 | [API Specification](docs/04-API-SPECIFICATION.md) | 118 endpoints, response envelope, error codes, rate-limit policy |
| 05 | [User Flows](docs/05-USER-FLOWS.md) | Onboarding, both verification gates, apply pipeline, resume autofill, moderation, sessions |
| 06 | [Wireframes & Design System](docs/06-WIREFRAMES.md) | Tokens, 9 screen wireframes, responsive + state rules |
| 07 | [Frontend Architecture](docs/07-FRONTEND-ARCHITECTURE.md) | Routing, component hierarchy, Redux architecture, Query layer, forms, theming, perf, a11y |
| 08 | [Backend Architecture](docs/08-BACKEND-ARCHITECTURE.md) | Layer contracts, error handling, repositories, search, RBAC matrix, **the visibility guard**, events, cron, security |
| 09 | [Development Roadmap](docs/09-ROADMAP.md) | 11 phases with exit criteria, definition of done, risk register, v2 backlog |

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

---

## Stack

**Frontend** React 18 · Vite · React Router v6 · Redux Toolkit + Persist · TanStack Query v5 ·
React Hook Form + Yup · Tailwind · Framer Motion · Recharts · Axios

**Backend** Node 20 · Express 4 · MongoDB 7 · Mongoose 8 · JWT (rotating refresh) · bcrypt ·
Helmet · express-validator · Multer · Cloudinary · pdf-parse · BullMQ + Redis · Winston ·
Nodemailer

**Infra** Docker · docker-compose · GitHub Actions · MongoDB Atlas

---

## Quick Start

> Available after Phase 0. Placeholder — do not run yet.

```bash
git clone <repo> && cd job-portal
cp server/.env.example server/.env    # fill in secrets
cp client/.env.example client/.env
npm install                            # workspaces: client, server, shared
docker compose up -d mongo redis
npm run seed:admin && npm run seed:skills
npm run dev                            # api :5000 · client :5173
```

---

## Next Step

Review [docs/00-OVERVIEW.md §9](docs/00-OVERVIEW.md#9-what-needs-your-approval-before-coding-starts)
and approve or amend. Implementation begins at
[Phase 0](docs/09-ROADMAP.md#phase-0--foundation) once approved.
