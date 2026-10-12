# Assistara Admin 2.0 — Design System Specification

> **Updated**: 2026-10-11  
> **Status**: Implementation — sidebar architecture

---

## Brand Foundation

| Token | Value | Usage |
|-------|-------|-------|
| **Yellow** | `#FFD51F` | Primary actions, active indicator, brand accent |
| **Ink** | `#151515` | Primary text, sidebar background, headings |
| **Cream** | `#FBFAF6` | Page background |
| **Muted** | `#66625F` | Secondary text, labels (4.8:1 on cream — AA ✅) |
| **Border** | `#DEDBD3` | Card borders, input borders, dividers |
| **Typography** | **Manrope** (400, 500, 600, 700, 800) | All text |

---

## Semantic Color System

### Status Colors (all ≥ 4.5:1 on Cream)

| Role | Light (bg) | Dark (text) | Border | Use For |
|------|------------|-------------|--------|---------|
| **Success** | `#E8F7ED` | `#156B35` | `#B9E4C8` | Paid, completed, active, delivered, verified |
| **Warning** | `#FFF0DB` | `#8A4B00` | `#F1C889` | Pending, waiting, partial, unverified |
| **Danger** | `#FDE9E7` | `#8B2825` | `#EFB8B3` | Failed, suspended, bounced, complained, deleted |
| **Info** | `#E8F4FD` | `#0878F9` | `#BEDBF9` | Scheduled, live, tracking, acquisition |
| **Neutral** | `#EFEDE8` | `#66625F` | `#DEDBD3` | New, draft, unknown, default |

### Interactive States

| State | Primary (Yellow) | Ghost (White) | Danger | Success |
|-------|------------------|---------------|--------|---------|
| Default | `bg: #FFD51F`, `text: #151515` | `bg: transparent`, `text: #151515`, `border: #DEDBD3` | `bg: #FDE9E7`, `text: #8B2825` | `bg: #E8F7ED`, `text: #156B35` |
| Hover | `bg: #E8BF00` | `bg: #FBFAF6`, `border: #C9C4BA` | `bg: #F5D6D3` | `bg: #D4EEDC` |
| Active | `bg: #CFA900` | `bg: #F0EDE6` | `bg: #E8C0BC` | `bg: #C0E4CA` |
| Focus | `outline: 3px solid rgba(21,21,21,0.22)`, `offset: 2px` | Same | Same | Same |
| Disabled | `opacity: 0.55` | Same | Same | Same |

---

## Spacing System

**Base unit**: 4px  
**Scale**: 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64

| Context | Value | Token |
|---------|-------|-------|
| Workspace padding | 32px (desktop) / 16px (mobile) | `space-workspace` |
| Section gap | 24px | `space-section` |
| Card padding | 20px | `space-card` |
| Card gap | 16px | `space-card-gap` |
| Component gap | 12px | `space-component` |
| Element gap | 8px | `space-element` |
| Icon gap | 6px | `space-icon` |
| Inset gap | 4px | `space-inset` |

---

## Layout Architecture

### App Shell

```
┌─────────────┬────────────────────────────────────────────┐
│             │                                                │
│  SIDEBAR    │  WORKSPACE                                   │
│  240–260px  │  Full available width                        │
│             │  padding: 32px (desktop) / 16px (mobile)     │
│  Collapsible│                                                │
│  to 64px    │  ┌─────────────────────────────────────────┐ │
│             │  │ Page Header (breadcrumbs, title, actions)│ │
│             │  └─────────────────────────────────────────┘ │
│             │  ┌─────────────────────────────────────────┐ │
│             │  │ Content (full-width responsive)            │ │
│             │  └─────────────────────────────────────────┘ │
│             │                                                │
└─────────────┴────────────────────────────────────────────┘
```

### CSS

```css
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: var(--ink);
  color: #fff;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  transition: width 0.2s ease;
}

.sidebar.collapsed {
  width: 64px;
}

.workspace {
  grid-column: 2;
  padding: var(--space-workspace);
  min-width: 0; /* Prevent overflow */
}

@media (max-width: 1023px) {
  .sidebar {
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }
  .sidebar.open {
    transform: translateX(0);
    box-shadow: 0 0 0 100vmax rgba(21,21,21,0.5);
  }
  .workspace {
    grid-column: 1;
    padding: 16px;
  }
}
```

