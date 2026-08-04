# 07 — Frontend Architecture

---

## 1. Provider Composition (`main.jsx`)

Order matters — each layer depends on the one outside it.

```jsx
<React.StrictMode>
  <Provider store={store}>                        {/* Redux                     */}
    <PersistGate loading={<AppSplash/>} persistor={persistor}>
      <QueryClientProvider client={queryClient}>  {/* TanStack Query            */}
        <ThemeProvider>                           {/* dark mode, CSS vars       */}
          <BrowserRouter>
            <ToastProvider>
              <ConfirmDialogProvider>             {/* imperative confirm()      */}
                <ErrorBoundary fallback={<AppCrash/>}>
                  <App />
                </ErrorBoundary>
              </ConfirmDialogProvider>
            </ToastProvider>
          </BrowserRouter>
        </ThemeProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </PersistGate>
  </Provider>
</React.StrictMode>
```

---

## 2. Routing Map

All paths come from `routes/paths.js` — **no hardcoded route strings anywhere in the app.**

```
/                              PublicLayout    Home
/jobs                                          BrowseJobs
/jobs/:slug                                    JobDetail
/companies  /companies/:slug                   Companies · CompanyDetail
/about /how-it-works /features
/why-verified /faq /contact

/login /signup /verify-email
/forgot-password /reset-password   AuthLayout   (PublicOnlyRoute)

/candidate/*                   CandidateLayout  ProtectedRoute + RoleRoute[CANDIDATE]
  dashboard · profile · profile/edit · resume/review
  applications · applications/:id · saved · recommended · settings

/employer/*                    EmployerLayout   ProtectedRoute + RoleRoute[EMPLOYER]
  dashboard · company · verification            ← always reachable
  jobs · jobs/new · jobs/:id/edit               ← VerifiedEmployerRoute
  jobs/:id/applicants · candidates
  candidates/:id · bookmarks · settings         ← VerifiedEmployerRoute

/admin/*                       AdminLayout      ProtectedRoute + RoleRoute[ADMIN]
  dashboard · employers · employers/:id
  jobs · jobs/:id · users · users/:id
  reports · audit-logs · analytics · settings

*                              NotFound
```

### Guard composition

```jsx
<Route element={<ProtectedRoute />}>                        {/* has session?    */}
  <Route element={<RoleRoute allow={[ROLES.EMPLOYER]} />}>  {/* right role?     */}
    <Route element={<EmployerLayout />}>
      <Route path="verification" element={<Verification />} />   {/* always OK  */}
      <Route element={<VerifiedEmployerRoute />}>          {/* ★ the USP gate  */}
        <Route path="jobs/new" element={<JobCreate />} />
      </Route>
    </Route>
  </Route>
</Route>
```

`VerifiedEmployerRoute` redirects to `/employer/verification` with a toast rather than showing a
403 — the client mirrors the server gate, but the server remains the authority.

**Code splitting:** each portal is a `React.lazy()` chunk. A candidate never downloads the admin
dashboard or Recharts.

---

## 3. Component Hierarchy

