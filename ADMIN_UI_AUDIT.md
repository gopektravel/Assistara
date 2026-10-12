# Assistara Admin 2.0 — Complete UI Audit

> **Updated**: 2026-10-11  
> **Scope**: All 8 admin sections + new sidebar shell  
> **Status**: Implementation approved — sidebar architecture

---

## Executive Summary

The Assistara Admin Dashboard is being redesigned from **8 inconsistent standalone pages** into a **cohesive SaaS application** with a persistent left sidebar and full-width workspace.

**Current state**: 8 sections, ~3,800 lines of duplicated inline CSS, inconsistent shell widths (820/1120/1240px), fragmented components, no shared design system.

**Target state**: Single sidebar shell (240–260px), full-width responsive workspace, unified design tokens, reusable components, Overview command center.

---

## New Architecture

### Navigation Structure (Sidebar)

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo] Assistara         [Collapse]                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  OVERVIEW                                                    │
│  ├─ Dashboard          (NEW — business command center)        │
│                                                              │
│  ACADEMY                                                     │
│  ├─ Applications       (existing)                            │
│  ├─ Students           (existing)                            │
│  ├─ Cohorts            (existing capacity)                   │
│                                                              │
│  MARKETING                                                   │
│  ├─ Acquisition Tracker (existing)                           │
│  ├─ Webinar Signups     (existing)                           │
│  ├─ Masterclass Event   (existing)                           │
│  ├─ Email Command Center (existing)                          │
│                                                              │
│  BUSINESS                                                    │
│  ├─ Finance            (existing)                            │
│  ├─ B2B                (existing)                            │
│                                                              │
│  QUICK TOOLS                                                 │
│  ├─ Email                                                     │
│  ├─ ClickUp                                                   │
│  ├─ Database                                                  │
│  └─ Drive                                                     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [User] admin@assistara.com                                 │
│  [Test Portal] [Logout]                                     │
└──────────────────────────────────────────────────────────────┘
```

### Sidebar Specifications

| Aspect | Specification |
|--------|---------------|
| **Width** | 240–260px expanded, 64px collapsed (icons only) |
| **Background** | Ink `#151515` |
| **Text** | White `#FFFFFF`, muted `#B9B4AC` |
| **Active indicator** | Assistara Yellow `#FFD51F` left border |
| **Dividers** | `#2A2A2A` 1px |
| **Collapse** | Toggle button, persists in localStorage |
| **Mobile** | Slide-out drawer with overlay |
| **Keyboard** | Full keyboard nav, visible focus states |
| **Tooltips** | On collapsed icons, on hover |

### Workspace Specifications

| Aspect | Specification |
|--------|---------------|
| **Width** | Full available browser width (no fixed 1120px container) |
| **Padding** | 24px–32px horizontal, 24px vertical |
| **Max-width** | Sensible limits for text-heavy sections only (e.g., 1200px for tables) |
| **Charts** | Full-width responsive |
| **Header** | Shared page header with breadcrumbs, title, contextual actions |

---

## Section-by-Section Audit

### 1. New Overview Page (Dashboard Command Center)

**Status**: NEW — to be built

**Content requirements**:
- Applications and pending reviews
- Paid enrollments and available cohort seats
- Revenue and expenses (real data from existing sources)
- Acquisition funnel
- Email delivery status
- Recent activity and urgent actions

**Data sources** (existing, authorized):
- `admin-applications` — applications, students, payments
- `admin-academy-capacity` — cohort capacity, waitlist, exceptions
- `admin-finance` — revenue, expenses, marketing spend
- `admin-acquisition` — visits, signups, funnel
- `admin-email` — delivery status, failures

**Constraints**:
- No fabricated numbers
- Unavailable data shown as "Unavailable", never silently zero
- Fast — avoid unnecessary API requests
- Real-time where existing polling exists (Masterclass stats, Email activity)

---

### 2. Applications (existing, migrate)

| Area | Current | Target |
|------|---------|--------|
| **Cards** | 14px padding, 14px radius | `.card` (20px, 16px) |
| **Stats** | 4-col fixed | `.grid-stats-4` responsive |
| **Expandable** | 34px arrow, inline onclick | `.panel-trigger` + `.panel` |
| **Capacity panel** | 3 sections, fixed grid cols | Responsive grid, stack < 900px |
| **Actions** | Inline buttons, mixed styles | `.btn` variants |
| **Search** | Global search bar | Keep, add to header |

**Preserved**: All actions (Accept, Decline, Delete, Approve payment, Resend), notes, answers, attribution, activity timeline.

---

### 3. Students (existing, migrate)

