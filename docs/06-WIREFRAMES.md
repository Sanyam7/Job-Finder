# 06 — Wireframes & Design System

Low-fidelity structural wireframes. Visual language: **dark-first, glass-elevated cards, generous
whitespace, one accent colour.** Reference feel: Linear + Vercel + Wellfound.

---

## 1. Design Tokens

```
COLOUR
  brand-500  #2563EB  primary actions, links
  brand-600  #1D4ED8  hover
  accent-500 #10B981  ✅ verified badge, success  ← the trust colour, used sparingly
  warn-500   #F59E0B  pending / awaiting review
  danger-500 #EF4444  rejected / destructive
  ink        light: #0F172A on #FFFFFF | dark: #E2E8F0 on #0B1120
  surface    light: #F8FAFC / #FFFFFF  | dark: #111827 / #1F2937
  border     light: #E2E8F0           | dark: #1F2937

TYPE   Inter var — 12 · 14 · 16 · 20 · 24 · 32 · 44
       display 44/1.1 -0.02em · h1 32/1.2 · h2 24/1.3 · body 16/1.6 · caption 12/1.4

SPACE  4-point scale: 4 8 12 16 24 32 48 64 96
RADIUS sm 6 · md 10 · lg 16 · xl 24 · full
SHADOW xs · sm · md · lg (dark mode swaps shadows for 1px borders + subtle glow)
MOTION 150ms ease-out (micro) · 250ms (panels) · 400ms spring (page)
       ALL animations respect prefers-reduced-motion
```

**Status colour is a contract**, defined once in `constants/statusMaps.js` and reused by every
badge, chart, and filter chip:

| Status | Colour | Icon |
|---|---|---|
| PENDING / awaiting review | amber | ⏳ |
| APPROVED / VERIFIED | emerald | ✅ |
| REJECTED | red | ✕ |
| ARCHIVED / expired | slate | 🗄 |
| DRAFT | slate outline | ✎ |

---

