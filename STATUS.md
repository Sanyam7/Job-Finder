# Build Status

Last updated: 2026-08-02

Architecture is complete and approved (see [docs/](docs/)). Implementation follows
[docs/09-ROADMAP.md](docs/09-ROADMAP.md). This file tracks exactly what exists.

---

## Verified working

| Check | Result |
|---|---|
| **Server test suite** | ✅ **142/142 pass**, 6 suites |
| — Unit: visibility invariant | 16 tests, incl. an exhaustive 40-combination matrix |
| — Unit: resume parser | 30 tests, no DB / network / API key |
| — Integration: the two gates | 15 tests against a real **replica-set** MongoDB |
| — Integration: applications pipeline | 29 tests |
| — Integration: candidate profile + ADR-006 | 24 tests |
| — Integration: notifications, bookmarks, search, analytics | 28 tests |
| API boots with every router mounted | ✅ **113 routes** |
| OpenAPI spec parses and mounts | ✅ 19 documented paths at `/api/v1/docs` |
| Client production build | ✅ 243 modules, ~110 kB gzip initial JS, every screen its own chunk |
| **ESLint** (client + server + shared) | ✅ **0 errors** |
| **Typecheck** (`checkJs`, both workspaces) | ✅ **0 errors** — from 419 (server) and 499 (client) |

```bash
npm run test --workspace=server
npm run build --workspace=client
npx eslint client/src server/src shared --ext .js,.jsx
npm run typecheck --workspaces
```

### What the integration suites actually prove

**The two gates**
- An unverified employer gets `403 EMPLOYER_NOT_VERIFIED` on `POST /jobs` **and** on
  submitting an existing draft — while still able to read and draft.
- A `PENDING` job is absent from `GET /public/jobs`, and `/public/jobs/:slug` returns
  **404, not 403** (403 would confirm to a scraper that the listing exists).
- Verifying an employer flips their approved, in-deadline jobs public **in one transaction**;
  suspending one removes their live listings **in the same request**.
- A rejection with no reason is refused at the validator, the service and the schema.

**Applications**
- Applying re-runs the public filter **inside the transaction**, so a job pulled between page
  load and click is refused and no row is written.
- Two concurrent applications produce **exactly one row** — the unique index, not a racy read.
- The candidate projection carries no `employerNotes`, `rating` or `tags`, and an employer's
  internal timeline note never reaches them.
- Contact details are masked until `SHORTLISTED`.
- A **suspended employer cannot schedule interviews** with people who already applied.
- An employer cannot withdraw on a candidate's behalf; a rival company asking for an
  application id gets **404, not 403**.
- The timeline is append-only at the model layer — editing an existing entry throws.

**ADR-006 — "never force AI extracted values"**
- With a full parsed draft on file, every live profile field is still empty.
- Applying `['bio']` writes `bio` and leaves a user-written `headline` untouched.
- An accepted value is marked `PARSER`, not `USER` — only the candidate's own typing locks it.
- `paths: []` is a **422**. There is no request shape meaning "apply everything".
- `$where`, `a.$.b`, `__proto__.polluted` and `skills.0.name` are all rejected.

**Discovery, notifications and analytics**
- A bookmark cannot be created for a job that is not publicly visible, and a saved job that
  is later pulled comes back as a **tombstone**, not a live card and not silently missing.
- Candidate search returns nobody until a candidate opts in, excludes `PRIVATE` profiles, and
  its result cards carry **no contact details at all**.
- A notification belongs to exactly one recipient; a repeated scheduled warning does not
  resurrect one the user already dismissed.
- The visibility check detects a row tampered with directly in the database.

---

## Complete

### Backend

**Foundation** — npm-workspaces monorepo, shared contract package, fail-fast env validation,
Winston with secret redaction + requestId correlation, `ApiError` hierarchy + one global
handler, lazily-built Redis-or-memory rate limiters with IPv6 /64 bucketing and fail-open,
multi-stage non-root Docker images, compose with a single-node Mongo replica set.

**Auth & RBAC** — rotation with family-based reuse detection, hashed-at-rest tokens,
`passwordChangedAt` invalidation, account lockout, timing-equalised login, 13 endpoints,
five guard middlewares, 17 email templates, domain event bus.

**The USP** — `buildPublicJobFilter()`, `computeVisibility()`, transactional
verify/reject/suspend/restore each flipping job visibility in the same commit, the
material-edit rule, append-only `AuditLog`, nightly reconciliation.