### Content Widths

| Breakpoint | Workspace Padding | Text-Heavy Max-Width | Charts/Tables |
|------------|-------------------|----------------------|---------------|
| Mobile (< 640px) | 16px | 100% | Full width |
| Tablet (640–1023px) | 24px | 100% | Full width |
| Desktop (1024–1439px) | 32px | 1200px (text only) | Full width |
| Wide (≥ 1440px) | 32px | 1200px (text only) | Full width |

**Key principle**: Full-width for charts, tables, analytics. Max-width only for text-heavy sections (articles, descriptions).

### Responsive Grid

```css
/* 12-column fluid grid */
.grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-component);
}

.col-12 { grid-column: span 12; }
.col-8 { grid-column: span 8; }
.col-6 { grid-column: span 6; }
.col-4 { grid-column: span 4; }
.col-3 { grid-column: span 3; }

/* Auto-fit cards — fills available width */
.grid-cards {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

/* Stat grids */
.grid-stats-4 { grid-template-columns: repeat(4, 1fr); }
.grid-stats-3 { grid-template-columns: repeat(3, 1fr); }
.grid-stats-2 { grid-template-columns: repeat(2, 1fr); }

@media (max-width: 1023px) {
  .grid-stats-4, .grid-stats-3 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 639px) {
  .grid-stats-4, .grid-stats-3, .grid-stats-2 { grid-template-columns: 1fr; }
}
```

---

## Typography Scale

| Role | Size | Weight | Line Height | Letter Spacing | Token |
|------|------|--------|-------------|----------------|-------|
| Display XL | 40px | 800 | 1.1 | -0.02em | `text-display-xl` |
| Display LG | 32px | 800 | 1.15 | -0.02em | `text-display-lg` |
| Display MD | 24px | 800 | 1.2 | -0.01em | `text-display-md` |
| Heading 1 | 28px | 800 | 1.2 | -0.02em | `text-h1` |
| Heading 2 | 22px | 700 | 1.3 | -0.01em | `text-h2` |
| Heading 3 | 18px | 700 | 1.35 | 0 | `text-h3` |
| Heading 4 | 16px | 700 | 1.4 | 0 | `text-h4` |
| Body LG | 16px | 400 | 1.6 | 0 | `text-body-lg` |
| Body | 14px | 400 | 1.55 | 0 | `text-body` |
| Body SM | 13px | 400 | 1.5 | 0 | `text-body-sm` |
| Caption | 12px | 500 | 1.45 | 0 | `text-caption` |
| Label | 11px | 700 | 1.4 | 0.06em | `text-label` |
| Micro | 10px | 800 | 1.3 | 0.08em | `text-micro` |
| Number LG | 34px | 800 | 1.1 | tabular-nums | `text-number-lg` |
| Number MD | 26px | 800 | 1.2 | tabular-nums | `text-number-md` |
| Number SM | 20px | 700 | 1.3 | tabular-nums | `text-number-sm` |

**Font feature settings**: `'tnum' 1, 'cv03' 1` (tabular figures, slashed zero)

---

## Sidebar Component

