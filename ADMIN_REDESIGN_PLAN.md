# Assistara Admin 2.0 — Redesign Implementation Plan

> **Updated**: 2026-10-11  
> **Status**: Implementation approved — sidebar architecture  
> **Estimated effort**: 10–14 days across 5 phases

---

## Overview

Transform 8 inconsistent standalone admin pages into a cohesive premium SaaS application with a persistent left sidebar and full-width workspace:

1. Establish a shared design system (tokens, components, charts, layout)
2. Build the new sidebar shell (collapsible, mobile drawer, keyboard nav)
3. Create the Overview command center (real data, fast, no fabrication)
4. Migrate existing sections incrementally with zero logic changes
5. Verify (visual, a11y, workflows) → preview deploy → production

**Constraint**: No production deployment of partially migrated or broken states. Preview environment first, verify, then promote.

---

## Phase 1 — Design System Foundation (2 days)

### 1.1 Create Shared CSS Files

| File | Purpose | Source |
|------|---------|--------|
| `admin-tokens.css` | Colors, spacing, typography, breakpoints, shadows | `ADMIN_DESIGN_SYSTEM.md` |
| `admin-components.css` | Cards, buttons, badges, forms, tables, panels, toasts, modals, skeletons, empty | Extract + normalize from 5 files |
| `admin-charts.css` | Dual-bar, donut, sparkline, category-bar | Finance + Email patterns |
| `admin-layout.css` | 12-col grid, auto-fit cards, responsive utilities | New |
| `admin-sidebar.css` | Sidebar, nav groups, collapse, tooltips, mobile drawer | New |
| `admin-header.css` | Page header, breadcrumbs, actions, menu toggle | New |

### 1.2 Design Decisions

- **Font**: Manrope everywhere (replaces DM Sans). Loaded via existing `manrope-lock.css`.
- **Tokens**: Ink `#151515`, Cream `#FBFAF6`, Muted `#66625F`, Border `#DEDBD3`, Yellow `#FFD51F`.
- **Breakpoints**: 640px / 1024px / 1440px (replaces 5 inconsistent sets).
- **Shell**: Full-width workspace — no fixed 1120px container. Padding 32px desktop / 24px tablet / 16px mobile.

### 1.3 Acceptance

- [ ] All 6 CSS files created
- [ ] Tokens match design system doc exactly
- [ ] Manrope loads on all admin pages
- [ ] No console errors from CSS

---

## Phase 2 — Sidebar Shell (2 days)

### 2.1 Build the App Shell

New structure in `admin.html`:

```
┌─────────────┬────────────────────────────────────────────┐
│  SIDEBAR    │  WORKSPACE                                │
│  240–260px  │  Full width, padding 32px                 │
│  Ink bg     │  ┌─────────────────────────────────────┐  │
│  Collapsible│  │ Page Header (breadcrumbs/title/actions)│ │
│  to 64px    │  └─────────────────────────────────────┘  │
│             │  ┌─────────────────────────────────────┐  │
│  Overview   │  │ Page Content (tool view)             │  │
│  Academy    │  │ Full-width responsive                │  │
│  Marketing  │  └─────────────────────────────────────┘  │
│  Business   │                                          │
│  Quick Tools│                                          │
└─────────────┴────────────────────────────────────────────┘
```

### 2.2 Sidebar Navigation

**Groups & items:**

| Group | Items | Source |
|-------|-------|--------|
| **Overview** | Dashboard | New |
| **Academy** | Applications, Students, Cohorts / Enrollment | Existing tools; Cohorts → existing capacity functionality |
| **Marketing** | Acquisition Tracker, Webinar Signups, Masterclass Event, Email Command Center | Existing tools |
| **Business** | Finance, B2B | Existing tools |
| **Quick tools** | Email, ClickUp, Database, Drive | Existing external links |

**Behavior:**

- Desktop: fixed 240–260px, collapsible to 64px icon rail
- Collapsed state: icon-only with hover tooltips
- Persist collapsed/expanded in localStorage (`assistara_admin_sidebar`)
- Mobile (< 1024px): slide-out drawer with overlay, hamburger in page header, Escape closes, focus returns to toggle
- Keyboard: Tab through items, Enter activates, arrow keys within groups, visible focus ring (yellow on ink)
- No unnecessary animations (reduced-motion respected)

### 2.3 Routing

Keep the existing shadow-DOM tool router (`loadToolSource`, `mountTool`, `scopeToolCss`) — it already handles loading each tool's HTML/CSS into a scoped container. Update:

- `scopeToolCss`: also scope the new sidebar/header CSS (`:root` → `:host`)
- Tool views render inside `.workspace` below the page header
- Active nav item updates on route change

### 2.4 Acceptance

- [ ] Sidebar renders with all 5 groups and correct items
- [ ] Collapse/expand works, persists on reload
- [ ] Collapsed shows icons + tooltips
- [ ] Mobile: drawer opens/closes, overlay, Escape
- [ ] Keyboard navigation works
- [ ] Active item highlights with yellow indicator
- [ ] All 8 existing tools still load correctly inside workspace

---

## Phase 3 — Overview Command Center (2–3 days)

### 3.1 Data Sources (existing, authorized)

| Widget | Source | Endpoint |
|--------|--------|----------|
| Applications + pending reviews | `admin-applications` | Existing applications fetch |
| Paid enrollments + cohort seats | `admin-academy-capacity` | Existing capacity fetch |
| Revenue + expenses | `admin-finance` | Existing finance fetch |
| Acquisition funnel | `admin-acquisition` | Existing acquisition fetch |
| Email delivery status | `admin-email` | Existing email status fetch |
| Recent activity + urgent actions | Derived from above | Client-side composition |

