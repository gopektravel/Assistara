#!/usr/bin/env node
/**
 * Assistara — durable provider sign-in for the shared persistent profile
 * =====================================================================
 *
 * Opens the ONE shared persistent Playwright profile in a VISIBLE browser on the
 * Resend / Supabase / Brevo dashboards so the operator can sign in once. Then it
 * proves durability: it gracefully closes the browser, reopens the SAME profile and
 * re-checks all three providers.
 *
 * Why this exists: the OpenCode desktop app's embedded browser keeps its page
 * storage in memory (its on-disk cookie store is never written), so logins made
 * there are lost on restart. Only this profile persists to disk.
 *
 * Read-only with respect to the providers: this script never signs in, never signs
 * out, never changes settings, never clears cookies or storage. It never prints
 * credentials.
 *
 * Usage:
 *   node scripts/browser-login.mjs [--minutes 30] [--json]
 */

import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const minutesArg = args.indexOf('--minutes');
const MINUTES = minutesArg >= 0 ? Number(args[minutesArg + 1]) : 240;
const POLL_MS = 10000;

const PROFILE_DIR =
  process.env.ASSISTARA_BROWSER_PROFILE ||
  join(homedir(), '.cache', 'opencode', 'playwright-profile');

const PROVIDERS = [
  {
    id: 'resend', name: 'Resend',
    signInUrl: 'https://resend.com/login',
    checkUrl: 'https://resend.com/domains',
    classify({ url, text }) {
      if (/\/(login|signup|sign-in)\b/.test(url.pathname)) return ['logged_out', `at ${url.pathname}`];
      if (/log ?in to resend|sign ?in to resend/i.test(text)) return ['logged_out', 'sign-in form present'];
      if (/(^|\.)resend\.com$/.test(url.hostname) && /api keys|audience|webhooks/i.test(text)) return ['logged_in', 'account navigation present'];
      return ['unknown', 'no clear marker'];
    },
  },
  {
    id: 'supabase', name: 'Supabase',
    signInUrl: 'https://supabase.com/dashboard/sign-in',
    checkUrl: 'https://supabase.com/dashboard',
    classify({ url, text }) {
      if (/\/sign-in|\/sign_in/.test(url.pathname) || /welcome back/i.test(text)) return ['logged_out', 'redirected to the sign-in page'];
      if (/\/dashboard\/project\//.test(url.pathname)) return ['logged_in', 'project dashboard loaded'];
      if (/\/dashboard\b/.test(url.pathname) && /organizations|projects/i.test(text)) return ['logged_in', 'dashboard loaded'];
      return ['unknown', 'no clear marker'];
    },
  },
  {
    id: 'brevo', name: 'Brevo',
    signInUrl: 'https://login.brevo.com/',
    checkUrl: 'https://app.brevo.com/',
    classify({ url, text }) {
      if (/^login\./.test(url.hostname) || /\/login\b/.test(url.pathname)) return ['logged_out', `at ${url.hostname}${url.pathname}`];
      if (/(^|\.)brevo\.com$/.test(url.hostname) && /contacts|transactional|campaigns|dashboard/i.test(text)) return ['logged_in', 'account navigation present'];
      return ['unknown', 'no clear marker'];
    },
  },
];

function log(msg) {
  if (!AS_JSON) console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function loadPlaywright() {
  const candidates = [
    process.env.ASSISTARA_PLAYWRIGHT_MODULE,
    'playwright-core',
    'playwright',
    process.env.APPDATA
      ? join(process.env.APPDATA, 'npm', 'node_modules', '@playwright', 'mcp', 'node_modules', 'playwright-core')
      : null,
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      const mod = require(c);
      if (mod && mod.chromium) return mod.chromium;
    } catch { /* next */ }
  }
  throw new Error('playwright-core not found (set ASSISTARA_PLAYWRIGHT_MODULE)');
}

function resolveExecutable() {
  if (process.env.ASSISTARA_BROWSER_EXECUTABLE) return process.env.ASSISTARA_BROWSER_EXECUTABLE;
  const roots = [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : null,
    join(homedir(), 'AppData', 'Local', 'ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const builds = readdirSync(root).filter((n) => /^chromium-\d+$/.test(n))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const b of builds) {
      const exe = join(root, b, 'chrome-win64', 'chrome.exe');
      if (existsSync(exe)) return exe;
    }
  }
  return null;
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

function safeUrl(v) {
  try { const u = new URL(v); return `${u.origin}${u.pathname}`; } catch { return '(invalid)'; }
}

async function readStatus(page, provider) {
  try {
    if (page.url() === 'about:blank') return { status: 'unknown', detail: 'not loaded', finalUrl: '' };
    let text = '';
    try { text = (await page.evaluate(() => (document.body ? document.body.innerText : ''))) || ''; } catch { text = ''; }
    const [status, detail] = provider.classify({ url: new URL(page.url()), text: text.replace(/\s+/g, ' ').trim() });
    return { status, detail, finalUrl: safeUrl(page.url()) };
  } catch (err) {
    return { status: 'unknown', detail: `probe error: ${String(err && err.message ? err.message : err).slice(0, 70)}`, finalUrl: safeUrl(page.url()) };
  }
}

async function sweep(pages) {
  const results = [];
  for (const p of PROVIDERS) {
    const page = pages.get(p.id);
    const r = await readStatus(page, p);
    results.push({ id: p.id, name: p.name, ...r });
  }
  return results;
}

async function openProfile(chromium, { headless, signInPages }) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    executablePath: resolveExecutable() || undefined,
    timeout: 60000,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const pages = new Map();
  const existing = context.pages();
  for (let i = 0; i < PROVIDERS.length; i++) {
    const p = PROVIDERS[i];
    const page = existing[i] || (await context.newPage());
    if (signInPages) await page.goto(p.signInUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    pages.set(p.id, page);
  }
  return { context, pages };
}

async function main() {
  if (existsSync(findGitRoot(HERE) || '') && resolve(PROFILE_DIR).toLowerCase().startsWith(resolve(findGitRoot(HERE)).toLowerCase() + sep)) {
    console.log(`ERROR: the shared profile ${PROFILE_DIR} is inside the Git repository. Refusing.`);
    process.exit(2);
  }
  if (!existsSync(PROFILE_DIR)) {
    console.log(`ERROR: shared profile missing at ${PROFILE_DIR}. Launch the Playwright MCP once to create it.`);
    process.exit(2);
  }
  const chromium = loadPlaywright();

  log('============================================================');
  log(' SIGN IN HERE: a browser window is opening on the shared');
  log(` persistent profile: ${PROFILE_DIR}`);
  log(' Open tabs: Resend, Supabase, Brevo. Sign in to each.');
  log(MINUTES > 0 ? ` Waiting up to ${MINUTES} minutes. Do not close the window.` : ' Waiting until all three are signed in. Do not close the window.');
  log('============================================================');

  let phaseA;
  try {
    phaseA = await openProfile(chromium, { headless: false, signInPages: true });
  } catch (err) {
    console.log(`ERROR: could not open the shared profile (is another browser using it?): ${String(err && err.message ? err.message : err)}`);
    process.exit(2);
  }

  const deadline = MINUTES > 0 ? Date.now() + MINUTES * 60 * 1000 : Infinity;
  let last = [];
  let allIn = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    let results;
    try {
      results = await sweep(phaseA.pages);
    } catch {
      break; // window was closed by the operator
    }
    last = results;
    log(results.map((r) => `${r.name}=${r.status}`).join('  '));
    if (results.every((r) => r.status === 'logged_in')) { allIn = true; break; }
  }

  log(allIn ? 'All three providers signed in. Closing the browser gracefully...' : 'Wait window elapsed; closing the browser gracefully...');
  await phaseA.context.close().catch(() => {});
  log('Browser closed. Reopening the SAME profile to prove persistence...');

  let phaseC;
  try {
    phaseC = await openProfile(chromium, { headless: true, signInPages: false });
  } catch (err) {
    console.log(`ERROR: reopen failed: ${String(err && err.message ? err.message : err)}`);
    process.exit(2);
  }
  const after = await sweep(phaseC.pages);
  await phaseC.context.close().catch(() => {});

  const report = {
    profile: PROFILE_DIR,
    signedInBeforeClose: last.filter((r) => r.status === 'logged_in').map((r) => r.name),
    afterRestart: after.map((r) => ({ name: r.name, status: r.status, detail: r.detail, finalUrl: r.finalUrl })),
    persisted: after.every((r) => r.status === 'logged_in'),
  };

  if (AS_JSON) console.log(JSON.stringify(report, null, 2));
  else {
    log('--- result after graceful close + reopen of the same profile ---');
    for (const r of report.afterRestart) log(`  ${r.name.padEnd(9)} ${r.status.padEnd(11)} ${r.finalUrl} — ${r.detail}`);
    log(report.persisted
      ? 'PASS: all three sessions survived a controlled browser restart.'
      : 'PARTIAL/FAIL: not all sessions survived. Re-run after signing in again.');
  }
  process.exit(report.persisted ? 0 : 1);
}

main().catch((err) => {
  console.error(`ERROR: ${err && err.stack ? err.stack : err}`);
  process.exit(2);
});