| Area | Current | Target |
|------|---------|--------|
| **Cards** | 14px padding | `.card` |
| **Grid** | 4-col → 2-col 900px → 1-col 650px | `.grid-cards` auto-fit |
| **Progress** | 4 stat cols | `.grid-stats-4` |
| **Detail** | Nested expandables | `.panel` + `.panel-trigger` |
| **Filters** | Status + sort selects | Keep in header |

**Preserved**: Progress calculation, curriculum phases, exam results, suspend/reactivate, password reset, delete.

---

### 4. Cohorts / Enrollment (existing capacity functionality)

**Status**: Links to existing capacity management (no duplicate system)

| Area | Current | Target |
|------|---------|--------|
| **Location** | Embedded in Applicants tab | Separate sidebar item |
| **Overview** | 10 capacity cards, fixed grid | `.grid-cards` auto-fit |
| **Waitlist** | Fixed 6-col grid | Responsive table |
| **Exceptions** | Fixed 6-col grid | Responsive table |

**Preserved**: Seat enforcement, waitlist invite, exception resolution, payment exceptions.

---

### 5. Acquisition Tracker (existing, migrate)

| Area | Current | Target |
|------|---------|--------|
| **Stats** | **6-col fixed — overflows tablet** | `.grid-cards` auto-fit |
| **Form** | 2-col grid | `.form-grid-2` |
| **Links list** | Dense row with 6 metrics | `.card` + `.stat-card` |
| **Visitor panel** | Expandable, good | `.panel` + `.panel-trigger` |

**Preserved**: Link generation, visitor tracking, attribution, edit label, copy, delete.

---

### 6. Webinar Signups (existing, migrate)

| Area | Current | Target |
|------|---------|--------|
| **Goal bar** | Dark card, progress | Keep, apply tokens |
| **Attribution** | Summary line | `.badge` variants |
| **Signups** | Expandable cards | `.card` + `.panel` |

**Preserved**: Acquisition points, attribution resolution, delete signup.

---

### 7. Masterclass Event (existing, migrate)

| Area | Current | Target |
|------|---------|--------|
| **Shell** | **820px — inconsistent** | Full-width workspace |
| **Status card** | Good structure | `.card` + `.badge` variants |
| **Live stats** | **Best responsive in codebase** | Keep, apply tokens |
| **YouTube card** | Complex but organized | `.card` + `.form-grid` |
| **Presentation** | 16:9 iframe | Full-width |

**Preserved**: Countdown, end masterclass, YouTube stream config, chat provider, chat toggle, stream controls, host chat, presentation controls.

---

### 8. Email Command Center (existing, migrate)

| Area | Current | Target |
|------|---------|--------|
| **Shell** | **1240px — widest** | Full-width workspace |
| **Font** | **Manrope** | Keep Manrope (migrate all pages to Manrope) |
| **Tabs** | 7 tabs, good | Keep, apply tokens |
| **Overview** | **Best responsive grid** | Keep, apply `.grid-cards` |
| **Sparkline** | Custom SVG | `.chart-sparkline` component |
| **Providers** | 2-col grid | `.grid` 2-col responsive |
| **Modal** | Good pattern | `.modal` shared component |

**Preserved**: All 7 tabs, availability banner, campaign preview, recipient timeline, provider sync, live activity, setup checklist, acquisition metrics.

---

### 9. Finance (existing, migrate — CRITICAL)

| Area | Current | Target |
|------|---------|--------|
| **Shell** | 1120px | Full-width workspace |
| **Revenue vs Expenses** | **50% width — CRITICAL BUG** | **Full-width chart** |
| **Bars** | Fixed 13px | `.chart-dual-bar` flex 1 1 auto |
| **Chart height** | Fixed 110px | Responsive 100/120/140px |
| **Legend** | `<i>` tags | `.badge` + `.badge-dot` |
| **Expenses by Category** | Good density | `.chart-category-bar` + `.chart-donut` |
| **Marketing Performance** | Table, horizontal scroll | `.table` sticky headers |

**Preserved**: All calculations, currency switching, date ranges, expense CRUD, FX rates, recurring expenses, fee representation.

---

### 10. B2B (existing, migrate)

| Area | Current | Target |
|------|---------|--------|
| **Cards** | Simple `.card` | Keep, apply tokens |
| **Expandable** | `.callDetail` | `.panel` + `.panel-trigger` |
| **Pipeline** | 8-status select | Keep, apply `.field-select` |

**Preserved**: All call fields, qualifying answers, save, pipeline status, follow-up, deal value, notes.

---

## Cross-Cutting Issues (to fix in redesign)

### 1. Duplicated CSS (~65%)

Every admin file redefines: color variables, shell, top bar, head, tool, card, buttons, badges, forms, stats, tables, media queries, toast, empty, loading.

**Fix**: Shared CSS files (design system, components, charts, layout, shell).

### 2. Inconsistent Design Tokens

