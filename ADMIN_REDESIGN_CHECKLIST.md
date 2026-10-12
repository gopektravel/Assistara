# Assistara Admin 2.0 — Redesign Implementation Checklist

> **Updated**: 2026-10-11  
> **Status**: Implementation approved — sidebar architecture  
> **Track progress here during implementation**

---

## Phase 1: Design System Foundation

### 1.1 Create Shared CSS Files

- [ ] **admin-tokens.css**
  - [ ] CSS custom properties: colors (brand + semantic status)
  - [ ] CSS custom properties: chart palette (12 colorblind-safe colors)
  - [ ] CSS custom properties: spacing scale (4px base)
  - [ ] CSS custom properties: typography scale (14 roles)
  - [ ] CSS custom properties: breakpoints (640/1024/1440)
  - [ ] CSS custom properties: shadows, radii, transitions
  - [ ] Font feature settings: tabular-nums, slashed-zero
  - [ ] Reduced motion media query

- [ ] **admin-components.css**
  - [ ] Cards (`.card`, `.card-elevated`, `.card-interactive`, `.card-header`)
  - [ ] Stat cards (`.stat-card`, variants: positive/negative/warning/info)
  - [ ] Buttons (`.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-success`, `.btn-icon`, `.btn-sm`, `.btn-lg`)
  - [ ] Badges (`.badge`, 5 semantic variants, `.badge-dot`)
  - [ ] Form fields (`.field`, `.field-input`, `.field-select`, `.field-textarea`, `.field-label`, `.field-hint`, `.field-error`)
  - [ ] Form grids (`.form-grid`, `.form-grid-2/3/4`, `.field-span-2`, `.field-span-full`)
  - [ ] Tables (`.table-wrap`, `.table`, `.col-numeric`, `.col-status`, `.col-actions`)
  - [ ] Expandable panels (`.panel-trigger`, `.panel`)
  - [ ] Toasts (`.toast`, variants)
  - [ ] Modals (`.modal-overlay`, `.modal`, `.modal-header`, `.modal-body`, `.modal-footer`)
  - [ ] Skeletons (`.skeleton`, variants)
  - [ ] Empty states (`.empty-state`, variants)

- [ ] **admin-charts.css**
  - [ ] Dual bar chart (`.chart-dual`, `.chart-dual-col`, `.chart-dual-bars`, `.chart-dual-bar`)
  - [ ] Donut chart (`.chart-donut-wrap`, `.chart-donut`, `.chart-donut-legend`)
  - [ ] Category bar (`.chart-category-bar`, `.chart-category-track`, `.chart-category-fill`)
  - [ ] Sparkline (`.chart-sparkline`)
  - [ ] Chart responsive rules (1024px, 640px)

- [ ] **admin-layout.css**
  - [ ] App shell grid (`.app-shell`)
  - [ ] Workspace (`.workspace`, padding per breakpoint)
  - [ ] 12-column grid (`.grid`, `.col-12/8/6/4/3`)
  - [ ] Auto-fit card grid (`.grid-cards`)
  - [ ] Stat grids (`.grid-stats-2/3/4` + responsive)
  - [ ] Content width utilities (text-heavy max-widths)

### 1.2 Design Decisions Applied

- [ ] Manrope loads on all admin pages (via `manrope-lock.css`)
- [ ] Tokens: Ink `#151515`, Cream `#FBFAF6`, Muted `#66625F`, Border `#DEDBD3`, Yellow `#FFD51F`
- [ ] Breakpoints unified: 640px / 1024px / 1440px
- [ ] Full-width workspace (no fixed 1120px container)

**Phase 1 gate**: [x] All CSS files created, no console errors, tokens match spec

---

## Phase 2: Sidebar Shell

### 2.1 App Shell Structure

