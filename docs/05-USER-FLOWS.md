# 05 — User Flows

---

## 1. Role Selection & Onboarding

```mermaid
flowchart TD
    A[Landing Page] --> B{Has account?}
    B -->|No| C[Sign Up]
    B -->|Yes| L[Login]
    C --> D{Choose role}
    D -->|Candidate| E[Candidate form]
    D -->|Employer| F[Employer form + company name]
    E --> G[Verify email]
    F --> G
    G -->|link clicked| H{Role?}
    H -->|Candidate| I[Onboarding: upload resume]
    H -->|Employer| J[Onboarding: company verification wizard]
    I --> I2[Parsed-draft review screen]
    I2 --> I3[Candidate Dashboard]
    J --> J2[Status: PENDING REVIEW]
    J2 --> J3["Employer Dashboard<br/>(locked state — job posting disabled)"]
    L --> H
```

**Design decision:** an employer lands on a **functional but locked** dashboard, not an error
page. It shows the verification checklist, what's missing, expected review time, and a preview of
what unlocks. Blocking users with a bare 403 is the fastest way to lose them.

---

## 2. ★ Employer Verification (Gate 1)

```mermaid
sequenceDiagram
    autonumber
    actor E as Employer
    participant API
    participant DB
    actor A as Admin
    participant N as Notification/Email

    E->>API: PATCH /employers/me (company details)
    E->>API: POST /employers/me/documents (incorporation, GST, ID)
    E->>API: POST /employers/me/verification
    API->>API: guard: all mandatory fields + ≥1 document
    API->>DB: employer.verificationStatus = PENDING
    API->>DB: insert verificationRequest (immutable snapshot)
    API->>N: notify all admins — "New employer awaiting review"
    API-->>E: 200 {status: PENDING, submittedAt}

    A->>API: GET /admin/employers?status=PENDING
    A->>API: GET /admin/employers/:id
    Note over A: Reviews checklist:<br/>name · live website · email domain match<br/>LinkedIn · documents · identity · GST

    alt APPROVE
        A->>API: POST /admin/employers/:id/verify {checklist}
        API->>DB: BEGIN TXN
        API->>DB: verificationStatus = VERIFIED
        API->>DB: verificationRequest.decision = APPROVED
        API->>DB: jobs.updateMany(approved+in-deadline → isPubliclyVisible: true)
        API->>DB: auditLog EMPLOYER_VERIFIED
        API->>DB: COMMIT
        API->>N: email + in-app "You're verified — start posting"
    else REJECT
        A->>API: POST /admin/employers/:id/reject {reason, category}
        API->>DB: verificationStatus = REJECTED + reason
        API->>DB: jobs.updateMany(→ isPubliclyVisible: false)
        API->>N: email + in-app with the **exact reason**
        Note over E: Fix issues → resubmit (attemptCount++)
    end
```

---

## 3. ★ Job Posting & Approval (Gate 2)

```mermaid
flowchart TD
    S([Employer clicks Post a Job]) --> V{Company VERIFIED?}
    V -->|No| VX["Blocked screen:<br/>verification status + CTA<br/>403 EMPLOYER_NOT_VERIFIED"]
    V -->|Yes| F[Multi-step job form<br/>1 Basics · 2 Details · 3 Requirements · 4 Compensation · 5 Review]
    F --> SD[Save as DRAFT<br/>autosave every 30s]
    SD --> SUB[Submit for review]
    SUB --> P["Status: PENDING<br/>❗ NOT publicly visible"]
    P --> AN[Admins notified]
    AN --> AR[Admin opens job review]
    AR --> AD{Decision}
    AD -->|Approve| AP["status = APPROVED<br/>isPubliclyVisible = true<br/>publishedAt = now"]
    AD -->|Reject| RJ["status = REJECTED<br/>+ reason + category"]
    AP --> PUB([🌐 Live on public job board])
    AP --> NE1[Notify employer: Job approved]
    RJ --> NE2[Notify employer with reason]
    NE2 --> ED[Employer edits] --> SUB
    PUB --> EDIT{Employer edits later?}
    EDIT -->|Material fields<br/>title/desc/salary/skills| P
    EDIT -->|Cosmetic only| PUB
    PUB --> EXP{Deadline passed?}
    EXP -->|Yes, hourly cron| ARC[ARCHIVED + hidden]
```