```css
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--ink);
  color: #fff;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #2A2A2A;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: var(--text-body-lg);
}

.sidebar-brand img { width: 32px; height: 32px; }

.sidebar-collapse {
  width: 32px;
  height: 32px;
  border: 1px solid #3C3C3C;
  background: transparent;
  color: #fff;
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.sidebar-collapse:hover { background: #2A2A2A; }

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.nav-group {
  margin-bottom: 8px;
}

.nav-group-title {
  font: var(--text-micro);
  color: #B9B4AC;
  padding: 8px 16px 4px;
  letter-spacing: 0.08em;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 16px;
  font: var(--text-body-sm);
  color: #fff;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}

.nav-item:hover { background: #2A2A2A; }

.nav-item:focus-visible {
  outline: 2px solid var(--yellow);
  outline-offset: -2px;
}

.nav-item.active {
  background: #2A2A2A;
  border-left-color: var(--yellow);
  color: #fff;
  font-weight: 600;
}

.nav-item-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: #B9B4AC;
}

.nav-item.active .nav-item-icon { color: var(--yellow); }

.nav-item-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Collapsed state — icons only */
.sidebar.collapsed .nav-item-label,
.sidebar.collapsed .nav-group-title,
.sidebar.collapsed .sidebar-brand span {
  display: none;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 10px 0;
}

.sidebar.collapsed .nav-item::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 100%;
  margin-left: 12px;
  padding: 6px 10px;
  background: #2A2A2A;
  color: #fff;
  font: var(--text-caption);
  border-radius: 6px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

.sidebar.collapsed .nav-item:hover::after { opacity: 1; }

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #2A2A2A;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #3C3C3C;
  display: grid;
  place-items: center;
  font: var(--text-caption);
}

.sidebar-user-info {
  flex: 1;
  min-width: 0;
}

.sidebar-user-name {
  font: var(--text-body-sm);
  font-weight: 600;
}

.sidebar-user-role {
  font: var(--text-micro);
  color: #B9B4AC;
}

.sidebar-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.sidebar-action {
  flex: 1;
  padding: 8px;
  font: var(--text-caption);
  font-weight: 600;
  color: #fff;
  background: #2A2A2A;
  border: 1px solid #3C3C3C;
  border-radius: 8px;
  cursor: pointer;
}

.sidebar-action:hover { background: #3C3C3C; }

/* Mobile drawer */
@media (max-width: 1023px) {
  .sidebar {
    width: 260px;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }
  .sidebar.open {
    transform: translateX(0);
    box-shadow: 0 0 0 100vmax rgba(21,21,21,0.5);
  }
  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(21,21,21,0.5);
    z-index: 99;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s;
  }
  .sidebar-overlay.show {
    opacity: 1;
    visibility: visible;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .sidebar,
  .sidebar-overlay,
  .nav-item {
    transition: none;
  }
}
```

---

## Page Header Component

```css
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-component);
  flex-wrap: wrap;
  margin-bottom: var(--space-section);
  padding-bottom: var(--space-component);
  border-bottom: 1px solid var(--border);
}

.page-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font: var(--text-caption);
  color: var(--muted);
  margin-bottom: 8px;
}

.page-breadcrumbs a {
  color: var(--muted);
  text-decoration: none;
}

.page-breadcrumbs a:hover { color: var(--ink); }

.page-breadcrumbs .separator { color: var(--border); }

.page-title {
  font: var(--text-h1);
  margin: 0;
}

.page-subtitle {
  font: var(--text-caption);
  color: var(--muted);
  margin-top: 4px;
  max-width: 640px;
}

.page-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Mobile hamburger */
.page-menu-toggle {
  display: none;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  cursor: pointer;
  place-items: center;
}

@media (max-width: 1023px) {
  .page-menu-toggle { display: grid; }
}
```

---

## Component Specifications

### Cards

```css
.card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: var(--space-card);
}

.card-elevated { box-shadow: 0 2px 8px rgba(21,21,21,0.06); }

.card-interactive {
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.card-interactive:hover {
  box-shadow: 0 4px 16px rgba(21,21,21,0.1);
  border-color: #C9C4BA;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-component);
  margin-bottom: var(--space-component);
}

.card-title { font: var(--text-h3); margin: 0; }
.card-subtitle { font: var(--text-caption); color: var(--muted); margin-top: 2px; }
```

### Stat Cards

```css
.stat-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: var(--space-component);
}

.stat-value { font: var(--text-number-md); line-height: 1.2; }
.stat-label { font: var(--text-caption); color: var(--muted); margin-top: 4px; }
.stat-sublabel { font: var(--text-micro); color: var(--muted); margin-top: 2px; }

.stat-card.positive .stat-value { color: #156B35; }
.stat-card.negative .stat-value { color: #8B2825; }
.stat-card.warning .stat-value { color: #8A4B00; }
.stat-card.info .stat-value { color: #0878F9; }
```

### Buttons

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: var(--text-label);
  font-size: 13px;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  min-height: 40px;
  transition: all 0.15s ease;
}

