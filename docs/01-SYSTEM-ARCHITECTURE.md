# 01 — System Architecture

---

## 1. Context Diagram (C4 — Level 1)

```mermaid
graph TB
    Guest([Guest / Visitor])
    Candidate([Candidate])
    Employer([Employer])
    Admin([Admin])

    subgraph Platform["VeriHire Platform"]
        SPA["React SPA<br/>(Vite build, served by Nginx/CDN)"]
        API["Express REST API<br/>/api/v1 — stateless"]
        Worker["Background Worker<br/>BullMQ consumers + cron"]
    end

    Mongo[("MongoDB<br/>primary datastore")]
    Redis[("Redis<br/>queues · rate limit · cache")]
    Cloud["Cloudinary<br/>resumes (authenticated)<br/>logos (public)"]
    Mail["SMTP / Email Provider"]
    LLM["LLM API (optional)<br/>resume enrichment"]

    Guest --> SPA
    Candidate --> SPA
    Employer --> SPA
    Admin --> SPA

    SPA -->|HTTPS + JWT + httpOnly cookie| API
    API --> Mongo
    API --> Redis
    API --> Cloud
    API -.enqueue.-> Redis
    Redis -.dequeue.-> Worker
    Worker --> Mongo
    Worker --> Cloud
    Worker --> Mail
    Worker --> LLM

    style Platform fill:#0f172a,stroke:#38bdf8,color:#e2e8f0
```

**Key property:** the API process is **stateless**. Sessions live in MongoDB (hashed refresh
tokens), rate-limit counters in Redis, files in Cloudinary. Any API container can serve any
request, so scaling is `docker compose up --scale api=N` behind a load balancer.

---

## 2. Container Diagram (C4 — Level 2)

```mermaid
graph LR
    subgraph Client["client/ — React SPA"]
        direction TB
        Router["Route Guards<br/>PublicRoute · ProtectedRoute · RoleRoute"]
        Layouts["4 Layouts<br/>Public · Candidate · Employer · Admin"]
        Features["Feature Modules<br/>auth · jobs · applications ·<br/>profile · admin · search"]
        StateL["Redux Toolkit + Persist<br/>(session · UI · drafts)"]
        QueryL["TanStack Query<br/>(all server state)"]
        HTTP["Axios instance<br/>+ interceptors<br/>+ refresh queue"]
        Router --> Layouts --> Features
        Features --> StateL
        Features --> QueryL --> HTTP
    end

    subgraph Server["server/ — Express API"]
        direction TB
        MW["Global middleware chain"]
        Routes["v1 Routers"]
        Val["Validators<br/>(express-validator)"]
        Ctrl["Controllers<br/>(thin: req→DTO→service→respond)"]
        Svc["Services<br/>(business rules, transactions)"]
        Repo["Repositories<br/>(all query construction)"]
        Model["Mongoose Models"]
        Bus["EventBus"]
        MW --> Routes --> Val --> Ctrl --> Svc --> Repo --> Model
        Svc --> Bus
    end

    HTTP -->|"/api/v1/*"| MW
    Bus --> Subs["Subscribers<br/>notification · email · audit"]
```

---

## 3. Request Lifecycle (the middleware chain, in order)

```
   ┌─ INBOUND ────────────────────────────────────────────────────────────┐
   │                                                                      │
 1 │ helmet()                       → security headers, CSP, HSTS         │
 2 │ cors({ origin: whitelist, credentials: true })                       │
 3 │ compression()                                                        │
 4 │ express.json({ limit:'10kb' }) → body-size DoS guard                 │
 5 │ cookieParser(COOKIE_SECRET)                                          │
 6 │ mongoSanitize()                → strips $ and . from keys            │
 7 │ xss-clean / sanitize-html      → strips script payloads              │
 8 │ hpp()                          → HTTP parameter pollution guard      │
 9 │ requestId()                    → uuid → req.id, echoed as X-Req-Id   │
10 │ morgan(':id :method :url…')    → piped into Winston                  │
11 │ globalRateLimiter              → Redis store, per-IP                 │
   │                                                                      │
   │        ── PER-ROUTE ──                                               │
12 │   routeRateLimiter             → tighter on /auth/*                  │
13 │   authenticate                 → verifies access JWT → req.user      │
14 │   requireVerifiedEmail         → where applicable                    │
15 │   authorize(ROLES.EMPLOYER)    → RBAC                                │
16 │   requireVerifiedEmployer      → THE USP GATE (job-write routes)     │
17 │   upload.single('resume')      → Multer memory + MIME/magic check    │
18 │   validate([...rules])         → express-validator → 422 on fail     │
19 │   asyncHandler(controller)     → promise rejection → next(err)       │
   │                                                                      │
   └─ OUTBOUND ───────────────────────────────────────────────────────────┘
20 │ ApiResponse.success(res, …)    → uniform envelope
21 │ notFoundHandler                → 404 for unmatched routes
22 │ globalErrorHandler             → ApiError → envelope; leaks nothing in prod
```