## 2. Public — Landing Page

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ VeriHire   Jobs  Companies  How It Works  About        [☾] Login  Sign Up│
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│              ✅  Every employer verified by a human                       │
│                                                                          │
│           Find real jobs.                                                │
│           From real companies.                                           │
│                                                                          │
│      No ghost listings. No fake recruiters. No data harvesting.          │
│      Every company is manually verified. Every job is manually reviewed. │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────┐      │
│   │ 🔍 Job title, skill or company    │ 📍 Location  │  [Search]  │      │
│   └──────────────────────────────────────────────────────────────┘      │
│      Popular:  React   Node.js   Remote   Python   DevOps               │
│                                                                          │
│      ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│      │   1,284     │  │     312     │  │     0       │                  │
│      │ Live jobs   │  │  Verified   │  │  Fake jobs  │                  │
│      │             │  │  companies  │  │             │                  │
│      └─────────────┘  └─────────────┘  └─────────────┘                  │
├──────────────────────────────────────────────────────────────────────────┤
│  HOW IT WORKS                                                            │
│   ①───────────②───────────③───────────④                                 │
│   Employer     Admin       Job         Job goes                          │
│   registers →  verifies →  reviewed →  live ✅                           │
│                                                                          │
│  [animated pipeline — Framer Motion scroll-triggered, staggered]         │
├──────────────────────────────────────────────────────────────────────────┤
│  WHY VERIFIED JOBS                    │  FEATURED JOBS                   │
│  ✅ Human-reviewed employers           │  ┌────────────────────────────┐  │
│  ✅ Every listing manually approved     │  │ [logo] Senior React Dev    │  │
│  ✅ Resumes never sold or shared        │  │ Acme Inc ✅  · Remote      │  │
│  ✅ Fraud reported → acted on           │  │ ₹18–28 LPA · 3–6 yrs       │  │
│                                        │  │ React  TS  Node   [Apply]  │  │
│                                        │  └────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│  FOR CANDIDATES        │  FOR EMPLOYERS       │  FAQ (accordion)          │
├──────────────────────────────────────────────────────────────────────────┤
│  Footer: Product · Company · Legal · Social         © 2026 VeriHire      │
└──────────────────────────────────────────────────────────────────────────┘
```
**Note:** no "Pricing" link anywhere in nav or footer — per brief.

---

## 3. Public — Browse Jobs

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆  [🔍 react developer          ] [📍 Bengaluru    ] [Search]   [☾] Login │
├──────────────┬───────────────────────────────────────────────────────────┤
│ FILTERS  ⟲   │  243 verified jobs      Sort: [Most relevant ▾]  ⊞ ☰      │
│              │  ● Remote ✕   ● React ✕   ● 3-6 yrs ✕     Clear all       │
│ ▸ Work mode  │ ┌───────────────────────────────────────────────────────┐ │
│  ☑ Remote 84 │ │ [LOGO]  Senior React Developer            ⋯  🔖       │ │
│  ☐ Hybrid 52 │ │         Acme Technologies  ✅ Verified                │ │
│  ☐ Onsite107 │ │         📍 Bengaluru · Remote   💼 4–7 yrs            │ │
│              │ │         ₹18–28 LPA · Full-time                        │ │
│ ▸ Experience │ │         React  TypeScript  Node.js  +3                │ │
│  [▬▬●───▬▬]  │ │         Posted 2 days ago · 34 applicants  [View →]   │ │
│  0 ── 15 yrs │ └───────────────────────────────────────────────────────┘ │
│              │ ┌───────────────────────────────────────────────────────┐ │
│ ▸ Salary     │ │ … (skeleton shimmer while loading)                    │ │
│  [▬●────▬▬]  │ └───────────────────────────────────────────────────────┘ │
│              │                                                           │
│ ▸ Job type   │            ◀  1  2  3 … 13  ▶                             │
│ ▸ Skills     │                                                           │
│ ▸ Industry   │  EMPTY STATE:                                             │
│ ▸ Education  │     🔍  No jobs match these filters                       │
│ ▸ Posted in  │     Try widening experience or clearing location          │
│              │     [Clear all filters]                                   │
└──────────────┴───────────────────────────────────────────────────────────┘
```
Filters sync to the URL query string (shareable/bookmarkable), debounced 400 ms, mobile → bottom
sheet drawer.

---

## 4. Candidate — Dashboard

```
┌───────────────┬──────────────────────────────────────────────────────────┐
│ ◆ VeriHire    │  Good morning, Priya 👋            🔔³  [☾]  [avatar ▾]  │
│               ├──────────────────────────────────────────────────────────┤
│ ▣ Dashboard   │ ┌─ Profile strength ──────────────────────────────────┐  │
│ ◧ My Profile  │ │ ████████████████░░░░  78%                           │  │
│ ✉ Applications│ │ Add 2 projects and a portfolio link to reach 100%   │  │
│ 🔖 Saved Jobs │ │                                    [Complete now →] │  │
│ ✨ Recommended│ └─────────────────────────────────────────────────────┘  │
│ ⚙ Settings    │                                                          │
│               │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │
│ ─────────     │  │   12   │ │    5   │ │    2   │ │    1   │            │
│ ◉ Open to work│  │Applied │ │ Viewed │ │Shortl. │ │Interview│           │
│   [ ●──]  ON  │  └────────┘ └────────┘ └────────┘ └────────┘            │
│               │                                                          │
│               │  RECENT APPLICATIONS                    [View all →]     │
│               │ ┌───────────────────────────────────────────────────┐   │
│               │ │ Senior React Dev · Acme ✅                        │   │
│               │ │ ●───●───●───○───○   Shortlisted · 2 days ago      │   │
│               │ │ App Viewed Short Intv Offer                       │   │
│               │ └───────────────────────────────────────────────────┘   │
│               │                                                          │
│               │  RECOMMENDED FOR YOU  (based on your skills)             │
│               │  [job card] [job card] [job card]                        │
└───────────────┴──────────────────────────────────────────────────────────┘
```

