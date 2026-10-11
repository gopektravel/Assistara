// ----------------------------------------------------------------------------
// Universal Email Template Gateway (SHARED — used by every sending workflow).
//
// This is the bridge between the Email Command Center "Templates" section and
// the real emails Assistara sends.
//
//   * Senders call resolveEmailTemplate(key, vars, legacyFallback).
//   * If a template with that key is PUBLISHED in email_templates, its subject/
//     HTML/text is rendered with the caller's variables and used for the send.
//   * If nothing is published yet, the caller's existing inline builder runs
//     unchanged, so production email is NEVER altered until a new template is
//     explicitly published from the dashboard.
//
// Provider routing (Resend → Brevo → Sender.net), quota, idempotency, logging
// and provider-native tracking stay exactly where they are: in
// email-delivery.ts / createEmailDelivery(). This module only decides WHAT is
// sent, never HOW it is sent.
// ----------------------------------------------------------------------------

import { brandEsc } from "./email-brand.ts";

export type TemplateVars = Record<string, string | number | boolean | null | undefined>;

export interface ResolvedTemplate {
  key: string;
  /** Rendered subject line. */
  subject: string;
  /** Rendered preheader / preview text (may be empty). */
  previewText: string;
  /** Rendered HTML body. */
  html: string;
  /** Rendered plain-text body. Always non-empty when html is present. */
  text: string;
  /** Sender overrides (display name / address / reply-to), when published. */
  senderName?: string;
  senderEmail?: string;
  replyTo?: string;
  /** Published version number, or 0 when the fallback was used. */
  version: number;
  /** "published" = the dashboard template drove this send. */
  source: "published" | "fallback";
}

interface TemplateRow {
  id: string;
  key: string;
  subject: string;
  preview_text: string | null;
  html: string;
  text_content: string | null;
  sender_name: string | null;
  sender_email: string | null;
  reply_to: string | null;
  version: number;
}

const SUPABASE_URL = () => Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Escape a variable value for safe HTML interpolation. */
function escVar(v: unknown): string {
  return brandEsc(v ?? "");
}

/**
 * Replace {{variable}} placeholders. Values are always HTML-escaped, so a name
 * or URL can never inject markup into the email. Unknown placeholders are left
 * untouched so a typo is visible instead of silently blank.
 */
export function renderVars(input: string, vars: TemplateVars): string {
  return String(input ?? "").replace(VAR_RE, (_m, name: string) => {
    if (!(name in vars)) return `{{${name}}}`;
    const v = vars[name];
    if (v === null || v === undefined || v === "") return "";
    return escVar(v);
  });
}

/** Extract the list of {{variable}} names used by a template body. */
export function extractVars(input: string): string[] {
  const out: string[] = [];
  const re = new RegExp(VAR_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(input ?? "")))) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Strip tags/entities to build a plain-text version from HTML. */
export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h1|h2|h3|h4|li|table)>/gi, "\n\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&#0?x27;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

let rowCache: { key: string; row: TemplateRow | null; at: number } | null = null;
const CACHE_MS = 30_000; // a published edit takes effect within 30s, cold-cache sooner

async function loadPublished(key: string): Promise<TemplateRow | null> {
  if (rowCache && rowCache.key === key && Date.now() - rowCache.at < CACHE_MS) return rowCache.row;
  try {
    const url =
      `${SUPABASE_URL()}/rest/v1/email_templates?key=eq.${encodeURIComponent(key)}` +
      `&status=eq.published&select=id,key,subject,preview_text,html,text_content,` +
      `sender_name,sender_email,reply_to,version&limit=1`;
    const r = await fetch(url, {
      headers: { apikey: SERVICE_KEY(), Authorization: `Bearer ${SERVICE_KEY()}` },
    });
    const rows = r.ok ? await r.json().catch(() => []) : [];
    const row: TemplateRow | null = Array.isArray(rows) && rows[0] ? (rows[0] as TemplateRow) : null;
    rowCache = { key, row, at: Date.now() };
    return row;
  } catch {
    // Network/DB trouble must never block a transactional email: fall back.
    return null;
  }
}

export interface LegacyFallback {
  subject: string;
  previewText?: string;
  html: string;
  text?: string;
  senderName?: string;
  senderEmail?: string;
  replyTo?: string;
}

/**
 * Resolve the template for a send.
 *
 * @param key        stable template key (e.g. "academy_application_accepted")
 * @param vars       values for the template's {{variables}}
 * @param fallback   the existing inline builder; only called when no published
 *                   template exists, so behaviour is identical to today.
 */