Every numbered step is a real file in `server/src/middlewares/`. See
[08-BACKEND-ARCHITECTURE.md](08-BACKEND-ARCHITECTURE.md).

---

## 4. Authentication & Token Flow

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (SPA)
    participant A as API
    participant D as MongoDB

    Note over B,A: LOGIN
    B->>A: POST /auth/login {email, password}
    A->>D: find user, bcrypt.compare
    A->>D: insert refreshToken (SHA-256 hash, family=uuid)
    A-->>B: 200 {accessToken (15m), user}<br/>Set-Cookie: refreshToken (httpOnly, 7d)
    Note over B: accessToken → Redux memory ONLY<br/>(never persisted to localStorage)

    Note over B,A: NORMAL CALL
    B->>A: GET /jobs  (Authorization: Bearer …)
    A-->>B: 200

    Note over B,A: ACCESS TOKEN EXPIRES
    B->>A: GET /jobs  (expired)
    A-->>B: 401 TOKEN_EXPIRED
    Note over B: Axios interceptor pauses<br/>and QUEUES all concurrent 401s
    B->>A: POST /auth/refresh (cookie auto-sent)
    A->>D: hash(cookie) → lookup
    alt token valid & not revoked
        A->>D: revoke old, insert new (same family)
        A-->>B: 200 {accessToken}<br/>Set-Cookie: new refreshToken
        Note over B: interceptor replays the queue
    else token already revoked → REUSE DETECTED
        A->>D: revoke ENTIRE family
        A->>D: write SECURITY audit log
        A-->>B: 401 SESSION_REVOKED → hard logout
    end
```

**Refresh-queue detail (frontend):** a single in-flight refresh promise is shared by all pending
requests. Without this, 6 parallel 401s trigger 6 rotations and the reuse-detector logs the user
out — a classic and very confusing production bug. Implemented in
`client/src/api/axiosClient.js`.

---

## 5. The USP Flow — Two-Gate Verification

```mermaid
stateDiagram-v2
    direction LR

    state "EMPLOYER GATE" as EG {
        [*] --> E_PENDING: signs up + submits docs
        E_PENDING --> E_VERIFIED: admin approves
        E_PENDING --> E_REJECTED: admin rejects (+reason)
        E_REJECTED --> E_PENDING: employer resubmits
        E_VERIFIED --> E_SUSPENDED: admin suspends
        E_SUSPENDED --> E_VERIFIED: admin restores
    }

    state "JOB GATE" as JG {
        [*] --> J_DRAFT
        J_DRAFT --> J_PENDING: submit for review
        J_PENDING --> J_APPROVED: admin approves
        J_PENDING --> J_REJECTED: admin rejects (+reason)
        J_REJECTED --> J_PENDING: employer edits + resubmits
        J_APPROVED --> J_PENDING: employer edits material fields
        J_APPROVED --> J_ARCHIVED: employer closes / deadline passes
        J_ARCHIVED --> J_PENDING: reopen
    }

    EG --> JG: only E_VERIFIED<br/>may create jobs
```

**Two enforcement points, deliberately redundant (defence in depth):**

1. **Write-side** — `requireVerifiedEmployer` middleware rejects `POST/PUT /jobs` with `403
   EMPLOYER_NOT_VERIFIED` unless the company is `VERIFIED` and `ACTIVE`.
2. **Read-side** — `buildPublicJobFilter()` re-checks employer verification on every public read
   via a `$lookup`-free denormalised flag (`job.isPubliclyVisible`, maintained by the service
   layer + a nightly reconciliation cron).

> **Why redundant?** If an admin suspends a verified employer, that employer's already-approved
> jobs must vanish from public search *immediately*. Write-side checks can't do that
> retroactively. The read-side filter can. Suspension therefore triggers a bulk
> `jobs.updateMany({employer}, {isPubliclyVisible:false})` **and** the filter double-checks.

---

## 6. Resume Parsing Pipeline (ADR-006)

```mermaid
sequenceDiagram
    participant C as Candidate
    participant A as API
    participant Q as BullMQ (Redis)
    participant W as Worker
    participant CL as Cloudinary
    participant D as MongoDB

    C->>A: POST /candidates/me/resume (multipart)
    A->>A: Multer memory + magic-byte + size check
    A->>CL: upload (type=authenticated, folder=resumes/{userId})
    A->>D: profile.resume = {publicId, version, status:'PARSING'}
    A->>Q: enqueue resume-parse {profileId, publicId}
    A-->>C: 202 {status:'PARSING', pollUrl}
    Note over C: UI shows a skeleton + polls<br/>(or receives a notification)

    Q->>W: consume
    W->>CL: download buffer
    W->>W: pdf-parse / mammoth → raw text
    W->>W: deterministic extractors<br/>(email, phone, URLs, sections, skills∩taxonomy)
    opt LLM_ENABLED
        W->>W: LLM structuring → merge, prefer deterministic on conflict
    end
    W->>D: profile.parsedDraft = {...fields, confidence, source}
    W->>D: notification 'RESUME_PARSED'
    Note over C: Review screen: accept-all / per-field accept
    C->>A: PATCH /candidates/me/parsed-draft/apply {fields:[...]}
    A->>D: merge accepted → live profile, source='USER'