```
App
└── AppRoutes
    ├── PublicLayout
    │   ├── Navbar ▸ Logo · NavLinks · SearchTrigger · ThemeToggle · AuthButtons/UserMenu
    │   ├── <Outlet/>
    │   │   ├── Home ▸ Hero(SearchBar) · StatsStrip · HowItWorksTimeline
    │   │   │        · WhyVerified · FeaturedJobs(JobCard[]) · Testimonials · FaqAccordion · CtaBand
    │   │   ├── BrowseJobs ▸ SearchHeader · FilterSidebar(FilterGroup[], RangeSlider,
    │   │   │                CheckboxList) · ActiveFilterChips · SortSelect
    │   │   │                · JobList(JobCard[] | JobCardSkeleton[] | EmptyState | ErrorState)
    │   │   │                · Pagination
    │   │   ├── JobDetail ▸ JobHeader(CompanyBadge, VerifiedTick, SaveButton, ApplyButton)
    │   │   │              · JobMetaGrid · JobDescription · SkillChips · CompanyCard
    │   │   │              · SimilarJobs · ApplyModal · ReportDialog
    │   │   └── CompanyDetail ▸ CompanyHero · AboutPanel · CompanyJobList
    │   └── Footer
    │
    ├── AuthLayout ▸ BrandPanel + <Outlet/>
    │   ├── Login ▸ LoginForm(Input, PasswordInput, Button) · SocialProofPanel
    │   ├── Signup ▸ RoleSelectCards → SignupForm → PasswordStrengthMeter
    │   └── VerifyEmail · ForgotPassword · ResetPassword
    │
    ├── CandidateLayout ▸ Sidebar · TopBar(NotificationBell, ThemeToggle, UserMenu) · <Outlet/>
    │   ├── Dashboard ▸ CompletenessCard · StatCard[] · ApplicationSummaryList(StatusTimeline)
    │   │              · RecommendedJobs
    │   ├── Profile ▸ ProfileHeader · AboutSection · SkillSection(SkillPicker)
    │   │            · ExperienceSection(ExperienceItem[], ExperienceEditorModal)
    │   │            · EducationSection · ProjectSection · CertificationSection
    │   │            · ResumeCard(ResumeUploader, ResumePreviewModal)
    │   │            · PreferencesPanel · OpenToWorkToggle
    │   ├── ResumeReview ▸ ★ ParsedFieldReview(FieldDiffRow[], ConfidenceDots,
    │   │                   AcceptAllBar, ConflictWarning)
    │   ├── MyApplications ▸ StatusTabs · ApplicationCard[] · ApplicationFilters
    │   └── ApplicationDetail ▸ JobSummary · StatusTimeline · InterviewCard · WithdrawDialog
    │
    ├── EmployerLayout ▸ Sidebar(lock badges) · TopBar · VerificationBanner · <Outlet/>
    │   ├── Dashboard ▸ VerificationStatusCard | StatCard[] + FunnelChart + RecentApplicants
    │   ├── Verification ▸ VerificationWizard(Stepper)
    │   │                  ▸ Step1 CompanyInfo · Step2 ContactInfo
    │   │                  · Step3 DocumentUpload(FileDropzone, DocumentList)
    │   │                  · Step4 Review&Submit · RejectionReasonCard
    │   ├── Jobs ▸ JobStatusTabs · JobTable(DataTable) · JobRowActions · CloneDialog
    │   ├── JobCreate/Edit ▸ JobFormWizard(Stepper)
    │   │                    ▸ Basics · Details(RichTextEditor) · Requirements(SkillPicker)
    │   │                    · Compensation(SalaryRangeInput) · Review
    │   │                    · AutosaveIndicator · SubmitForReviewDialog
    │   ├── JobApplicants ▸ FunnelTabs · ApplicantFilters · ApplicantTable
    │   │                   · ApplicantDrawer(ProfilePreview, ResumeViewer,
    │   │                     StatusStepper, NotesPanel, InterviewScheduler)
    │   │                   · BulkActionBar
    │   └── CandidateSearch ▸ CandidateFilterPanel · CandidateCard[] · SavedSearchChips
    │
    └── AdminLayout ▸ AdminSidebar(queue badges) · TopBar · <Outlet/>
        ├── Dashboard ▸ KpiGrid(StatCard[]) · SignupChart · StatusPie
        │              · FunnelChart · ActivityFeed
        ├── EmployerQueue ▸ QueueFilters · EmployerReviewTable · QueueEmptyState
        ├── EmployerDetail ▸ CompanyPanel · DocumentViewer(secure iframe)
        │                   · VerificationChecklist · SignalsPanel · SubmissionHistory
        │                   · DecisionBar(ApproveDialog, RejectReasonDialog)
        ├── JobQueue ▸ JobReviewTable · BulkApproveBar
        ├── JobDetail ▸ JobPreview · EmployerContextCard · RevisionDiff · DecisionBar
        ├── Users ▸ UserFilters · UserTable · SuspendDialog
        ├── Reports ▸ ReportTable · ReportDetailDrawer · ResolutionForm
        └── AuditLogs ▸ AuditFilters · AuditTable · LogDetailDrawer
```

### Reusability inventory (`components/ui`, 28 primitives)
`Button` (6 variants × 4 sizes × loading/icon) · `Input` `Textarea` `Select` `Checkbox` `Radio`
`Switch` `DatePicker` `RangeSlider` `FileDropzone` — all **RHF-controlled and forwardRef'd** ·
`Badge` `Chip` `Avatar` `Tooltip` `ProgressBar` · `Card` `Modal` `Drawer` `Dropdown` `Tabs`
`Accordion` `Stepper` `Breadcrumb` · `Table` `Pagination` · `Toast` `Spinner` `Skeleton`
`ThemeToggle`.

