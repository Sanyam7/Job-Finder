# 02 — Folder Structure

Root is an **npm-workspaces monorepo** (ADR-002). One `npm install` at root wires everything.

```
job-portal/
├── client/                  React SPA
├── server/                  Express API + worker
├── shared/                  Contract package imported by BOTH
├── docs/                    This architecture package
├── docker/                  Dockerfiles + nginx conf
├── .github/workflows/       CI: lint · typecheck · test · build
├── docker-compose.yml
├── docker-compose.prod.yml
├── package.json             workspaces: ["client","server","shared"]
├── .editorconfig  .gitignore  .nvmrc
└── README.md
```

---

## 1. `shared/` — the contract package

Prevents drift between frontend and backend string literals.

```
shared/
├── constants/
│   ├── roles.js               ROLES = { GUEST, CANDIDATE, EMPLOYER, ADMIN }
│   ├── jobStatus.js           DRAFT · PENDING · APPROVED · REJECTED · ARCHIVED
│   ├── applicationStatus.js   APPLIED · VIEWED · SHORTLISTED · INTERVIEW · REJECTED · HIRED
│   ├── verificationStatus.js  UNSUBMITTED · PENDING · VERIFIED · REJECTED
│   ├── accountStatus.js       ACTIVE · SUSPENDED · DELETED
│   ├── employmentType.js      FULL_TIME · PART_TIME · CONTRACT · INTERNSHIP · FREELANCE
│   ├── workMode.js            REMOTE · HYBRID · ONSITE
│   ├── notificationType.js    17 event types
│   ├── errorCodes.js          machine-readable API error codes
│   ├── fieldSource.js         USER · PARSER · AI      ← ADR-006 provenance
│   └── brand.js               app name, tagline, support email
├── validation/
│   ├── patterns.js            email, phone, url, linkedin, github, gst, objectId regex
│   └── limits.js              MAX_RESUME_MB, MAX_SKILLS, MIN_PASSWORD_LEN, PAGE_SIZE_MAX
├── utils/
│   ├── slugify.js
│   └── salary.js              formatting + range normalisation (both sides must agree)
├── types/
│   └── index.js               JSDoc @typedef for every DTO (ADR-001)
├── index.js
└── package.json               "name": "@jobportal/shared"
```

---

## 2. `server/` — backend

