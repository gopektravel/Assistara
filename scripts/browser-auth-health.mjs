#!/usr/bin/env node
/**
 * Assistara — browser authentication health check
 * ===============================================
 *
 * Reports whether the SINGLE shared persistent Playwright browser profile is still
 * signed in to Resend, Supabase and Brevo.
 *
 * Contract (see the "Assistara browser automation rule" in AGENTS.md):
 *   - Uses ONLY the shared persistent profile. Never creates a temporary, isolated
 *     or per-session profile.
 *   - Read-only: it loads each provider's dashboard and inspects the resulting page.
 *     It never signs in, never signs out, never changes settings and never clears
 *     cookies or storage.
 *   - Never prints credentials. Cookies, tokens, passwords and page text are read
 *     only to classify the result; only the provider name, status and a
 *     query-stripped URL are ever printed.
 *
 * Usage:
 *   node scripts/browser-auth-health.mjs            # human readable, exit 0 unless unhealthy
 *   node scripts/browser-auth-health.mjs --strict   # exit 1 when a provider is not signed in
 *   node scripts/browser-auth-health.mjs --json     # machine readable
 *
 * Environment overrides:
 *   ASSISTARA_BROWSER_PROFILE      persistent profile directory
 *   ASSISTARA_BROWSER_EXECUTABLE   Chromium executable path
 *   ASSISTARA_PLAYWRIGHT_MODULE    explicit playwright-core module to load
 */

import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

const args = new Set(process.argv.slice(2));
const AS_JSON = args.has('--json');
const STRICT = args.has('--strict');

if (args.has('--help') || args.has('-h')) {
  console.log(`Assistara browser authentication health check

  node scripts/browser-auth-health.mjs [--json] [--strict]

  --json     emit machine readable JSON
  --strict   exit 1 when any provider is not signed in (default: always exit 0)

Reports the sign-in status of Resend, Supabase and Brevo in the shared persistent
Playwright profile. Read-only: no sign-in, no sign-out, no settings changes, no
cookie or storage changes. Never prints credentials.`);
  process.exit(0);
}

/* ------------------------------------------------------------------ config */

const PROFILE_DIR =
  process.env.ASSISTARA_BROWSER_PROFILE ||
  join(homedir(), '.cache', 'opencode', 'playwright-profile');

const PROVIDERS = [
  {
    id: 'resend',
    name: 'Resend',
    url: 'https://resend.com/domains',
    classify({ url, text }) {
      if (/\/(login|signup|sign-in)\b/.test(url.pathname)) {
        return ['logged_out', `redirected to ${url.pathname}`];
      }
      if (/log ?in to resend|sign ?in to resend/i.test(text)) {
        return ['logged_out', 'sign-in form present'];
      }
      if (/(^|\.)resend\.com$/.test(url.hostname) && /api keys|audience|webhooks/i.test(text)) {
        return ['logged_in', 'account navigation present'];
      }
      return ['unknown', 'no clear sign-in marker'];
    },
  },
  {
    id: 'supabase',
    name: 'Supabase',
    url: 'https://supabase.com/dashboard',
    classify({ url, text }) {
      if (/\/sign-in|\/sign_in/.test(url.pathname) || /welcome back/i.test(text)) {
        return ['logged_out', 'redirected to the sign-in page'];
      }
      if (/\/dashboard\/project\//.test(url.pathname)) {
        return ['logged_in', 'project dashboard loaded'];
      }
      if (/\/dashboard\b/.test(url.pathname) && /organizations|projects/i.test(text)) {
        return ['logged_in', 'dashboard loaded'];
      }
      return ['unknown', 'no clear sign-in marker'];
    },
  },
  {
    id: 'brevo',
    name: 'Brevo',
    url: 'https://app.brevo.com/',
    classify({ url, text }) {
      if (/^login\./.test(url.hostname) || /\/login\b/.test(url.pathname)) {
        return ['logged_out', `redirected to ${url.hostname}${url.pathname}`];
      }
      if (/(^|\.)brevo\.com$/.test(url.hostname) && /contacts|transactional|campaigns|dashboard/i.test(text)) {
        return ['logged_in', 'account navigation present'];
      }
      return ['unknown', 'no clear sign-in marker'];
    },
  },
];

/* -------------------------------------------------------------- resolution */

function loadPlaywright() {
  const candidates = [
    process.env.ASSISTARA_PLAYWRIGHT_MODULE,
    'playwright-core',
    'playwright',
    process.env.APPDATA
      ? join(process.env.APPDATA, 'npm', 'node_modules', '@playwright', 'mcp', 'node_modules', 'playwright-core')
      : null,
    process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'node_modules', 'playwright-core') : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const mod = require(candidates === null ? '' : candidate);
      if (mod && mod.chromium) return mod;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    'Could not load playwright-core. Install it (npm i -D playwright-core) or set ' +
      'ASSISTARA_PLAYWRIGHT_MODULE to an installed copy (the @playwright/mcp bundle already ships one).'
  );
}

function resolveExecutable() {
  if (process.env.ASSISTARA_BROWSER_EXECUTABLE) {
    return existsSync(process.env.ASSISTARA_BROWSER_EXECUTABLE)
      ? process.env.ASSISTARA_BROWSER_EXECUTABLE
      : null;
  }
  const roots = [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : null,
    join(homedir(), 'AppData', 'Local', 'ms-playwright'),
  ].filter(Boolean);

  for (const root of roots) {
    if (!existsSync(root)) continue;
    const builds = readdirSync(root)
      .filter((n) => /^chromium-\d+$/.test(n))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const build of builds) {
      const exe = join(root, build, 'chrome-win64', 'chrome.exe');
      if (existsSync(exe)) return exe;
    }
  }
  return null; // let playwright use its default resolution
}

function findGitRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isInside(child, parent) {
  const c = resolve(child).toLowerCase() + sep;
  const p = resolve(parent).toLowerCase() + sep;
  return c.startsWith(p);
}

function safeUrl(value) {
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname}`; // deliberately drops query + hash
  } catch {
    return '(invalid url)';
  }
}

/* -------------------------------------------------------------------- main */

function emit(report) {
  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('Assistara browser authentication health check');
  console.log(`  profile:    ${report.profile}`);
  console.log(`  executable: ${report.executable || '(playwright default)'}`);
  if (report.note) console.log(`  note:       ${report.note}`);
  console.log('');
  for (const r of report.results) {
    const badge = { logged_in: 'SIGNED IN  ', logged_out: 'SIGNED OUT ', unknown: 'UNKNOWN    ' }[r.status] || r.status;
    console.log(`  ${r.name.padEnd(9)} ${badge} ${safeUrl(r.finalUrl)}  — ${r.detail}`);
  }
  console.log('');
  console.log(`  summary: ${report.summary.signedIn} signed in, ${report.summary.signedOut} signed out, ${report.summary.unknown} unknown`);
}

async function main() {
  // Guard 1: the profile must live OUTSIDE the Git repository so it can never be committed.
  const gitRoot = findGitRoot(HERE);
  if (gitRoot && isInside(PROFILE_DIR, gitRoot)) {
    console.error(`REFUSING TO RUN: the browser profile ${PROFILE_DIR}`);
    console.error(`is inside the Git repository at ${gitRoot} and could be committed.`);
    console.log(JSON.stringify({ ok: false, error: 'profile-inside-repo', profile: PROFILE_DIR, gitRoot }, null, 2));
    process.exit(2);
  }

  if (!existsSync(PROFILE_DIR)) {
    const msg =
      `Persistent profile not found at ${PROFILE_DIR}. It is created by the Playwright MCP ` +
      'on first launch (see AGENTS.md). Refusing to create a fresh profile from here.';
    if (AS_JSON) console.log(JSON.stringify({ ok: false, error: 'profile_missing', profile: PROFILE_DIR }, null, 2));
    else console.log(`Assistara browser authentication health check\n  profile: ${PROFILE_DIR}\n\n  ERROR: ${msg}`);
    process.exit(2);
  }

  let chromium;
  try {
    ({ chromium } = loadPlaywright());
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    process.exit(2);
  }

  const executablePath = resolveExecutable();
  const timeout = Number(process.env.ASSISTARA_BROWSER_TIMEOUT_MS || 45000);

  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true,
      executablePath: executablePath || undefined,
      timeout,
      args: ['--no-first-run', '--no-default-browser-check'],
    });
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    const inUse = /singleton|already (in use|running)|profile.*in use|lockfile|ProcessSingleton/i.test(message);
    const detail = inUse
      ? 'the shared profile is currently open by another browser (for example the Playwright MCP). Close that browser and retry — do not launch a second instance with the same profile.'
      : message;
    if (AS_JSON) console.log(JSON.stringify({ ok: false, error: 'launch_failed', profile: PROFILE_DIR, detail }, null, 2));
    else console.log(`ERROR: could not open the shared profile — ${detail}`);
    process.exit(2);
  }

  const results = [];
  try {
    for (const provider of PROVIDERS) {
      const page = await context.newPage();
      let status = 'unknown';
      let detail = 'navigation failed';
      let finalUrl = provider.url;
      try {
        const response = await page.goto(provider.url, { waitUntil: 'domcontentloaded', timeout });
        // give client-side auth guards a moment to redirect
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        finalUrl = page.url();
        let text = '';
        try {
          text = (await page.evaluate(() => document.body && document.body.innerText)) || '';
        } catch {
          text = '';
        }
        // collapse whitespace so regexes are stable; the text is never printed
        const [s, d] = provider.classify({ url: new URL(finalUrl), text: text.replace(/\s+/g, ' ').trim() });
        status = s;
        detail = d + (response && response.status() >= 400 ? ` (http ${response.status()})` : '');
      } catch (err) {
        detail = `navigation error: ${String(err && err.message ? err.message : err).slice(0, 120)}`;
      } finally {
        await page.close().catch(() => {});
      }
      results.push({ id: provider.id, name: provider.name, status, detail, finalUrl: safeUrl(finalUrl) });
    }
  } finally {
    await context.close().catch(() => {});
  }

  const summary = {
    signedIn: results.filter((r) => r.status === 'logged_in').length,
    signedOut: results.filter((r) => r.status === 'logged_out').length,
    unknown: results.filter((r) => r.status === 'unknown').length,
  };

  const report = {
    ok: summary.signedOut === 0 && summary.unknown === 0,
    profile: PROFILE_DIR,
    executable: executablePath,
    results,
    summary,
  };

  emit(report);
  process.exit(STRICT && !report.ok ? 1 : 0);
}

main().catch((err) => {
  console.error(`ERROR: ${err && err.stack ? err.stack : err}`);
  process.exit(2);
});