> **The material-vs-cosmetic edit rule matters.** Without it, a fraudster gets one clean job
> approved and then rewrites it into a scam. The list of material fields is explicit in
> `job.service.js#MATERIAL_FIELDS` and any change to it re-enters the queue.

---

## 4. Candidate Resume Upload → Profile Autofill

```mermaid
flowchart TD
    A[Candidate opens Profile] --> B[Drag & drop resume]
    B --> C{Client checks:<br/>type + ≤5MB}
    C -->|Fail| CX[Inline error, no request sent]
    C -->|Pass| D[POST multipart]
    D --> E[Server: magic-byte + MIME + size]
    E --> F[Cloudinary authenticated upload]
    F --> G[202 Accepted + enqueue]
    G --> H["UI: skeleton + 'Analyzing your resume…'<br/>polls /resume/status"]
    H --> I[Worker: pdf-parse / mammoth → text]
    I --> J["Deterministic extractors<br/>email · phone · URLs · sections<br/>skills ∩ taxonomy · dates"]
    J --> K{LLM enabled?}
    K -->|Yes| L[LLM structuring → merge<br/>deterministic wins on conflict]
    K -->|No| M[Draft ready]
    L --> M
    M --> N[parsedDraft saved + notification]
    N --> O["★ REVIEW SCREEN<br/>side-by-side: Current | Extracted<br/>per-field ✓ accept / ✗ ignore<br/>confidence indicator"]
    O --> P[Accept selected fields]
    P --> Q["Merge → live profile<br/>source = USER on accepted fields"]
    Q --> R[Completeness meter updates]
    O --> S[Ignore all → profile untouched]
```

**The rule the brief demands:** *"Never force AI extracted values."* Nothing from the parser ever
reaches the live profile without an explicit click. Fields the candidate has already edited by
hand are shown as "you've customised this" and are **not** pre-checked for overwrite.

---

## 5. Candidate Applies to a Job

```mermaid
sequenceDiagram
    actor C as Candidate
    participant UI
    participant API
    participant DB
    actor E as Employer

    C->>UI: Clicks Apply
    UI->>UI: guard — logged in? email verified? resume on file?
    alt missing resume
        UI-->>C: Modal "Upload a resume to apply" → profile
    end
    UI->>C: Apply modal (resume preview, cover letter, expected salary, notice period)
    C->>API: POST /applications
    API->>DB: BEGIN TXN
    API->>DB: re-check job.isPubliclyVisible (may have changed since page load)
    API->>DB: insert application (unique job+applicant)
    API->>DB: job.stats.applications++
    API->>DB: timeline.push(APPLIED)
    API->>DB: COMMIT
    API->>E: notification APPLICATION_RECEIVED
    API-->>C: 201 + optimistic cache update
    Note over C: Application tracker shows stage 1 of 6

    E->>API: GET /jobs/:id/applications
    E->>API: POST /applications/:id/view      → VIEWED  → notify C
    E->>API: POST /applications/:id/shortlist → SHORTLISTED → notify C
    E->>API: POST /applications/:id/interview → INTERVIEW + schedule → notify C
    E->>API: PATCH /applications/:id/status {HIRED}
```

### Application timeline as the candidate sees it
```
● Applied          31 Jul 2026, 10:04    You applied to this job
● Viewed           31 Jul 2026, 14:22    Employer viewed your application
● Shortlisted       1 Aug 2026, 09:10    You've been shortlisted 🎉
◉ Interview         3 Aug 2026, 11:00    Round 1 · Online · Join link
○ Offer                                  —
```

---

## 6. Employer Searches the Candidate Database