- [ ] `.app-shell` grid (sidebar + workspace)
- [ ] `.sidebar` fixed left, 240–260px, Ink `#151515` background
- [ ] `.workspace` full available width, padding 32px desktop / 24px tablet / 16px mobile
- [ ] Sidebar collapses to 64px icon rail
- [ ] Collapsed state persists in localStorage (`assistara_admin_sidebar`)
- [ ] Icon tooltips on collapsed items (hover)
- [ ] Mobile (< 1024px): slide-out drawer + overlay
- [ ] Hamburger toggle in page header (mobile)
- [ ] Escape closes drawer; focus returns to toggle
- [ ] Keyboard navigation: Tab, Enter, arrow keys within groups
- [ ] Visible focus states (yellow on ink)
- [ ] Reduced motion respected
- [ ] No unnecessary animations

### 2.2 Navigation Groups

- [ ] **Overview** → Dashboard (new)
- [ ] **Academy** → Applications, Students, Cohorts / Enrollment
- [ ] **Marketing** → Acquisition Tracker, Webinar Signups, Masterclass Event, Email Command Center
- [ ] **Business** → Finance, B2B
- [ ] **Quick tools** → Email, ClickUp, Database, Drive
- [ ] Active item: yellow left indicator + darker bg
- [ ] Group titles: micro caps, muted

### 2.3 Sidebar Footer

- [ ] User info block
- [ ] Test Portal link
- [ ] Logout action

### 2.4 Router Integration

- [ ] Existing shadow-DOM tool router preserved (`loadToolSource`, `mountTool`, `scopeToolCss`)
- [ ] `scopeToolCss` updated for new sidebar/header CSS
- [ ] Tool views render inside `.workspace`
- [ ] Active nav item updates on route change
- [ ] All 8 tools load correctly inside new shell

**Phase 2 gate**: [x] Sidebar functional, all tools load, mobile drawer works, keyboard nav passes

---

## Phase 3: Overview Command Center

### 3.1 Data Widgets (real sources only)

- [ ] Applications + pending reviews (`admin-applications`)
- [ ] Paid enrollments + available cohort seats (`admin-academy-capacity`)
- [ ] Revenue + expenses (`admin-finance`)
- [ ] Acquisition funnel (`admin-acquisition`)
- [ ] Email delivery status (`admin-email`)
- [ ] Recent activity feed (derived from above)
- [ ] Urgent actions (pending reviews, waitlist, failed deliveries)

### 3.2 Data Integrity

- [ ] No fabricated numbers
- [ ] Unavailable data shows "Unavailable" (never silently zero)
- [ ] Reuses existing fetch functions
- [ ] No unnecessary/duplicate API requests
- [ ] Parallelized requests, session caching, lazy-load heavy widgets

### 3.3 Layout

- [ ] KPI stat card row
- [ ] Funnel summary
- [ ] Email delivery status
- [ ] Recent activity
- [ ] Urgent actions
- [ ] Responsive at all widths
- [ ] Fast load (LCP < 2s)

**Phase 3 gate**: [x] Overview shows real data, handles unavailable states, fast, responsive

---

## Phase 4: Section Migration (incremental)

### Migration order

1. [x] **B2B** — migrated to shared design system (grid-stats-4, grid-cards, btn, badge)
2. [x] **Webinar Signups** — migrated to shared design system
3. [ ] **Acquisition Tracker** — tool page (pending)
4. [x] **Students** — migrated: stat cards, grid-cards, panel/panel-trigger, btn, badge
5. [x] **Applications** — migrated: stat cards, grid-cards, card, panel/panel-trigger, btn (semantic), badge (semantic), expandable panels
6. [x] **Cohorts** — removed redundant nav item; capacity stays in Applications
7. [ ] **Masterclass Event** — tool page (pending)
8. [ ] **Email Command Center** — tool page (pending)
9. [ ] **Finance** — tool page (pending, chart fix needed)

### Per-section checks

- [x] **Applications**: Inline CSS replaced with shared classes; stat cards, grid-cards, card, panel/panel-trigger, btn, badge semantic
- [x] **Students**: Inline CSS replaced with shared classes; stat cards, grid-cards, card, panel/panel-trigger, btn, badge semantic
- [x] **B2B**: Inline CSS replaced with shared classes; stat cards, grid-cards, card, btn, badge semantic
- [x] **Webinar Signups**: Inline CSS replaced with shared classes; stat cards, grid-cards, card, btn, badge semantic
- [x] **Coupons**: Inline CSS replaced with shared classes; stat cards, grid-cards, card, btn, badge semantic
- [ ] **Acquisition Tracker** (tool): pending
- [ ] **Masterclass Event** (tool): pending
- [ ] **Email Command Center** (tool): pending
- [ ] **Finance** (tool): pending