**Applications** — unique compound index making one-per-job a database guarantee, immutable
job/candidate/**resume** snapshots, append-only timeline enforced by a model hook, the state
machine plus a separate **actor**-permission map, funnel aggregation, per-id bulk results,
audited signed resume access.

**Candidate & resume** — provenance map (dot-paths encoded, since Mongoose maps forbid dots),
weighted completeness, profile created idempotently on first access, deterministic parser
(sections, contact, links, alias-canonicalised skills, date-anchored experience, overlapping
roles **merged not added**), BullMQ with an inline fallback so `npm run dev` still parses.

**Discovery & analytics** — polymorphic bookmarks gated on the same visibility rules as
viewing, notifications with a partial dedupe index and a 90-day TTL, event-driven notification
subscriber, candidate search composing the discoverability gate, admin analytics reporting
**median** review time and oldest queue wait, on-demand invariant check.

### Frontend

Vite + Tailwind with semantic CSS-variable tokens and dark mode · Redux Toolkit with the
**access token in memory only** · axios refresh queue · four route guards · design system
(`Button`, `Input`/`Textarea`/`Select`/`Checkbox`, `Badge` + `VerifiedMark`, `Card`/`StatCard`/
`Table`, `EmptyState`/`ErrorState`/`Alert`/skeletons) · `DashboardLayout` with skip link,
notification bell and user menu · typed API client for all 113 endpoints.

**Screens built:**

| Portal | Screen | What it carries |
|---|---|---|
| Public | Job browse | URL-driven filters (shareable, bookmarkable), verified marks from the server flag |
| Public | Job detail + apply dialog | Handles every API refusal code distinctly — resume missing, already applied, listing pulled mid-typing |
| Auth | Sign up | Role is immutable, so it is two deliberate cards; the employer card states the document + review requirement **before** the account exists |
| Auth | Verify email | Token redeemed via Query, not an effect — StrictMode would redeem a single-use token twice and report "invalid" to someone just verified |
| Auth | Forgot / reset password | Identical success state whether or not the address exists, because the server's response is; reset says it revokes every session |
| Candidate | **Profile editor** | Per-section saves, provenance chips (`USER` vs `PARSER`), save disabled until dirty so a visit can't silently lock parser fields |
| Candidate | **Resume review (ADR-006)** | Nothing pre-selected, conflicts flagged, "Discard all" equally weighted |
| Candidate | Applications tracker | Pipeline per row, honest "not opened yet", withdrawal is final and says so |
| Candidate | Saved jobs | Pulled listings return as **tombstones** — neither silently dropped nor shown as live |
| Employer | Verification | Readiness checklist, rejection reason verbatim, polls while pending |
| Employer | **Company profile** | Mirrors the reviewer's two automated signals live (domain match, free-mail); documents show metadata only, since the API never returns a URL for them |
| Employer | **Post / edit a job** | Save ≠ publish; warns **before** saving that a material edit un-publishes a live listing, and names which fields did it |
| Employer | Your jobs | "Visible now" is a separate column from status — an approved job past its deadline is both |
| Employer | Applicant inbox | Buttons derived from server `allowedTransitions`, masking rule explained, audited resume fetch |
| Admin | **Employer queue (gate 1)** | Mandatory checklist, approve disabled until complete, automated signals on the row |
| Admin | **Job queue (gate 2)** | Revisions flagged loudly, bulk approve but never bulk reject |
| Admin | Users | Suspension requires a written reason; the dialog says an employer suspension also pulls their live listings |
| Admin | Analytics | Invariant check first, median review time, hand-rolled SVG charts (no 90 kB library) |

### Documentation

Ten architecture documents · [docs/10-DEPLOYMENT.md](docs/10-DEPLOYMENT.md) ·
**OpenAPI 3.0 spec** served at `/api/v1/docs` via Swagger UI, off in production by default —
it documents the moderation endpoints and the verification checklist, which is as useful to
someone probing the gate as to a developer.

---

## Not yet built

| # | Work |
|---|---|
| 1 | Four dashboards (candidate, employer, admin) and the public companies directory |
| 2 | Employer candidate-search screen (the API and its discoverability gate are tested) |
| 3 | Admin audit-log viewer |
| 4 | Redis response cache on the public job list |
| 5 | Optional LLM enrichment pass (feature-flagged; the parser works without it) |
| 6 | Playwright E2E |

**Placeholders are deliberate.** Every portal route, guard and gate is real and testable
today; unbuilt screens render a labelled placeholder rather than a blank page.

---

## Tooling

`lint` and `typecheck` were declared in every workspace but **no config file existed anywhere**
— the dependencies were installed, the configs were never written, so ADR-001's "type-safe
JavaScript" was unenforced and `npm run lint` failed with "couldn't find a configuration file".
Both are now wired up.

- **ESLint** — one root `.eslintrc.json` with per-workspace overrides. Beyond the recommended
  set it forbids `localStorage`/`sessionStorage` in the client, because the access token lives
  in memory only (ADR-004) and anything persisted there is readable by any XSS on the page.
- **`checkJs`** — `jsconfig.json` per workspace, now passing clean. Four declaration files
  carry real contracts rather than silencing errors:
  - `server/types/express.d.ts` — what each middleware attaches to `req`, so reading
    `req.employer` on a route that never ran the gate is a compile error.
  - `server/types/mongoose.d.ts` — the plugin statics (`paginate`) and soft-delete methods
    every model genuinely has. Per-model statics (`Notification.push`) are declared on their
    own model instead, so this file stays true and `Job.push(...)` does not typecheck.
  - `client/src/types/api.d.ts` — the normalised error shape, registered with TanStack Query
    so every `error.code` switch in the UI is checked.
  - `client/src/app/hooks.js` — a typed `useAppSelector`, because `persistReducer` erases the
    store's state type and leaves every selector reading `unknown`.

Between them they found **six real defects** — see below.

---

## Bugs found and fixed

Recorded because each was silent — none produced an error at the point of the mistake.

1. **A compound `sparse` unique index does not skip partial documents.** It only skips a row
   when *every* indexed field is missing. `recipient` is always present, so two notifications
   without a `dedupeKey` collided on `{recipient, null}` — two people applying to the same job
   produced one notification and a 500. Fixed with a `partialFilterExpression`.
2. **Aggregation `$match` does not cast ids.** `find()` runs filters through the schema; a
   pipeline compares raw BSON. The employer funnel read "no applicants" rather than failing.
3. **Mongoose maps reject keys containing `.`** — the provenance map threw the first time
   anyone saved a nested field (`preferences.noticePeriodDays` 500s, `headline` works).
4. **The developer `.env` leaked into tests.** `RATE_LIMIT_ENABLED=true` overrode the test
   default; the suite spent the anonymous quota partway through and every later test failed
   with an unrelated 429.
5. **`npm test` referenced a hoisted binary by path**, which does not resolve inside a
   workspace.
6. **Mojibake inside the resume parser's whitespace regex.** The character class read
   `[\t + NBSP]` — but the NBSP had been stored as the two-character sequence `U+00C2 U+00A0`,
   the signature of a UTF-8 non-breaking space decoded as Latin-1 and re-saved. That silently
   added `Â` to the class, so every `Â` in a resume was replaced with a space and names like
   "ÂNGELA" came out mangled. Nothing threw. Every character in that regex is now a `\uXXXX`
   escape, which cannot be corrupted by a re-encode, and `normaliseWhitespace` is exported and
   covered by four regression tests — the first fails if anyone reintroduces a literal.
   *(Found by ESLint `no-irregular-whitespace`.)*
7. **A dead subscriber import hidden by `.catch(() => null)`.** `events/index.js` dynamically
   imported `audit.subscriber.js`, which has never existed — auditing is done inline by the
   services, inside the same transaction as the decision. The same swallow-everything catch
   wrapped the notification subscriber, which *does* exist: had it ever failed to import,
   notifications would have stopped platform-wide with nothing logged. Both are now static
   imports, so a missing module is a boot failure. *(Found by `tsc` TS2307.)*
8. **Stale `@type` JSDoc in the gate test.** The annotation on `ctx` listed three properties
   while the seed function returned four, so `ctx.employerUserId` was typed as absent — exactly
   the documentation-vs-code drift `checkJs` exists to catch. *(Found by `tsc` TS2551.)*
9. **★ "Mark as viewed" never ran.** The applicant dialog marked an application `VIEWED` from
   an `onSuccess` callback on `useQuery` — **an option TanStack Query removed in v5**, and this
   project is on 5.101.4. It silently did nothing: employers opened applications and the status
   stayed `APPLIED` forever, so the funnel under-counted every viewed candidate and the
   candidate's tracker kept saying "not opened yet" about an application somebody had read.
   Replaced with an effect keyed on the loaded application, with a ref guard so the refetch
   that follows the write cannot fire it twice. *(Found by `tsc` TS2769.)*
10. **A prop that did nothing.** The job-search box passed `leftIcon` to `Input`, which has no
    such prop — the API is `leftAddon`. It was `null`, so the intended search icon had simply
    never appeared. *(Found by `tsc` TS2322.)*

---

## Known gaps

1. Neither `lint` nor `typecheck` is wired into CI yet — there is no CI pipeline in the repo.
   Both pass clean now, so adding them is a config change rather than a cleanup project.
2. `npm audit` reports 4 vulnerabilities (3 moderate, 1 high) and has not been triaged.
3. `sanitize-html` is pinned to `2.13.1` — later releases depend on an ESM-only `htmlparser2`
   that Jest's CJS runtime cannot load.
4. Legacy `.doc` resumes are stored and attach to applications but are not text-extracted
   (no maintained pure-JS reader for the binary OLE format).
5. The Cloudinary round trip is not exercised in CI — it needs live credentials or a stub.
6. No component or E2E tests on the client yet; the build is verified, the behaviour is not.