Every primitive is styled with `cn()` (clsx + tailwind-merge) and a `cva`-style variant map, so a
consumer can pass `className` and override without specificity wars.

---

## 4. Redux Architecture

### Store shape

```js
{
  auth:   { user, accessToken, isAuthenticated, status, error },  // token NOT persisted
  ui:     { theme, sidebarCollapsed, activeModal, globalLoading, toasts },
  jobFilter:      { keyword, location, skills[], workMode[], employmentType[],
                    salaryRange, experienceRange, industry, education,
                    postedWithin, sortBy, page },
  candidateFilter:{ ...employer-side candidate search draft },
  jobForm:        { step, draft, isDirty, lastSavedAt },     // multi-step wizard
  verificationForm:{ step, draft, uploadedDocs },
  notification:   { unreadCount, isPanelOpen }
}
```

### Persist configuration — **the security-critical part**

```js
const persistConfig = {
  key: 'verihire',
  storage,
  whitelist: ['ui', 'jobFilter'],
  transforms: [
    createTransform(
      (inbound, key) => (key === 'auth' ? { user: inbound.user } : inbound),  // strip token
      (outbound) => outbound
    )
  ]
};
// auth is persisted through a nested config that whitelists ONLY `user`.
// accessToken lives in memory and dies with the tab — by design (ADR-004).
```

On boot, `<AppBootstrap>` calls `GET /auth/me` once. If the refresh cookie is still valid, a new
access token is minted silently and the user stays logged in — **persistent login without ever
writing a token to localStorage.**

### Slices

| Slice | Owns | Notable |
|---|---|---|
| `authSlice` | user, accessToken, flags | `setCredentials`, `clearCredentials`, `updateUser`. Extra reducers on the `login`/`refresh` thunks |
| `uiSlice` | theme, sidebar, modals, toasts | Theme also mirrored to `<html data-theme>` for CSS vars |
| `jobFilterSlice` | filter **draft** | `setFilter`, `toggleArrayFilter`, `resetFilters`, `hydrateFromUrl` |
| `jobFormSlice` | wizard draft | Survives accidental navigation; cleared on successful submit |
| `notificationSlice` | badge count, panel open | Count refreshed by a polling query |

### The Redux ↔ Query boundary (ADR-005)

> **Rule:** if the server owns it, TanStack Query owns it. If the client owns it, Redux owns it.

```
❌ NEVER in Redux: jobs[], applications[], profile, adminQueue, analytics
✅ ALWAYS in Redux: who am I · what theme · which modal · what have I typed into a filter
                    but not yet submitted · which wizard step am I on
```
This single rule eliminates the most common MERN failure mode: hand-written
`fetchJobs` thunks with `loading/error/data` triplets duplicated across 15 slices, and stale
cache after mutations.

---

## 5. TanStack Query Layer

### Query key factory (`constants/queryKeys.js`)
```js
export const qk = {
  jobs: {
    all:      ['jobs'],
    lists:    () => [...qk.jobs.all, 'list'],
    list:     (filters) => [...qk.jobs.lists(), filters],
    details:  () => [...qk.jobs.all, 'detail'],
    detail:   (slug) => [...qk.jobs.details(), slug],
    similar:  (slug) => [...qk.jobs.detail(slug), 'similar'],
  },
  applications: { all:['applications'], mine:(f)=>[...], byJob:(id,f)=>[...], detail:(id)=>[...] },
  candidate:    { me:['candidate','me'], parsedDraft:['candidate','me','parsedDraft'], … },
  employer:     { me:['employer','me'], verification:['employer','me','verification'], … },
  admin:        { employerQueue:(f)=>[...], jobQueue:(f)=>[...], dashboard:(r)=>[...], … },
  notifications:{ list:(f)=>[...], unreadCount:['notifications','unreadCount'] },
};
```
Hierarchical keys make invalidation surgical: approving a job runs
`invalidateQueries({ queryKey: qk.admin.jobQueue() })` **and** `qk.jobs.lists()`, without nuking
unrelated caches.

### Defaults
```js
{ queries: { staleTime: 60_000, gcTime: 5*60_000, retry: (n,e)=> e.status>=500 && n<2,
             refetchOnWindowFocus: false },
  mutations: { onError: (e)=> toast.error(mapApiError(e)) } }
```

### Patterns used