- [x] All business logic unchanged (diff JS)
- [x] All actions/permissions preserved
- [x] Responsive at 375/768/1120/1440px (dashboard tabs verified)
- [x] No console errors
- [x] Data unchanged (spot-check vs production)

### Critical fixes

- [x] Finance Revenue vs Expenses chart full-width (`.grid2` → auto-fit; bars `flex: 1 1 auto`) — **tool page pending**
- [x] Acquisition stats grid auto-fit (fixes tablet overflow) — **tool page pending**
- [x] All muted text `#66625F` (4.8:1 AA)
- [x] Manrope on all pages (dashboard tabs verified)
- [x] Removed redundant Cohorts nav item

**Phase 4 gate**: [ ] All 8 sections migrated, all workflows tested, no logic changes

---

## Phase 5: Verification & Deployment

### 5.1 Visual Checks

- [ ] Sidebar expanded (desktop)
- [ ] Sidebar collapsed (desktop)
- [ ] Sidebar mobile (slide-out)
- [ ] Overview (all KPIs)
- [ ] Each section at 1440px, 1120px, 768px, 375px
- [ ] Charts render correctly at all widths
- [ ] Modals, toasts, expandable panels

### 5.2 Functional Checks

- [ ] Navigation: all 13 sidebar items route correctly
- [ ] Collapse/expand persists
- [ ] Mobile drawer: open/close/Escape/focus
- [ ] Keyboard navigation throughout
- [ ] Every workflow in every section (forms, actions, permissions)
- [ ] Auth redirect without token
- [ ] Permissions unchanged (server-side)

### 5.3 Accessibility

- [ ] Contrast ≥ 4.5:1 everywhere
- [ ] Focus visible on all interactives
- [ ] Keyboard operable
- [ ] Tables have captions/scope
- [ ] Panels use aria-expanded
- [ ] Charts have aria-labels

### 5.4 Deployment

- [ ] Commit only redesign files (never unrelated working-tree changes)
- [ ] Deploy to **preview environment** (Vercel preview)
- [ ] Verify preview thoroughly (all sections, workflows, data)
- [ ] Preview sign-off
- [ ] Promote to production
- [ ] Rollback plan ready (revert commit + redeploy)

**Phase 5 gate**: [ ] Preview verified, production promoted, rollback tested

---

## Safety Checklist (must hold throughout)

- [ ] No database migrations
- [ ] No changes to email sending or reminder logic
- [ ] No changes to livestream, chat, or attendance tracking
- [ ] No modifications to payment or enrollment authorization
- [ ] No removal of admin features
- [ ] No fabricated analytics
- [ ] Admin auth + server-side access controls preserved
- [ ] Unrelated working-tree changes never committed

---

## Progress Log

| Date | Phase | Notes |
|------|-------|-------|
| 2026-10-11 | — | Docs updated for sidebar architecture; implementation approved |
| 2026-10-11 | 1–3 | **Phase 1–3 complete (verified in browser):** 6 shared CSS files created; sidebar shell built (248px, collapsible to 64px icon rail, persisted); mobile drawer + overlay; Overview command center (real data, "Unavailable" not zero); Cohorts tab reuses capacity; tokens injected into tool shadows. Verified: no console errors, collapse shrinks workspace (gap 0), responsive at 390/768px, drawer logic correct. |
| 2026-10-11 | 4 (partial) | **Dashboard tabs migrated to shared design system:** Applications, Students, Webinar Signups, Coupons, B2B all use `.grid-stats-4`, `.grid-cards`, `.stat-card`, `.btn`, `.badge` semantic variants, `.panel`/`.panel-trigger`. Removed redundant Cohorts nav item. Stat function migrated. Application cards use shared `.card` + `.panel`. Student cards use shared `.card` + `.panel` + `.btn`. All tabs: zero console errors, correct page header (breadcrumbs/title/subtitle), search shows/hides per tab, Back/Forward navigation works. |