```
server/
├── src/
│   ├── app.js                    express app assembly (no listen)
│   ├── server.js                 http server, graceful shutdown
│   ├── worker.js                 BullMQ consumers + cron bootstrap
│   │
│   ├── config/
│   │   ├── env.js                ★ boot-time env validation, fail-fast
│   │   ├── database.js           Mongoose connect, retry, event logging
│   │   ├── redis.js              ioredis client + fallback shim
│   │   ├── cloudinary.js
│   │   ├── mailer.js             nodemailer transport
│   │   ├── logger.js             Winston + daily-rotate
│   │   ├── cors.js               origin whitelist builder
│   │   ├── rateLimit.js          limiter factory (Redis store)
│   │   ├── multer.js             storage, fileFilter, limits
│   │   ├── swagger.js            OpenAPI 3 doc assembly
│   │   └── index.js
│   │
│   ├── constants/
│   │   ├── httpStatus.js
│   │   ├── messages.js           every user-facing string, one place
│   │   ├── permissions.js        PERMISSIONS + ROLE_PERMISSIONS matrix
│   │   ├── events.js             EVENTS.JOB_APPROVED = 'job.approved' …
│   │   ├── queues.js             QUEUES.RESUME_PARSE, QUEUES.EMAIL
│   │   └── cacheKeys.js
│   │
│   ├── models/
│   │   ├── schemas/              ← reusable sub-schemas (ADR-009)
│   │   │   ├── address.schema.js
│   │   │   ├── experience.schema.js
│   │   │   ├── education.schema.js
│   │   │   ├── project.schema.js
│   │   │   ├── certification.schema.js
│   │   │   ├── salaryRange.schema.js
│   │   │   ├── document.schema.js        (cloudinary asset ref)
│   │   │   └── tracedField.schema.js     ({value, source, confidence})
│   │   ├── plugins/
│   │   │   ├── softDelete.plugin.js      deletedAt + query pre-hooks
│   │   │   ├── timestamps.plugin.js
│   │   │   ├── paginate.plugin.js        cursor + offset pagination
│   │   │   └── toJSON.plugin.js          strips __v, _id→id, hides secrets
│   │   ├── user.model.js
│   │   ├── candidateProfile.model.js
│   │   ├── employerProfile.model.js
│   │   ├── job.model.js
│   │   ├── application.model.js
│   │   ├── notification.model.js
│   │   ├── skill.model.js
│   │   ├── bookmark.model.js
│   │   ├── verificationRequest.model.js
│   │   ├── report.model.js
│   │   ├── auditLog.model.js
│   │   ├── refreshToken.model.js
│   │   ├── verificationToken.model.js    email verify + password reset
│   │   ├── contactMessage.model.js
│   │   └── index.js
│   │
│   ├── dtos/                     ← request→domain and domain→response mappers
│   │   ├── request/
│   │   │   ├── auth.request.dto.js
│   │   │   ├── job.request.dto.js
│   │   │   ├── candidate.request.dto.js
│   │   │   ├── employer.request.dto.js
│   │   │   └── search.request.dto.js     query-string → typed criteria object
│   │   └── response/
│   │       ├── user.response.dto.js
│   │       ├── job.response.dto.js       ★ public vs owner vs admin projections
│   │       ├── candidate.response.dto.js ★ public vs employer vs self projections
│   │       ├── employer.response.dto.js
│   │       ├── application.response.dto.js
│   │       └── notification.response.dto.js
│   │
│   ├── repositories/             ← ONLY layer that builds Mongoose queries
│   │   ├── base.repository.js    generic CRUD + pagination + soft delete
│   │   ├── user.repository.js
│   │   ├── candidate.repository.js
│   │   ├── employer.repository.js
│   │   ├── job.repository.js     ★ buildPublicJobFilter() lives here
│   │   ├── application.repository.js
│   │   ├── notification.repository.js
│   │   ├── bookmark.repository.js
│   │   ├── skill.repository.js
│   │   ├── report.repository.js
│   │   ├── auditLog.repository.js
│   │   ├── token.repository.js
│   │   └── analytics.repository.js   aggregation pipelines for admin dashboard
│   │
│   ├── services/                 ← business rules; no req/res
│   │   ├── auth.service.js
│   │   ├── token.service.js          issue/rotate/revoke, family reuse detection
│   │   ├── user.service.js
│   │   ├── candidate.service.js
│   │   ├── employer.service.js
│   │   ├── verification.service.js   ★ employer verification workflow
│   │   ├── job.service.js            ★ job lifecycle + approval workflow
│   │   ├── application.service.js    ★ status machine + timeline
│   │   ├── search.service.js         jobs + candidates
│   │   ├── notification.service.js
│   │   ├── email.service.js          template render + queue
│   │   ├── upload.service.js         cloudinary put/sign/destroy
│   │   ├── resumeParser.service.js   pdf-parse/mammoth → structured draft
│   │   ├── llmEnrichment.service.js  optional, provider-agnostic adapter
│   │   ├── admin.service.js
│   │   ├── analytics.service.js
│   │   ├── audit.service.js
│   │   └── cache.service.js
│   │
│   ├── controllers/              ← thin: parse → call service → respond
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   ├── candidate.controller.js
│   │   ├── employer.controller.js
│   │   ├── job.controller.js
│   │   ├── application.controller.js
│   │   ├── search.controller.js
│   │   ├── bookmark.controller.js
│   │   ├── notification.controller.js
│   │   ├── admin.controller.js
│   │   ├── analytics.controller.js
│   │   ├── report.controller.js
│   │   ├── public.controller.js
│   │   └── health.controller.js
│   │
│   ├── routes/
│   │   └── v1/
│   │       ├── index.js          mounts all v1 routers
│   │       ├── auth.routes.js
│   │       ├── candidate.routes.js
│   │       ├── employer.routes.js
│   │       ├── job.routes.js
│   │       ├── application.routes.js
│   │       ├── search.routes.js
│   │       ├── bookmark.routes.js
│   │       ├── notification.routes.js
│   │       ├── admin.routes.js
│   │       ├── public.routes.js
│   │       ├── upload.routes.js
│   │       └── health.routes.js
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.js            authenticate, optionalAuth
│   │   ├── rbac.middleware.js            authorize(...roles), can(permission)
│   │   ├── verifiedEmployer.middleware.js  ★ the USP write-gate
│   │   ├── verifiedEmail.middleware.js
│   │   ├── ownership.middleware.js       isOwnerOf(resource)
│   │   ├── validate.middleware.js        express-validator result → 422
│   │   ├── upload.middleware.js          multer + magic-byte sniffing
│   │   ├── rateLimit.middleware.js
│   │   ├── sanitize.middleware.js
│   │   ├── requestId.middleware.js
│   │   ├── notFound.middleware.js
│   │   └── error.middleware.js           ★ single global handler
│   │
│   ├── validators/               express-validator rule sets
│   │   ├── auth.validator.js
│   │   ├── candidate.validator.js
│   │   ├── employer.validator.js
│   │   ├── job.validator.js
│   │   ├── application.validator.js
│   │   ├── search.validator.js
│   │   ├── admin.validator.js
│   │   └── common.validator.js   objectId, pagination, sort, date
│   │
│   ├── errors/
│   │   ├── ApiError.js           base (statusCode, code, details, isOperational)
│   │   ├── BadRequestError.js    400
│   │   ├── UnauthorizedError.js  401
│   │   ├── ForbiddenError.js     403
│   │   ├── NotFoundError.js      404
│   │   ├── ConflictError.js      409
│   │   ├── ValidationError.js    422
│   │   ├── TooManyRequestsError.js 429
│   │   └── index.js
│   │
│   ├── events/
│   │   ├── eventBus.js
│   │   ├── subscribers/
│   │   │   ├── notification.subscriber.js
│   │   │   ├── email.subscriber.js
│   │   │   └── audit.subscriber.js
│   │   └── index.js              registerSubscribers()
│   │
│   ├── jobs/                     BullMQ producers + processors
│   │   ├── queues.js
│   │   ├── producers/{email,resumeParse,bulkNotify}.producer.js
│   │   └── processors/{email,resumeParse,bulkNotify}.processor.js
│   │
│   ├── cron/
│   │   ├── index.js
│   │   ├── expireJobs.cron.js            deadline passed → ARCHIVED
│   │   ├── purgeTokens.cron.js           expired refresh/verify tokens
│   │   ├── reconcileVisibility.cron.js   ★ repairs isPubliclyVisible drift
│   │   ├── pendingQueueDigest.cron.js    nightly admin digest
│   │   └── cleanupSoftDeleted.cron.js    hard-delete after 90 days
│   │
│   ├── helpers/
│   │   ├── pagination.helper.js
│   │   ├── sort.helper.js
│   │   ├── queryBuilder.helper.js
│   │   ├── slug.helper.js
│   │   ├── diff.helper.js        before/after for audit log
│   │   └── otp.helper.js
│   │
│   ├── utils/
│   │   ├── apiResponse.js        ★ response wrapper
│   │   ├── asyncHandler.js
│   │   ├── jwt.util.js
│   │   ├── password.util.js
│   │   ├── crypto.util.js        sha256, randomToken
│   │   ├── date.util.js
│   │   ├── file.util.js          magic-byte MIME detection
│   │   └── logger.util.js
│   │
│   ├── database/
│   │   ├── connect.js
│   │   ├── transaction.js        withTransaction(fn)
│   │   ├── seeders/{admin,skills,demoData}.seeder.js
│   │   └── migrations/           timestamped, run by npm script
│   │
│   ├── templates/emails/         handlebars: verify, reset, jobApproved,
│   │                             jobRejected, employerApproved, …
│   └── docs/openapi/             *.yaml fragments → swagger.js
│
├── tests/
│   ├── unit/{services,repositories,utils}/
│   ├── integration/{auth,jobs,applications,admin}.test.js
│   ├── fixtures/  factories/  setup.js       (mongodb-memory-server)
├── logs/                         gitignored, winston output
├── uploads/                      gitignored, temp only — Cloudinary is canonical
├── .env.example  jsconfig.json  .eslintrc.json  .prettierrc  jest.config.js
└── package.json
```