export async function resolveEmailTemplate(
  key: string,
  vars: TemplateVars,
  fallback?: () => LegacyFallback | Promise<LegacyFallback>,
): Promise<ResolvedTemplate> {
  const row = await loadPublished(key);

  if (row && row.html && row.subject) {
    const html = renderVars(row.html, vars);
    return {
      key,
      subject: renderVars(row.subject, vars),
      previewText: renderVars(row.preview_text || "", vars),
      html,
      text: row.text_content ? renderVars(row.text_content, vars) : htmlToText(html),
      senderName: row.sender_name || undefined,
      senderEmail: row.sender_email || undefined,
      replyTo: row.reply_to || undefined,
      version: Number(row.version) || 1,
      source: "published",
    };
  }

  if (!fallback) {
    throw new Error(`email_templates: no published template for "${key}" and no legacy fallback provided`);
  }

  const fb = await fallback();
  return {
    key,
    subject: fb.subject,
    previewText: fb.previewText || "",
    html: fb.html,
    text: fb.text || htmlToText(fb.html),
    senderName: fb.senderName,
    senderEmail: fb.senderEmail,
    replyTo: fb.replyTo,
    version: 0,
    source: "fallback",
  };
}

/** True when a published dashboard template will drive this key. */
export async function hasPublishedTemplate(key: string): Promise<boolean> {
  return (await loadPublished(key)) !== null;
}

// ---------------------------------------------------------------------------
// Publish-time validation (mirrored in the admin function)
// ---------------------------------------------------------------------------

export interface TemplateIssue {
  field: "subject" | "preview_text" | "html" | "text" | "variables" | "links";
  severity: "error" | "warning";
  message: string;
}

/**
 * Validate a template before publish. Errors block publishing; warnings are
 * surfaced but allowed.
 */
export function validateTemplate(t: {
  subject: string;
  html: string;
  text?: string;
  requiredVars?: string[];
  /** href patterns that must appear (e.g. the unsubscribe link). */
  requiredLinks?: { label: string; test: RegExp }[];
  /** Variables whose value is generated per-send (never typed by a human). */
  dynamicVars?: string[];
}): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const all = `${t.subject}\n${t.html}`;

  if (!t.subject.trim()) issues.push({ field: "subject", severity: "error", message: "Subject line is required." });
  if (!/<body[\s>]/i.test(t.html) || !/<\/body>/i.test(t.html)) {
    issues.push({ field: "html", severity: "error", message: "HTML must be a complete email document (<body>…</body>)." });
  }
  if (/<script[\s>]/i.test(t.html)) {
    issues.push({ field: "html", severity: "error", message: "Scripts are stripped by email clients and are not allowed." });
  }
  if (/javascript:/i.test(t.html)) {
    issues.push({ field: "html", severity: "error", message: "javascript: links are blocked by email clients and are not allowed." });
  }
  // Only the official logo may be a remote image.
  const imgs = [...t.html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).filter(Boolean);
  for (const src of imgs) {
    if (!/^https:\/\//i.test(src)) {
      issues.push({ field: "html", severity: "error", message: `Image "${src.slice(0, 60)}" must be an absolute https:// URL (email clients block local paths).` });
    }
  }
  if (!t.text || !t.text.trim()) {
    issues.push({ field: "text", severity: "warning", message: "No plain-text version. One will be generated from the HTML." });
  }

  for (const req of t.requiredVars || []) {
    if (!new RegExp(`\\{\\{\\s*${req}\\s*\\}\\}`).test(all)) {
      issues.push({
        field: "variables",
        severity: "error",
        message: `Missing required variable {{${req}}}. Publishing would break this email.`,
      });
    }
  }

  const unknown = extractVars(all).filter((v) => !(t.dynamicVars || []).includes(v));
  if (unknown.length) {
    issues.push({
      field: "variables",
      severity: "warning",
      message: `Unregistered variable(s): ${unknown.map((u) => `{{${u}}}`).join(", ")}. Register them or confirm the sender supplies them.`,
    });
  }

  for (const link of t.requiredLinks || []) {
    if (!link.test.test(t.html)) {
      issues.push({ field: "links", severity: "error", message: `Required ${link.label} is missing.` });
    }
  }

  return issues;
}

/** Placeholder variables are the ones a human may leave in a draft. */
export function isPlaceholderVar(name: string, dynamicVars?: string[]): boolean {
  return !(dynamicVars || []).includes(name);
}