**Rules:**
- Real data only — no fabricated numbers
- Unavailable data shows "Unavailable", never silently zero
- Reuse existing fetch functions; avoid duplicate API requests
- Fast: parallelize requests, cache within session, lazy-load heavy widgets

### 3.2 Layout

- KPI stat cards row (applications, pending, enrollments, seats, revenue, expenses)
- Acquisition funnel summary
- Email delivery status
- Recent activity feed
- Urgent actions (pending reviews, waitlist, failed deliveries)

### 3.3 Acceptance

- [ ] All widgets show real data
- [ ] Unavailable states handled explicitly
- [ ] No unnecessary API calls (verify network tab)
- [ ] Responsive at all widths
- [ ] Fast load (measure LCP < 2s on admin connection)

---

## Phase 4 — Section Migration (3–4 days, incremental)

Migrate each section to the shared design system. **Preserve all business logic, permissions, queries, integrations, and actions.**

### Migration order (lowest risk first)

1. **B2B** — simplest, lowest traffic
2. **Webinar Signups** — small, contained
3. **Acquisition Tracker** — fix 6-col overflow
4. **Students** — medium complexity
5. **Applications** — high complexity, most actions
6. **Cohorts** — extract capacity into own nav item
7. **Masterclass Event** — complex, do late
8. **Email Command Center** — closest to system already
9. **Finance** — fix critical chart bug, then restyle

### Per-section rules

- Replace inline CSS with shared classes
- Fix identified layout bugs (Finance chart width, Acquisition overflow, low-contrast stats)
- Keep all onclick handlers, data flows, calculations unchanged
- Test every workflow after migration before moving to next

### Critical fixes included

- **Finance**: Revenue vs Expenses chart full-width (`.grid2` → auto-fit; bars `flex: 1 1 auto`)
- **Acquisition**: 6-col stats → auto-fit grid
- **All**: Muted text `#66625F` (4.8:1, AA)
- **All**: Manrope font

### Acceptance (per section)

- [ ] Visual parity with design system
- [ ] All existing workflows functional (forms, modals, actions, permissions)
- [ ] Responsive at 375/768/1120/1440px
- [ ] No console errors
- [ ] Data unchanged (spot-check against current production)

---

## Phase 5 — Verification & Deployment (2 days)

### 5.1 Testing

- [ ] Visual checks: desktop (1440px), tablet (768px), mobile (375px) — all sections
- [ ] Sidebar: expanded, collapsed, mobile drawer, keyboard nav
- [ ] Workflows: every action in every section (accept, decline, delete, approve, resend, suspend, save, send, configure)
- [ ] Permissions: verify server-side controls unchanged (UI only)
- [ ] Charts: Finance (4 views), Email sparkline, Acquisition
- [ ] Modals, toasts, expandable panels
- [ ] Auth: all pages still redirect to `/admin` without token
- [ ] Accessibility: contrast ≥ 4.5:1, focus visible, keyboard operable

### 5.2 Deployment

1. Commit to `main` (only the redesign files — never unrelated working-tree changes)
2. Deploy to **preview environment** (Vercel preview deployment)
3. Verify preview thoroughly (all sections, workflows, data)
4. Promote to production only after preview sign-off
5. Rollback plan: revert commit, redeploy previous

### 5.3 Rollback

- CSS files are additive; revert the commit to restore previous state
- Sidebar is additive to `admin.html`; tool content unchanged
- No DB migrations, no backend changes — safe to revert

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sidebar breaks shadow-DOM tool scoping | Medium | High | Test tool loading early in Phase 2; `scopeToolCss` update |
| Overview data fetch adds load | Medium | Medium | Parallelize, cache, lazy-load; monitor network |
| CSS class collisions with tool styles | Medium | Medium | Scope tool CSS via shadow DOM; prefix shared classes `admin-` |
| Finance calculations accidentally changed | Low | Critical | Diff all JS; only CSS/HTML changes; spot-check amounts |
| Mobile drawer focus trap issues | Low | Medium | Escape closes; focus returns to toggle |
| Deploying partially migrated state | Low | High | Preview gate; never deploy untested combinations |

---

## File Map

| File | Action |
|------|--------|
| `assistara-local-v9/admin-tokens.css` | Create |
| `assistara-local-v9/admin-components.css` | Create |
| `assistara-local-v9/admin-charts.css` | Create |
| `assistara-local-v9/admin-layout.css` | Create |
| `assistara-local-v9/admin-sidebar.css` | Create |
| `assistara-local-v9/admin-header.css` | Create |
| `assistara-local-v9/admin-overview.css` | Create |
| `assistara-local-v9/admin.html` | Modify (shell, sidebar, router, overview route) |
| `assistara-local-v9/admin-finance.html` | Modify (CSS classes, chart fix) |
| `assistara-local-v9/admin-acquisition.html` | Modify (CSS classes, grid fix) |
| `assistara-local-v9/admin-masterclass-event.html` | Modify (CSS classes) |
| `assistara-local-v9/admin-email.html` | Modify (CSS classes) |
| `assistara-local-v9/vercel.json` | Possibly add preview route |

---

## Out of Scope (Safety)

- No database migrations
- No changes to email sending or reminder logic
- No changes to livestream, chat, or attendance tracking
- No modifications to payment or enrollment authorization
- No removal of admin features
- No fabricated analytics
- Preserve existing admin authentication and server-side access controls
- Do not commit unrelated working-tree changes (chat worker, railway, email-delivery, etc.)