```mermaid
flowchart LR
    A[Employer opens Candidate Search] --> B{VERIFIED?}
    B -->|No| X[Locked state]
    B -->|Yes| C[Filter panel]
    C --> D["skills · experience range · location<br/>max salary · notice period<br/>availability · openToWork · education"]
    D --> E[GET /search/candidates]
    E --> F["Server filters to:<br/>openToWork = true<br/>AND visibility ≠ PRIVATE<br/>AND status = ACTIVE"]
    F --> G[Result cards: name, headline, skills, exp, location, availability]
    G --> H{Action}
    H --> I[View full profile]
    H --> J[Download resume → audit-logged]
    H --> K[Bookmark]
    H --> L[Invite to apply → notification]
```

**Privacy rule:** email and phone are **masked** (`r•••@gmail.com`) until the candidate has
applied to one of that employer's jobs or has been shortlisted. Candidates control exposure with
the `openToWork` toggle and `profileVisibility` setting.

---

## 7. Admin Moderation Loop

```mermaid
flowchart TD
    A[Admin Dashboard] --> B{Queues}
    B --> C["Pending Employers (n)"]
    B --> D["Pending Jobs (n)"]
    B --> E["Open Reports (n)"]
    C --> C1[Review: docs, website, domain match] --> C2{Verify / Reject / Request info}
    D --> D1[Review: content, salary sanity, duplicates, employer standing] --> D2{Approve / Reject}
    E --> E1[Review report + evidence] --> E2{Dismiss / Warn / Suspend / Delete}
    C2 --> Z[Audit log + notification]
    D2 --> Z
    E2 --> Z
    Z --> A
```

Every decision writes `{actor, action, entityId, before, after, reason, ip, at}` to `auditLogs`.
The dashboard's "Recent Activity" feed is a projection of that collection — one source of truth,
no parallel bookkeeping.

---

## 8. Session Lifecycle (happy + attack paths)

```mermaid
flowchart TD
    L[Login] --> A["access 15m (memory)<br/>refresh 7d (httpOnly cookie)"]
    A --> R{Access expired?}
    R -->|No| U[Use API]
    R -->|Yes| RF[POST /auth/refresh]
    RF --> V{Refresh valid & unrevoked?}
    V -->|Yes| RT[Rotate: revoke old, issue new] --> A
    V -->|Expired| LO[Logout → /login?reason=expired]
    V -->|★ Already revoked| BR["REUSE DETECTED<br/>revoke entire family<br/>SECURITY audit log<br/>email the user"] --> LO
    U --> PW{Password changed elsewhere?}
    PW -->|Yes| INV["JWT iat < passwordChangedAt<br/>→ 401 on next call"] --> LO
```

---

## 9. Notification Triggers (17 events)

| Event | → Candidate | → Employer | → Admin |
|---|---|---|---|
| `EMPLOYER_SUBMITTED_VERIFICATION` | | ✔ ack | ✔ new in queue |
| `EMPLOYER_VERIFIED` | | ✔ 🎉 | |
| `EMPLOYER_REJECTED` | | ✔ + reason | |
| `EMPLOYER_SUSPENDED` | | ✔ + reason | |
| `JOB_SUBMITTED` | | ✔ ack | ✔ new in queue |
| `JOB_APPROVED` | | ✔ + live link | |
| `JOB_REJECTED` | | ✔ + reason | |
| `JOB_EXPIRING_SOON` (3 days) | | ✔ | |
| `JOB_EXPIRED` | | ✔ | |
| `APPLICATION_RECEIVED` | | ✔ | |
| `APPLICATION_VIEWED` | ✔ | | |
| `APPLICATION_SHORTLISTED` | ✔ 🎉 | | |
| `INTERVIEW_SCHEDULED` | ✔ + details | | |
| `APPLICATION_REJECTED` | ✔ (kind copy) | | |
| `APPLICATION_HIRED` | ✔ 🎉 | | |
| `PASSWORD_CHANGED` | ✔ | ✔ | ✔ |
| `NEW_MATCHING_JOB` (digest) | ✔ | | |

Channels per event are configured in one table (`notificationConfig.js`) — `{inApp, email}` —
so muting email for a type is a data change, not a code change.