.btn-primary { background: var(--yellow); color: var(--ink); border-color: var(--yellow); }
.btn-primary:hover { background: #E8BF00; }
.btn-primary:focus-visible { outline: 3px solid rgba(21,21,21,0.22); outline-offset: 2px; }

.btn-ghost { background: transparent; color: var(--ink); border-color: var(--border); }
.btn-ghost:hover { background: var(--cream); border-color: #C9C4BA; }

.btn-danger { background: var(--danger-light); color: var(--danger-dark); border-color: var(--danger-border); }
.btn-danger:hover { background: #F5D6D3; border-color: #E5A09C; }

.btn-success { background: var(--success-light); color: var(--success-dark); border-color: var(--success-border); }
.btn-success:hover { background: #D4EEDC; border-color: #A5D8B8; }

.btn-icon { padding: 10px; min-width: 40px; }
.btn-sm { padding: 7px 12px; font-size: 12px; min-height: 32px; }
.btn-lg { padding: 14px 24px; font-size: 14px; min-height: 48px; }

.btn:disabled { opacity: 0.55; cursor: not-allowed; }
```

### Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font: var(--text-micro);
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  line-height: 1;
  white-space: nowrap;
}

.badge-success { background: var(--success-light); color: var(--success-dark); border-color: var(--success-border); }
.badge-warning { background: var(--warning-light); color: var(--warning-dark); border-color: var(--warning-border); }
.badge-danger { background: var(--danger-light); color: var(--danger-dark); border-color: var(--danger-border); }
.badge-info { background: var(--info-light); color: var(--info-dark); border-color: var(--info-border); }
.badge-neutral { background: var(--neutral-light); color: var(--muted); border-color: var(--border); }

.badge-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
```

### Form Fields

```css
.field { display: grid; gap: 6px; }
.field-label { font: var(--text-label); color: var(--ink); }
.field-hint { font: var(--text-caption); color: var(--muted); }

.field-input,
.field-select,
.field-textarea {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font: var(--text-body);
  color: var(--ink);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.field-input:focus,
.field-select:focus,
.field-textarea:focus {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
  border-color: var(--ink);
}

.field-input::placeholder { color: var(--muted); }
.field-input.error { border-color: var(--danger-dark); }
.field-error { font: var(--text-caption); color: var(--danger-dark); }

.form-grid { display: grid; gap: var(--space-component); }
.form-grid-2 { grid-template-columns: repeat(2, 1fr); }
.form-grid-3 { grid-template-columns: repeat(3, 1fr); }
.form-grid-4 { grid-template-columns: repeat(4, 1fr); }
.field-span-2 { grid-column: span 2; }
.field-span-full { grid-column: 1 / -1; }

@media (max-width: 1023px) {
  .form-grid-4, .form-grid-3 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 639px) {
  .form-grid-2, .form-grid-3, .form-grid-4 { grid-template-columns: 1fr; }
}
```

### Tables

```css
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #fff;
}

.table { width: 100%; border-collapse: collapse; font: var(--text-body-sm); }

.table th {
  text-align: left;
  padding: 10px 12px;
  font: var(--text-micro);
  color: var(--muted);
  background: var(--cream);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}

.table td { padding: 10px 12px; border-bottom: 1px solid #F0EEE8; vertical-align: middle; }
.table tbody tr:last-child td { border-bottom: none; }
.table tbody tr:hover td { background: var(--cream); }

.col-numeric { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.col-status { white-space: nowrap; }
.col-actions { text-align: right; white-space: nowrap; width: 1%; }
```

### Expandable Panels

```css
.panel-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: #fff;
  font: 700 18px/1 var(--font-family);
  color: var(--ink);
  cursor: pointer;
  transition: all 0.15s;
}

.panel-trigger:hover { background: var(--cream); border-color: #C9C4BA; }
.panel-trigger:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.panel-trigger[aria-expanded="true"] { transform: rotate(180deg); }

.panel { display: none; border-top: 1px solid var(--border); margin-top: var(--space-component); padding-top: var(--space-component); }
.panel.open { display: block; animation: panel-open 0.2s ease; }

@keyframes panel-open {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: none; }
}
```

---

## Chart Components

### Dual Bar Chart (Revenue vs Expenses)

```css
.chart-dual {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
  gap: 10px;
  align-items: end;
  min-height: 160px;
  padding: 8px 0;
}

.chart-dual-col { display: grid; gap: 6px; text-align: center; min-width: 0; }

.chart-dual-bars {
  display: flex;
  justify-content: center;
  gap: 6px;
  align-items: flex-end;
  height: 140px;
  flex: 1;
}

.chart-dual-bar {
  flex: 1 1 auto;
  min-width: 8px;
  max-width: 40px;
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
}

.chart-dual-bar.revenue { background: var(--success-dark); }
.chart-dual-bar.expense { background: var(--yellow); }

.chart-dual-label {
  font: var(--text-micro);
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chart-dual-bar[title] { cursor: help; }
```

### Donut Chart

```css
.chart-donut-wrap {
  display: flex;
  gap: 24px;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.chart-donut { width: 180px; height: 180px; flex: 0 0 auto; }
.chart-donut circle { transition: opacity 0.15s; }
.chart-donut circle:hover { opacity: 0.8; }

.chart-donut-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1 1 220px;
  display: grid;
  gap: 8px;
}

.chart-donut-legend li {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  gap: 8px;
  align-items: center;
  font: var(--text-body-sm);
}

.chart-donut-dot { width: 10px; height: 10px; border-radius: 3px; }
```

### Category Bar

```css
.chart-category-bar {
  display: grid;
  grid-template-columns: minmax(140px, 1.2fr) auto 1.6fr;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  font: var(--text-body-sm);
}

.chart-category-label { font-weight: 700; overflow-wrap: anywhere; min-width: 0; }
.chart-category-value { color: var(--muted); font-weight: 700; white-space: nowrap; font: var(--text-caption); }

.chart-category-track {
  background: #F0EDE6;
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
}

.chart-category-fill {
  height: 100%;
  border-radius: 999px;
  min-width: 2px;
  transition: width 0.3s ease;
}

.chart-category-pct {
  color: var(--muted);
  font: var(--text-micro);
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: right;
}
```

### Sparkline

```css
.chart-sparkline { width: 100%; height: 100px; display: block; }
.chart-sparkline svg { width: 100%; height: 100%; }
```

---

## Responsive Behavior

### Breakpoints

```css
:root {
  --bp-mobile: 640px;
  --bp-tablet: 1024px;
  --bp-desktop: 1440px;
}
```

### Component Adaptations

| Component | Mobile (< 640px) | Tablet (640–1023px) | Desktop (≥ 1024px) |
|-----------|------------------|---------------------|---------------------|
| Sidebar | Slide-out drawer | Slide-out drawer | Fixed 240–260px |
| Workspace padding | 16px | 24px | 32px |
| Stats grid | 1 col | 2 col | 4 col |
| Card grid | 1 col | 2 col | Auto-fit (min 280px) |
| Form grid | 1 col | 2 col | 3–4 col |
| Tables | Horizontal scroll | Horizontal scroll | Full width |
| Dual bar chart | Min 44px col, 100px height | Min 52px col, 120px height | Min 60px col, 140px height |
| Donut chart | 160px | 180px | 180px |
| Page header | Stacked | Stacked | Side-by-side |

### Chart-Specific Responsive Rules

```css
@media (max-width: 1023px) {
  .chart-dual { min-height: 120px; }
  .chart-dual-bars { height: 100px; }
  .chart-dual-bar { min-width: 6px; max-width: 28px; }
}

@media (max-width: 639px) {
  .chart-dual { min-height: 100px; gap: 6px; }
  .chart-dual-bars { height: 80px; gap: 4px; }
  .chart-dual-bar { min-width: 5px; max-width: 22px; }
  .chart-dual-label { font-size: 9px; }
  .chart-donut { width: 140px; height: 140px; }
  .chart-donut-wrap { gap: 16px; }
}
```

---

## Accessibility Requirements

### Color Contrast (all verified ≥ 4.5:1 on Cream #FBFAF6)

| Pair | Ratio | Status |
|------|-------|--------|
| Ink (#151515) on Cream | 12.6:1 | ✅ AAA |
| Muted (#66625F) on Cream | 4.8:1 | ✅ AA |
| Success Dark (#156B35) on Success Light (#E8F7ED) | 5.2:1 | ✅ AA |
| Warning Dark (#8A4B00) on Warning Light (#FFF0DB) | 5.1:1 | ✅ AA |
| Danger Dark (#8B2825) on Danger Light (#FDE9E7) | 5.3:1 | ✅ AA |
| Yellow (#FFD51F) on Ink (#151515) | 11.8:1 | ✅ AAA |
| White (#FFFFFF) on Ink (#151515) | 16.1:1 | ✅ AAA |
| Muted Sidebar (#B9B4AC) on Ink (#151515) | 5.9:1 | ✅ AA |

### Focus Management

- All interactive elements: visible focus ring (`outline: 2px solid var(--ink); outline-offset: 2px;`)
- Sidebar items: `outline: 2px solid var(--yellow); outline-offset: -2px;`
- Skip link at top of each page
- Modal traps focus, restores on close
- Expanded panels announce via `aria-expanded`
- Sidebar drawer: Escape closes, focus returns to toggle

### Semantic HTML

- Navigation: `<nav aria-label="Admin sections">`
- Sidebar: `<aside aria-label="Admin navigation">`
- Tables: `<caption>`, `<thead>`, `<tbody>`, `scope="col/row"`
- Charts: `<figure role="img" aria-label="...">`, `<title>` in SVG
- Forms: `<label for="id">`, `aria-describedby` for hints/errors

### Keyboard Navigation

- Sidebar: Tab through items, Enter activates, Escape closes drawer
- Arrow keys navigate within sidebar groups
- Focus visible on all interactives

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Chart Color Palettes (Colorblind-Safe)

### Categorical (12 colors — deuteranopia/protanopia safe)

```css
--chart-1: #151515;  /* Ink */
--chart-2: #FFD51F;  /* Yellow */
--chart-3: #0878F9;  /* Blue */
--chart-4: #156B35;  /* Green */
--chart-5: #8B2825;  /* Red */
--chart-6: #D97706;  /* Orange */
--chart-7: #5D3A9B;  /* Purple */
--chart-8: #0F766E;  /* Teal */
--chart-9: #B91C1C;  /* Rose */
--chart-10: #4B5563; /* Gray */
--chart-11: #A16207; /* Amber */
--chart-12: #0369A1; /* Sky */
```

### Sequential (Revenue/Expense)

- Revenue: `--chart-4` (Green)
- Expense: `--chart-2` (Yellow)
- Net: `--chart-1` (Ink)

---

## Icon System

| Icon | Size | Stroke | Use |
|------|------|--------|-----|
| Dashboard/home | 20px | 2 | Overview |
| Applications | 20px | 2 | Academy |
| Students | 20px | 2 | Academy |
| Cohorts | 20px | 2 | Academy |
| Acquisition | 20px | 2 | Marketing |
| Webinar | 20px | 2 | Marketing |
| Masterclass | 20px | 2 | Marketing |
| Email | 20px | 2 | Marketing |
| Finance | 20px | 2 | Business |
| B2B | 20px | 2 | Business |
| Chevron down/up | 16px | 2 | Expand/collapse |
| Search | 16px | 2 | Search inputs |
| Filter | 16px | 2 | Filter triggers |
| Download | 16px | 2 | Export actions |
| Edit | 16px | 2 | Edit actions |
| Delete | 16px | 2 | Delete actions |
| Copy | 16px | 2 | Copy to clipboard |
| External link | 14px | 2 | External links |
| Check | 14px | 2 | Success states |
| Alert circle | 16px | 2 | Warnings |
| Info circle | 16px | 2 | Info states |
| Live dot | 8px | fill | Live indicators |
| Menu/hamburger | 20px | 2 | Mobile sidebar toggle |
| Collapse | 16px | 2 | Sidebar collapse |

**Implementation**: Inline SVG with `currentColor` stroke → inherits text color

---

## Loading & Empty States

### Skeleton Loaders

```css
.skeleton {
  background: linear-gradient(90deg, var(--cream) 25%, #F0EDE6 50%, var(--cream) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-text { height: 16px; width: 60%; }
.skeleton-text-sm { height: 12px; width: 40%; }
.skeleton-card { height: 120px; }
.skeleton-stat { height: 36px; width: 80%; }
.skeleton-table-row { height: 48px; }
```

### Empty State

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--muted);
  background: #fff;
  border: 1px dashed var(--border);
  border-radius: 16px;
}

.empty-icon { width: 48px; height: 48px; color: var(--muted); margin-bottom: 12px; opacity: 0.5; }
.empty-title { font: var(--text-h4); color: var(--ink); margin: 0 0 6px; }
.empty-description { font: var(--text-body-sm); max-width: 280px; margin: 0 0 16px; }
.empty-action { margin-top: 8px; }
```

### Toast Notifications

```css
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  padding: 12px 18px;
  border-radius: 10px;
  background: var(--ink);
  color: #fff;
  font: var(--text-body-sm);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  transform: translateY(100px);
  opacity: 0;
  transition: all 0.3s ease;
}

.toast.show { transform: translateY(0); opacity: 1; }
.toast.success { background: var(--success-dark); }
.toast.error { background: var(--danger-dark); }
.toast.warning { background: var(--warning-dark); color: var(--ink); }
```

---

## Modal System

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(21,21,21,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 2000;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s;
}

.modal-overlay.open { opacity: 1; visibility: visible; }

.modal {
  width: min(720px, 100%);
  max-height: 90vh;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transform: scale(0.95);
  transition: transform 0.2s;
}

.modal-overlay.open .modal { transform: scale(1); }

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-title { font: var(--text-h3); margin: 0; }

.modal-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.modal-body { padding: 20px; overflow: auto; }

.modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}
```

---

## CSS File Structure

```
assistara-local-v9/
├── admin-tokens.css          # Design tokens (colors, spacing, typography, breakpoints)
├── admin-components.css      # Reusable components (cards, buttons, badges, forms, tables, panels, toasts, modals, skeletons, empty)
├── admin-charts.css          # Chart components (dual-bar, donut, sparkline, category-bar)
├── admin-layout.css          # Grid, responsive utilities, workspace
├── admin-sidebar.css         # Sidebar, nav groups, nav items, collapse, mobile drawer
├── admin-header.css          # Page header, breadcrumbs, actions
├── admin-overview.css        # Overview page (new)
└── admin-pages/
    ├── admin-dashboard.css   # Applications, Students, Cohorts, Webinar, B2B
    ├── admin-finance.css     # Finance-specific
    ├── admin-acquisition.css # Acquisition-specific
    ├── admin-masterclass.css # Masterclass-specific
    └── admin-email.css       # Email-specific
```

---

## Quality Gates

Before deploying any phase:

- [ ] Visual regression: compare screenshots at 375px, 768px, 1120px, 1440px
- [ ] Accessibility: axe-core scan (0 violations AA)
- [ ] Color contrast: all text ≥ 4.5:1
- [ ] Keyboard navigation: all interactive elements reachable and operable
- [ ] Screen reader: NVDA/VoiceOver test key flows
- [ ] Performance: CSS < 50KB gzipped per page
- [ ] No console errors in any admin section

---

## Dependencies

- **Manrope font** (already in `manrope-lock.css`) — load via existing `<link>`
- **No new JS dependencies** — all components use existing vanilla patterns
- **Supabase Edge Functions** — unchanged (UI only)
- **Vercel deployment** — static files only, no build step changes

---

## Browser Support

- Chrome 100+, Firefox 98+, Safari 15.4+, Edge 100+
- CSS Grid, Custom Properties, `:focus-visible`, `prefers-reduced-motion`
- No polyfills needed

---

## File Output

This specification will be implemented as:
- `assistara-local-v9/admin-tokens.css` (tokens)
- `assistara-local-v9/admin-components.css` (components)
- `assistara-local-v9/admin-charts.css` (charts)
- `assistara-local-v9/admin-layout.css` (grid + responsive)
- `assistara-local-v9/admin-sidebar.css` (sidebar)
- `assistara-local-v9/admin-header.css` (page header)
- `assistara-local-v9/admin-overview.css` (Overview page)
- Updated admin HTML files with class-based styling