---

## 5. ★ Candidate — Resume Parse Review (the ADR-006 screen)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ← Back to profile        Review extracted details                       │
│                                                                          │
│  We read your resume and found the details below. Nothing has been       │
│  saved yet — pick what you want to keep. You can edit anything after.    │
│                                                                          │
│  [Accept all]  [Ignore all]                    ✓ 14 of 18 selected       │
│  ┌──────────────────────────┬───────────────────────────────────────┐    │
│  │ CURRENT PROFILE          │ FROM YOUR RESUME                      │    │
│  ├──────────────────────────┼───────────────────────────────────────┤    │
│  │ Headline                 │ ☑ Senior Frontend Engineer            │    │
│  │ — empty —                │   ●●●● high confidence                │    │
│  ├──────────────────────────┼───────────────────────────────────────┤    │
│  │ Phone                    │ ☑ +91 98765 43210                     │    │
│  │ — empty —                │   ●●●● high                           │    │
│  ├──────────────────────────┼───────────────────────────────────────┤    │
│  │ Skills (3)               │ ☑ + React, TypeScript, Node.js,       │    │
│  │ React, HTML, CSS         │     GraphQL, Docker  (5 new)          │    │
│  │                          │   ●●●○ medium                         │    │
│  ├──────────────────────────┼───────────────────────────────────────┤    │
│  │ ✎ Bio       (you edited) │ ☐ "Frontend engineer with 6 years…"   │    │
│  │ "I build fast, …"        │   ⚠ This would replace your own text  │    │
│  │                          │   ●●○○ low — unchecked by default     │    │
│  ├──────────────────────────┼───────────────────────────────────────┤    │
│  │ Experience (0)           │ ☑ 3 roles found      [Preview ▾]      │    │
│  │                          │   Acme · Sr FE Eng · 2023–present     │    │
│  └──────────────────────────┴───────────────────────────────────────┘    │
│                                                                          │
│                      [Ignore all]      [Save 14 selected fields]         │
└──────────────────────────────────────────────────────────────────────────┘
```
Fields the candidate previously edited by hand are marked `✎ (you edited)`, flagged with a
warning, and **unchecked by default**. This screen is where the brief's *"never force AI values"*
requirement becomes visible product behaviour.

---

## 6. Employer — Locked (Unverified) Dashboard

```
┌───────────────┬──────────────────────────────────────────────────────────┐
│ ◆ VeriHire    │  Acme Technologies                    🔔  [☾]  [logo ▾]  │
│  EMPLOYER     ├──────────────────────────────────────────────────────────┤
│               │ ┌──────────────────────────────────────────────────────┐ │
│ ▣ Dashboard   │ │ ⏳  Your company is under review                     │ │
│ 🏢 Company    │ │                                                      │ │
│ 📋 Jobs    🔒 │ │ Submitted 31 Jul 2026 · usually reviewed in 24–48 h  │ │
│ 👥 Candidates🔒│ │                                                      │ │
│ ✉ Applicants🔒│ │  ✅ Company name          ✅ Website                 │ │
│ ⚙ Settings    │ │  ✅ Company email domain  ✅ LinkedIn                │ │
│               │ │  ✅ Incorporation doc     ⏳ Identity proof          │ │
│               │ │                                                      │ │
│               │ │  Job posting unlocks the moment you're verified.     │ │
│               │ │                              [Edit submission]       │ │
│               │ └──────────────────────────────────────────────────────┘ │
│               │                                                          │
│               │  WHILE YOU WAIT                                          │
│               │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│               │  │ Complete your│ │ Draft your   │ │ Read posting │     │
│               │  │ company page │ │ first job    │ │ guidelines   │     │
│               │  └──────────────┘ └──────────────┘ └──────────────┘     │
└───────────────┴──────────────────────────────────────────────────────────┘