---

## 3. `client/` — frontend

```
client/
├── public/                       favicon, robots.txt, og-image
├── src/
│   ├── main.jsx                  providers: Store→Persist→Query→Router→Theme→Toast
│   ├── App.jsx                   <AppRoutes/>
│   │
│   ├── api/                      ← transport layer only, zero React
│   │   ├── axiosClient.js        ★ instance + auth/refresh-queue interceptors
│   │   ├── endpoints.js          every URL string, one place
│   │   └── services/
│   │       ├── auth.api.js       candidate.api.js  employer.api.js
│   │       ├── job.api.js        application.api.js  search.api.js
│   │       ├── admin.api.js      notification.api.js  upload.api.js
│   │
│   ├── app/
│   │   ├── store.js              configureStore + persist
│   │   ├── rootReducer.js
│   │   └── queryClient.js        TanStack defaults + global error toast
│   │
│   ├── features/                 ← vertical slices (the primary organising axis)
│   │   ├── auth/
│   │   │   ├── components/       LoginForm, SignupForm, RoleSelectCard, OtpBox
│   │   │   ├── hooks/            useLogin, useSignup, useForgotPassword
│   │   │   ├── slices/authSlice.js
│   │   │   └── index.js
│   │   ├── jobs/
│   │   │   ├── components/       JobCard, JobFilters, JobDetailHeader,
│   │   │   │                     SalaryBadge, VerifiedBadge, JobSkeleton
│   │   │   ├── hooks/            useJobsQuery, useJobQuery, useJobMutations
│   │   │   ├── slices/jobFilterSlice.js
│   │   ├── applications/         ApplicationCard, StatusTimeline, StageBadge,
│   │   │                         ApplyModal, useApplications
│   │   ├── candidate/            ProfileHeader, ExperienceEditor, EducationEditor,
│   │   │                         SkillPicker, ResumeUploader,
│   │   │                         ★ ParsedFieldReview, CompletenessMeter
│   │   ├── employer/             CompanyForm, VerificationWizard, VerificationStatusCard,
│   │   │                         JobForm, ApplicantTable, CandidateSearchPanel
│   │   ├── admin/                StatCard, EmployerReviewCard, DocumentViewer,
│   │   │                         JobReviewCard, RejectReasonDialog, AuditTable,
│   │   │                         charts/{SignupChart,StatusPie,FunnelChart}
│   │   ├── notifications/        NotificationBell, NotificationItem, useNotifications
│   │   └── search/               SearchBar, FilterSidebar, ActiveFilterChips, SortSelect
│   │
│   ├── components/
│   │   ├── ui/                   ← design-system primitives (dumb, reusable)
│   │   │   Button Input Select Textarea Checkbox Radio Switch Badge Avatar
│   │   │   Card Modal Drawer Dropdown Tooltip Tabs Table Pagination Toast
│   │   │   Spinner Skeleton ProgressBar Chip DatePicker FileDropzone
│   │   │   RangeSlider Accordion Breadcrumb Stepper ThemeToggle
│   │   ├── common/               ← composed, app-aware
│   │   │   PageHeader EmptyState ErrorState ConfirmDialog DataTable
│   │   │   SectionCard StatusBadge VerifiedTick InfiniteScroller
│   │   │   SEO ScrollToTop ErrorBoundary
│   │   └── layouts/
│   │       PublicLayout CandidateLayout EmployerLayout AdminLayout AuthLayout
│   │       (+ Navbar, Sidebar, Footer, TopBar, MobileNav)
│   │
│   ├── pages/                    ← route endpoints; compose features, hold no logic
│   │   ├── public/               Home About HowItWorks Features WhyVerified
│   │   │                         Contact Faq BrowseJobs JobDetail Companies
│   │   │                         CompanyDetail NotFound
│   │   ├── auth/                 Login Signup VerifyEmail ForgotPassword
│   │   │                         ResetPassword
│   │   ├── candidate/            Dashboard Profile ProfileEdit ResumeReview
│   │   │                         MyApplications ApplicationDetail SavedJobs
│   │   │                         Recommended Settings
│   │   ├── employer/             Dashboard CompanyProfile Verification
│   │   │                         Jobs JobCreate JobEdit JobApplicants
│   │   │                         CandidateSearch CandidateProfile Bookmarks Settings
│   │   └── admin/                Dashboard EmployerQueue EmployerDetail
│   │                             JobQueue JobDetail Users UserDetail
│   │                             Reports AuditLogs Analytics Settings
│   │
│   ├── routes/
│   │   ├── AppRoutes.jsx         lazy() + Suspense per portal
│   │   ├── ProtectedRoute.jsx    auth gate
│   │   ├── RoleRoute.jsx         RBAC gate
│   │   ├── PublicOnlyRoute.jsx   redirect if already logged in
│   │   ├── VerifiedEmployerRoute.jsx  ★ USP gate on the client
│   │   └── paths.js              ROUTES constant map — no hardcoded strings
│   │
│   ├── hooks/                    useAuth useDebounce useTheme useMediaQuery
│   │                             useOnClickOutside useLocalStorage usePagination
│   │                             useInfiniteScroll useQueryParams useConfirm
│   │                             useCopyToClipboard useDocumentTitle
│   ├── contexts/                 ThemeContext ToastContext ConfirmDialogContext
│   │                             SidebarContext
│   ├── validations/              Yup schemas: auth, candidate, employer, job,
│   │                             application, search, contact
│   ├── constants/                navLinks, filterOptions, statusMaps,
│   │                             queryKeys.js ★, chartConfig
│   ├── utils/                    formatDate formatSalary formatExperience
│   │                             truncate initials cn (clsx+twMerge)
│   │                             downloadFile buildQueryString
│   ├── config/                   env.js (import.meta.env accessors), theme.js
│   ├── styles/                   index.css (tailwind layers), animations.css,
│   │                             tokens.css (CSS custom props for theming)
│   └── assets/                   images/ icons/ illustrations/ fonts/
│
├── index.html  vite.config.js  tailwind.config.js  postcss.config.js
├── jsconfig.json  .eslintrc.json  .env.example  package.json
```

### Why `features/` **and** `pages/` **and** `components/`

| Folder | Rule | Test |
|---|---|---|
| `components/ui` | Knows nothing about jobs, users, or the API. Pure props. | Could ship to npm unchanged |
| `components/common` | Knows app conventions, still domain-agnostic | Used by ≥2 features |
| `features/*` | Owns a domain: its components, hooks, slice, and query keys | Deleting the folder removes the whole feature |
| `pages/*` | Route-level composition + layout only. **No `useState` for server data.** | Should read like a table of contents |

This is the boundary that keeps a 200-component app navigable. A reviewer looking for
"how does shortlisting work" opens `features/applications/` and finds everything.