```

**Merge rule (non-negotiable):** applying a draft **never** overwrites a field whose current
`source === 'USER'` unless that exact field is explicitly listed in the accept payload. Re-parsing
a new resume version regenerates `parsedDraft` and touches nothing live.

---

## 7. Deployment Topology

```mermaid
graph TB
    U([Users]) --> CDN["CDN / Nginx<br/>static SPA + gzip + SPA fallback"]
    U --> LB["Load Balancer / Reverse Proxy<br/>TLS termination"]
    LB --> A1["api :5000"]
    LB --> A2["api :5000"]
    A1 --> M[("MongoDB Atlas<br/>replica set")]
    A2 --> M
    A1 --> R[("Redis")]
    A2 --> R
    R --> W1["worker<br/>(no public port)"]
    W1 --> M
    A1 --> CLD["Cloudinary"]
    W1 --> SMTP["SMTP"]
```

### docker-compose services

| Service | Image / build | Ports | Notes |
|---|---|---|---|
| `client` | multi-stage: node build → nginx:alpine | 80 | SPA fallback `try_files … /index.html` |
| `api` | node:20-alpine, non-root user | 5000 | healthcheck `GET /api/v1/health` |
| `worker` | same image, `CMD ["node","src/worker.js"]` | — | scales independently |
| `mongo` | mongo:7 | 27017 | named volume, dev only (Atlas in prod) |
| `redis` | redis:7-alpine | 6379 | AOF persistence |
| `mongo-express` | dev profile only | 8081 | `--profile dev` |

Images are multi-stage and run as a non-root `node` user; `.dockerignore` excludes
`node_modules`, `.env*`, `logs/`, `uploads/`.

---

## 8. Environment Configuration

All env vars are validated **at boot** by `server/src/config/env.js` (express-validator-style
schema). **The process refuses to start if a required var is missing or malformed** — no more
"undefined JWT secret" reaching production.

| Var | Required | Example / note |
|---|---|---|
| `NODE_ENV` | ✅ | `development` \| `production` \| `test` |
| `PORT` | | `5000` |
| `MONGO_URI` | ✅ | must start `mongodb` |
| `JWT_ACCESS_SECRET` | ✅ | ≥ 32 chars, enforced |
| `JWT_ACCESS_EXPIRY` | | `15m` |
| `JWT_REFRESH_SECRET` | ✅ | ≥ 32 chars, **must differ** from access secret |
| `JWT_REFRESH_EXPIRY` | | `7d` |
| `COOKIE_SECRET` | ✅ | |
| `CLIENT_URL` | ✅ | CORS whitelist + email deep links |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | ✅ | |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASS` / `EMAIL_FROM` | ✅ | |
| `REDIS_URL` | ⚠️ | absent → in-process queue + memory rate-limit (dev only, warns loudly) |
| `LLM_PROVIDER` / `LLM_API_KEY` | ❌ | absent → deterministic parser only |
| `ADMIN_SEED_EMAIL` / `_PASSWORD` | ✅ (first run) | consumed by `npm run seed:admin` |
| `BCRYPT_ROUNDS` | | `12` |
| `RATE_LIMIT_WINDOW_MS` / `_MAX` | | `900000` / `100` |

`.env.example` ships with every key documented and **no real values**. `.env` is gitignored.

---

## 9. Cross-Cutting Concerns

| Concern | Mechanism | Location |
|---|---|---|
| Logging | Winston (JSON in prod, pretty in dev) + Morgan stream, daily rotate, `requestId` on every line | `config/logger.js` |
| Error handling | `ApiError` hierarchy → single `globalErrorHandler` | `errors/`, `middlewares/error.middleware.js` |
| Response shape | `ApiResponse.success/paginated` wrapper | `utils/apiResponse.js` |
| Async errors | `asyncHandler` wrapper on every controller | `utils/asyncHandler.js` |
| Transactions | `withTransaction()` helper; used for apply-to-job, verification decisions | `database/transaction.js` |
| Caching | Redis `cache-aside` on public job list + company directory, 60 s TTL, invalidated on approve/archive | `services/cache.service.js` |
| Cron | `node-cron` in worker: expire deadlines, purge tokens, reconcile visibility flags, digest emails | `cron/` |
| Health | `/api/v1/health` (liveness) + `/health/ready` (Mongo + Redis ping) | `routes/health.routes.js` |
| Graceful shutdown | SIGTERM → stop accepting → drain in-flight → close Mongo/Redis → exit | `server.js` |