REJECTED variant:
 ┌──────────────────────────────────────────────────────────┐
 │ ✕  Verification not approved                             │
 │ Reason: The email domain (@gmail.com) does not match your │
 │ stated website (acmetech.io). Please use a company email. │
 │ Category: Domain mismatch · Reviewed 31 Jul 2026          │
 │                                     [Fix and resubmit →]  │
 └──────────────────────────────────────────────────────────┘
```
Drafting a job is allowed while pending — **submitting** is not. That keeps momentum without
breaking the gate.

---

## 7. Employer — Applicants Board

```
┌───────────────┬──────────────────────────────────────────────────────────┐
│ ◆  EMPLOYER   │  Senior React Developer · 34 applicants        [⇩ Export]│
│               ├──────────────────────────────────────────────────────────┤
│ ▣ Dashboard   │ All 34 │ New 12 │ Viewed 9 │ Shortlisted 8 │ Intv 4 │ … │
│ 🏢 Company    │ [🔍 name or skill] [Exp ▾] [Notice ▾] [Sort: Newest ▾]   │
│ 📋 Jobs       │ ┌────────────────────────────────────────────────────┐   │
│ 👥 Candidates │ │ ☐ [av] Priya Sharma        ●●●● 92% match          │   │
│ ✉ Applicants  │ │       Sr Frontend Eng @ Zeta · 6 yrs · Bengaluru   │   │
│ 🔖 Bookmarks  │ │       React TypeScript Node · Notice: 30 days      │   │
│ ⚙ Settings    │ │       Applied 2 days ago         ● SHORTLISTED     │   │
│               │ │       [Profile] [⇩ Resume] [★] [Move to ▾]         │   │
│               │ └────────────────────────────────────────────────────┘   │
│               │ ┌────────────────────────────────────────────────────┐   │
│               │ │ ☐ [av] Rahul Verma          ●●●○ 71% match         │   │
│               │ │       … ● NEW                                      │   │
│               │ └────────────────────────────────────────────────────┘   │
│               │  ☑ 3 selected → [Shortlist] [Reject] [Bookmark]          │
└───────────────┴──────────────────────────────────────────────────────────┘
```

---

## 8. ★ Admin — Employer Verification Review

```
┌───────────────┬──────────────────────────────────────────────────────────┐
│ ◆  ADMIN      │  ← Queue (23 pending)      Acme Technologies       #1042 │
│               ├────────────────────────────────┬─────────────────────────┤
│ ▣ Dashboard   │ COMPANY DETAILS                │ VERIFICATION CHECKLIST  │
│ 🏢 Employers ²³│ Name    Acme Technologies      │ ☑ Name matches docs     │
│ 📋 Jobs     ¹²│ Website acmetech.io  ↗ 200 OK  │ ☑ Website live & real   │
│ 👤 Users      │ Email   hr@acmetech.io ✅match │ ☑ Email domain matches  │
│ 🚩 Reports   ³│ LinkedIn /company/acme ↗       │ ☑ LinkedIn valid        │
│ 📜 Audit Logs │ GST     29ABCDE1234F1Z5        │ ☑ Documents authentic   │
│ 📊 Analytics  │ Size    51–200 · Founded 2018  │ ☐ Identity proof clear  │
│               │ Address Bengaluru, KA, India   │ ☑ GST valid (optional)  │
│               ├────────────────────────────────┤                         │
│               │ DOCUMENTS                      │ SIGNALS                 │
│               │ ┌────┐ ┌────┐ ┌────┐          │ ⚠ 2nd submission        │
│               │ │📄  │ │📄  │ │🪪  │          │ ✅ Domain age 4 yrs     │
│               │ │Inc │ │GST │ │ID  │          │ ✅ No prior reports     │
│               │ └────┘ └────┘ └────┘          │ ℹ Prev reject: docs     │
│               │  click → secure viewer         │                         │
│               ├────────────────────────────────┤ Admin notes             │
│               │ SUBMISSION HISTORY             │ ┌─────────────────────┐ │
│               │ #2 31 Jul — PENDING            │ │                     │ │
│               │ #1 28 Jul — REJECTED (docs)    │ └─────────────────────┘ │
│               ├────────────────────────────────┴─────────────────────────┤
│               │        [✕ Reject]   [⏸ Request info]   [✅ Verify]       │
└───────────────┴──────────────────────────────────────────────────────────┘