| Pattern | Where |
|---|---|
| `useInfiniteQuery` | Browse jobs (optional infinite scroll), notifications tray |
| `keepPreviousData` | Paginated tables — no layout flash between pages |
| Optimistic updates | Bookmark/save toggle, mark-notification-read, application status change |
| Polling | `unreadCount` (60 s), `resume/status` (2 s while `PARSING`, auto-stops) |
| Prefetch | `onMouseEnter` of a JobCard prefetches its detail |
| Dependent queries | Employer analytics waits on `employer.me.verificationStatus === VERIFIED` |

---

## 6. Forms — React Hook Form + Yup

```
validations/
  auth.schema.js       loginSchema, signupSchema, resetPasswordSchema
  candidate.schema.js  profileSchema, experienceSchema, educationSchema, preferencesSchema
  employer.schema.js   companySchema, verificationSchema
  job.schema.js        jobBasicsSchema … + fullJobSchema (composed)
  search.schema.js     filter coercion/bounds
```

- One `yupResolver` per form; the multi-step wizards validate **per step** with the composed
  schema at final submit.
- Yup schemas import their bounds from `@jobportal/shared/validation/limits` — so
  `MIN_PASSWORD_LEN` is the same number on the client and the server. There is exactly one place
  to change it.
- Server 422 responses are mapped back onto fields via `setError(field, {message})`, so backend
  validation renders inline next to the input rather than as a generic toast.

---

## 7. Axios Client & the Refresh Queue

```js
// api/axiosClient.js  (abbreviated)
let isRefreshing = false;
let queue = [];

instance.interceptors.request.use((cfg) => {
  const token = store.getState().auth.accessToken;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

instance.interceptors.response.use(null, async (error) => {
  const { response, config } = error;
  if (response?.status !== 401 || config._retry || isAuthRoute(config.url)) {
    return Promise.reject(normalizeError(error));
  }
  config._retry = true;

  if (isRefreshing) {                       // ★ queue instead of firing N refreshes
    return new Promise((resolve, reject) => queue.push({ resolve, reject, config }));
  }
  isRefreshing = true;
  try {
    const { accessToken } = await authApi.refresh();   // cookie sent automatically
    store.dispatch(setAccessToken(accessToken));
    queue.forEach(({ resolve, config }) => resolve(instance(config)));
    return instance(config);
  } catch (e) {
    queue.forEach(({ reject }) => reject(e));
    store.dispatch(clearCredentials());
    queryClient.clear();
    window.location.assign(`${ROUTES.LOGIN}?reason=session_expired`);
    return Promise.reject(e);
  } finally {
    isRefreshing = false;
    queue = [];
  }
});
```
`withCredentials: true` is set globally so the refresh cookie travels. `normalizeError` converts
every failure into `{ code, message, details, status }` — components never see raw Axios shapes.

---

## 8. Theming & Dark Mode

- Tailwind `darkMode: 'class'`; the class is written to `<html>` by `ThemeProvider`.
- Semantic CSS custom properties in `styles/tokens.css` (`--surface`, `--ink`, `--border`) so a
  third theme is a token file, not a component rewrite.
- Initial theme resolved by a tiny inline script in `index.html` **before** React mounts —
  prevents the white flash on reload for dark-mode users.
- Order of precedence: user preference (persisted) → `prefers-color-scheme` → light.

## 9. Performance Budget

| Technique | Detail |
|---|---|
| Route-level `lazy()` | Per portal + heavy pages (charts, rich text) |
| `manualChunks` | `react`, `redux`, `query`, `charts`, `motion` split in `vite.config.js` |
| Virtualisation | Applicant and admin tables > 100 rows |
| Image handling | Cloudinary `f_auto,q_auto,w_*` transforms + `loading="lazy"` + explicit dimensions (CLS) |
| Debounce | 400 ms on search inputs; filter changes batched into one query key |
| Memoisation | `memo` on `JobCard`/`ApplicantRow`; `useCallback` on list handlers |
| Skeletons | Match real geometry so nothing shifts on load |
| Target | LCP < 2.5 s · CLS < 0.1 · initial JS < 200 kB gzip |

## 10. Accessibility

Semantic landmarks · visible `focus-visible` rings · focus trap + restore in Modal/Drawer ·
`aria-live="polite"` toasts · `aria-invalid` + `aria-describedby` wiring on every field ·
labelled icon-only buttons · full keyboard operation of dropdowns, tabs, and steppers ·
`prefers-reduced-motion` disables all Framer Motion transforms · AA contrast verified in both
themes.
