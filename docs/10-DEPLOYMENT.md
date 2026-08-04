# Deployment Guide

How to run VeriHire in production, and the handful of things that will bite you if you skip them.

---

## 1. Topology

Three processes and two datastores:

```
                    ┌──────────────┐
   internet ───────▶│  nginx / CDN │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
      ┌───────────────┐         ┌──────────────┐
      │  client (SPA) │         │  api (N x)   │
      │  static files │         │  express     │
      └───────────────┘         └──────┬───────┘
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                     ┌────────────────┐  ┌────────────┐
                     │ MongoDB (RS)   │  │   Redis    │
                     └────────┬───────┘  └─────┬──────┘
                              │                │
                        ┌─────┴────────────────┴─────┐
                        │  worker (exactly 1)        │
                        │  cron + BullMQ consumers   │
                        └────────────────────────────┘
```

**The API scales horizontally. The worker does not.** `registerCronJobs()` runs in the worker
only — with cron in a horizontally scaled API, the nightly visibility reconciliation and the
hourly expiry sweep fire once per replica. Four replicas means four concurrent reconciliations
racing on the same documents.

If you need worker redundancy, run one worker with a restart policy rather than two
concurrently. BullMQ consumers are safe to scale; `node-cron` is not.

---

## 2. MongoDB must be a replica set

Not a preference. `withTransaction` is used by employer approval, employer suspension and the
apply path, and a standalone `mongod` rejects transactions outright.

The code detects that specific failure and falls back to running without a session, logging a
warning each time. **That fallback exists for local development.** In production it means
approving a company could verify them without publishing their jobs, leaving the two halves
of the invariant disagreeing.

Atlas is a replica set on every tier including the free one. Self-hosting, a single-node
replica set is enough — see `docker-compose.yml` for the `--replSet rs0` + `rs.initiate()`
pattern.

Verify before going live:

```bash
mongosh "$MONGO_URI" --eval 'rs.status().ok'   # must print 1
```

---

## 3. Environment

`server/src/config/env.js` validates at boot and **refuses to start** on a missing or
malformed value. That is deliberate: an API that boots with `JWT_ACCESS_SECRET === undefined`
signs tokens with the string `"undefined"` and nobody notices until it is an incident.

### Required

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | Replica set. See above. |
| `JWT_ACCESS_SECRET` | ≥32 chars. **Must differ from the refresh secret** — boot fails if they match, because sharing them lets a refresh token be presented as an access token. |
| `JWT_REFRESH_SECRET` | ≥32 chars |
| `COOKIE_SECRET` | ≥16 chars |
| `CLOUDINARY_*` | cloud name, API key, API secret |
| `SMTP_*` | host, port, user, pass |
| `CLIENT_URL` | Used to build links in outbound email |
| `CORS_ORIGINS` | Comma-separated. No localhost entries — boot warns. |

Generate secrets with real entropy:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Strongly recommended

| Variable | Why |
|---|---|
| `REDIS_URL` | Without it, rate limits are **per-process** (5 login attempts × 4 replicas = 20) and resume parsing runs inline in the request. Boot warns. |
| `TRUST_PROXY=true` | Behind a proxy without this, every client looks like the proxy's IP and rate limiting throttles all users as one. |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | The only way to create the first admin. The seeder **refuses a weak password** — that credential can verify companies. |

`LLM_ENABLED` is optional and off by default. The resume parser is fully deterministic; the
LLM pass only enriches.

---

## 4. First deploy

```bash
# 1. Build
docker compose build

# 2. Start datastores and wait for the replica set
docker compose up -d mongo redis
docker compose logs -f mongo-init      # wait for "replica set initialised"

# 3. Migrate-free — Mongoose creates indexes on connect
docker compose up -d api worker

# 4. Seed the admin and the skill taxonomy
docker compose exec api npm run seed

# 5. Verify
curl -fsS https://api.example.com/api/v1/health
```

`npm run seed` runs the admin and skills seeders only. **Never run `seed:demo` in
production** — it is guarded and will throw, because fabricated companies on a platform whose
entire promise is that everything on it is real would be the worst possible bug.

---

## 5. Index creation