Reject dialog (reason is mandatory — the schema won't accept a blank):
  ┌──────────────────────────────────────────────┐
  │ Reject Acme Technologies?                    │
  │ Category  [Invalid documents        ▾]       │
  │ Reason (sent to the employer)                │
  │ ┌──────────────────────────────────────────┐ │
  │ │ The uploaded incorporation certificate…  │ │
  │ └──────────────────────────────────────────┘ │
  │ ⚠ All 4 of their jobs will be hidden.        │
  │              [Cancel]  [Reject & notify]     │
  └──────────────────────────────────────────────┘
```

---

## 9. Admin — Dashboard

```
┌───────────────┬──────────────────────────────────────────────────────────┐
│ ◆  ADMIN      │  Overview                        Range: [Last 30 days ▾] │
│               ├──────────────────────────────────────────────────────────┤
│               │ ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐      │
│               │ │ 4,812  ││  312   ││   23   ││   12   ││ 9,341  │      │
│               │ │ Users  ││Verified││ Pending││Pending ││ Appli- │      │
│               │ │ ▲12%   ││Employer││Employer││  Jobs  ││ cations│      │
│               │ └────────┘└────────┘└─ACTION─┘└─ACTION─┘└────────┘      │
│               │                                                          │
│               │ ┌── Signups over time ────┐ ┌── Jobs by status ───────┐ │
│               │ │      ╱╲    ╱            │ │   ▓▓▓▓▓ Approved   1284 │ │
│               │ │   ╱╲╱  ╲╱╲╱             │ │   ▓▓ Pending         12 │ │
│               │ │ ╱                       │ │   ▓ Rejected         41 │ │
│               │ └─────────────────────────┘ └─────────────────────────┘ │
│               │ ┌── Application funnel ───┐ ┌── Recent activity ──────┐ │
│               │ │ Applied     ███████ 9341│ │ ✅ Verified Acme  2m ago│ │
│               │ │ Viewed      █████   6210│ │ ✕ Rejected job#88 8m ago│ │
│               │ │ Shortlisted ███     2104│ │ 🚩 Report on job#12 …   │ │
│               │ │ Interview   █        612│ │ ⏸ Suspended Foo Ltd …   │ │
│               │ │ Hired       ▌         98│ │              [View all] │ │
│               │ └─────────────────────────┘ └─────────────────────────┘ │
└───────────────┴──────────────────────────────────────────────────────────┘
```
Pending-count tiles are **clickable and coloured amber** — the dashboard's job is to move an
admin into a queue in one click.

---

## 10. Responsive & State Rules

| Breakpoint | Behaviour |
|---|---|
| `< 640` | Single column; sidebar → bottom tab bar; filters → bottom sheet; tables → stacked cards |
| `640–1024` | Two columns; sidebar collapses to icons |
| `> 1024` | Full layout as drawn |

**Every list surface implements four states — no exceptions:**

```
LOADING          EMPTY                ERROR                 SUCCESS
▁▁▁▁▁▁▁▁▁▁       ┌──────────┐        ┌──────────┐          [ data ]
▁▁▁▁▁▁▁          │ 🗂        │        │ ⚠        │
▁▁▁▁▁▁▁▁▁        │ No jobs   │        │ Failed…  │
skeleton         │ yet       │        │ [Retry]  │
(matches the     │ [CTA]     │        └──────────┘
 real card       └──────────┘
 geometry)       illustration + action
```

Destructive actions (reject, suspend, delete) always route through `<ConfirmDialog>` and state
the blast radius ("4 jobs will be hidden"). Toasts are `aria-live="polite"`; dialogs trap focus
and restore it on close.