| Token | Current (varies) | Target |
|-------|------------------|--------|
| `--ink` | #171717 | `#151515` |
| `--cream` | #f7f5ef | `#FBFAF6` |
| `--line` | #e2ded4 / #e6e2d9 | `#DEDBD3` |
| `--muted` | #746e65 | `#66625F` |
| `--yellow` | #ffd51f | `#FFD51F` |
| Font | DM Sans (4) + Manrope (1) | **Manrope (all)** |

### 3. Responsive Breakpoint Chaos

| Current | Target |
|---------|--------|
| 520/640/650/760/900/920px | **640px (mobile), 1024px (tablet), 1440px (desktop)** |

### 4. Component Inconsistency

| Component | Current Variants | Target |
|-----------|------------------|--------|
| Card | 4 (padding/radius) | 1 (20px, 16px) |
| Button | 4 | 1 base + variants |
| Badge | 6+ | 5 semantic variants |
| Input | 3 | 1 |
| Table | 2 | 1 |
| Stat card | 3 | 1 |
| Toast | 3 | 1 |
| Modal | 1 (email only) | 1 shared |

### 5. Accessibility Gaps (to fix)

- No focus-visible on most elements
- Chart color-only encoding (green/yellow fails deuteranopia)
- Tables lack `<caption>`
- Expandable panels use onclick on non-buttons
- No skip links
- Muted text contrast 3.8:1 (fails AA) — target 4.5:1

### 6. Information Architecture (to fix)

**Current**: 8 items in one row, mixed tabs/tools, no grouping.

**Target**: Sidebar with 4 groups (Overview, Academy, Marketing, Business) + Quick Tools.

**Cohorts**: Link to existing capacity functionality, no duplicate system.

---

## Low-Contrast Colors to Fix

| Element | Current | Target | Ratio |
|---------|---------|--------|-------|
| `--muted` on cream | #746e65 on #f7f5ef (3.8:1) | #66625F on #FBFAF6 (4.8:1) | AA ✅ |
| `--muted` in tables | Same | Same | AA ✅ |
| Chart labels | #746e65 | #66625F | AA ✅ |
| Badge neutral | #746e65 | #66625F | AA ✅ |

---

## Screenshots Needed (post-implementation)

- [ ] Sidebar expanded (desktop)
- [ ] Sidebar collapsed (desktop)
- [ ] Sidebar mobile (slide-out)
- [ ] Overview page (all KPIs)
- [ ] Applications (default, expanded)
- [ ] Students (filters, expanded)
- [ ] Cohorts (capacity, waitlist, exceptions)
- [ ] Acquisition Tracker (link list, visitor panel)
- [ ] Webinar Signups (goal, attribution)
- [ ] Masterclass Event (waiting, live, ended)
- [ ] Email Command Center (all 7 tabs)
- [ ] Finance (Overview, Expenses, Marketing, Revenue)
- [ ] B2B (expanded call)
- [ ] Mobile views (< 640px) for each section
- [ ] Tablet views (640–1023px) for each section

---

## Severity Classification

| Level | Count | Examples |
|-------|-------|---------|
| **Critical** | 3 | Finance chart 50% width, shell width inconsistency, font fragmentation |
| **High** | 12 | CSS duplication, breakpoint chaos, 6-col overflow, no a11y focus |
| **Medium** | 28 | Component variants, badge fragmentation, contrast failures |
| **Low** | 15 | Toast variants, minor spacing, cosmetic |

**Total issues**: 58

---

## Top 10 Biggest UI Problems

1. **Finance Revenue vs Expenses chart at 50% width** — `.grid2` wrapper, fixed 13px bars
2. **Three shell widths** — 820px / 1120px / 1240px
3. **65% CSS duplication** — 5 files, ~3,800 lines
4. **No unified breakpoint system** — 5 different sets
5. **6-column fixed stats grid (Acquisition)** — tablet overflow
6. **Font fragmentation** — DM Sans (4 files) + Manrope (1 file)
7. **Chart components not reusable** — dual-bar, donut, sparkline all custom
8. **Badge system fragmented** — 6+ variants
9. **Mixed navigation** — 8 items, tabs vs tools indistinguishable
10. **Color contrast failures** — muted text 3.8:1 (fails AA)

---

## Files Referenced

- `assistara-local-v9/admin.html` (2,959 lines)
- `assistara-local-v9/admin-finance.html` (2,271 lines)
- `assistara-local-v9/admin-acquisition.html` (1,150 lines minified)
- `assistara-local-v9/admin-masterclass-event.html` (835 lines)
- `assistara-local-v9/admin-email.html` (738 lines)
- `assistara-local-v9/manrope-lock.css` (font loading)
- `assistara-local-v9/vercel.json` (routes)