Mongoose builds indexes on connect via `autoIndex`. That is fine for a new deployment and
wrong for a large existing one — index builds block writes.

For a collection with meaningful data, set `autoIndex: false` and build explicitly:

```js
db.jobs.createIndex({ isPubliclyVisible: 1, publishedAt: -1 }, { background: true });
```

The indexes that matter most, and why:

- `{isPubliclyVisible: 1, ...}` — every public compound index leads with this field because
  it appears in 100% of public queries and eliminates most documents immediately. Without it
  the public job list is a collection scan.
- `{job: 1, applicant: 1}` **unique** — this is what makes "one application per job" a
  database guarantee rather than a racy service check. Do not drop it.
- `{recipient: 1, dedupeKey: 1}` **partial** on `dedupeKey: {$type: 'string'}`. Not sparse —
  a compound sparse index still indexes rows where only one field is missing, which would
  collide every notification that has no dedupe key.

---

## 6. Health checks and probes

| Endpoint | Use |
|---|---|
| `GET /api/v1/health` | Liveness. No dependency checks — a liveness probe that fails when Mongo hiccups restarts a healthy process. |
| `GET /api/v1/health/ready` | Readiness. Checks Mongo and Redis. |
| `GET /api/v1/admin/health/visibility` | **The invariant.** Admin-only. Runs the nightly reconciliation in dry-run mode. |

That last one deserves a monitor. A non-zero `drifted` count means some write path let the
visibility flag disagree with the truth — the failure mode that would break the product's
core promise. Alert on `wronglyVisible > 0` specifically: that direction is a leaked listing.

```bash
# Suggested alert, hourly
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.example.com/api/v1/admin/health/visibility \
  | jq -e '.data.wronglyVisible == 0'
```

---

## 7. Backups

Mongo is the only durable state. Cloudinary holds resumes and KYC documents and has its own
retention.

- **Point-in-time recovery** on Atlas, or `mongodump` on a schedule with off-site copies.
- **Test the restore.** An untested backup is a hypothesis.
- The `auditlogs` collection is append-only and never expires. It is the record of every
  moderation decision — if a company disputes a rejection, this is the answer. Do not include
  it in any TTL or cleanup policy.

Notifications are the exception: they carry a 90-day TTL index and a nightly purge, because
they are transient pointers at records that are themselves durable.

---

## 8. Zero-downtime deploys

The API is stateless — the access token lives in memory on the client and the refresh token
is a signed cookie, so a rolling restart drops nothing.

The worker is not. `SIGTERM` triggers a graceful shutdown that stops cron first, then drains
in-flight BullMQ jobs, then closes connections, with a 15-second force-exit backstop. Give
your orchestrator a `terminationGracePeriodSeconds` of at least 20 or a resume being parsed
during a deploy is left stuck in `PARSING` forever.

---

## 9. Security checklist before going live

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are different, ≥32 chars, from a CSPRNG
- [ ] `NODE_ENV=production` — enables secure cookies and disables Swagger
- [ ] `TRUST_PROXY=true` and the proxy actually sets `X-Forwarded-For`
- [ ] `CORS_ORIGINS` lists only real origins
- [ ] `REDIS_URL` set, so rate limits are shared across replicas
- [ ] TLS terminated before the API; HSTS on
- [ ] The seeded admin password is strong and stored in a secrets manager, not `.env`
- [ ] `npm audit --production` is clean
- [ ] Cloudinary resume and document folders are `authenticated`, not `upload` — a public
      resume URL is a permanent, unrevocable leak of someone's phone number and address
- [ ] Backup restore has been tested end to end

---

## 10. What to watch

| Signal | Why it matters |
|---|---|
| `wronglyVisible > 0` on the visibility check | A hidden listing leaked into public results |
| Verification queue depth and oldest wait | Manual review is the product; if it becomes the bottleneck the whole promise degrades to "your listing goes live next week" |
| `Rate limiter using in-memory store` warnings | Redis is down; quotas are per-process |
| `could not start a session` warnings | Mongo is not a replica set — transactions are silently not atomic |
| Resume `parseStatus: FAILED` rate | A spike usually means Cloudinary or the extractor, not the resumes |
| 5xx rate by `requestId` | Every response carries one; it is how a user report becomes a log line |
