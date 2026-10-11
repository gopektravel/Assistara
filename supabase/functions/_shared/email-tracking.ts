// ----------------------------------------------------------------------------
// First-party (Assistara-owned) email tracking — SHARED, dependency-free and
// unit-testable. Used by:
//   * _shared/email-delivery.ts  -> injects the pixel / rewrites links at send
//   * email-track/index.ts       -> the open pixel + signed click redirect
//
// Design guarantees (asserted by scripts/email-tracking.test.js):
//   * Tracking URLs are OPAQUE (random tracking id) and SIGNED (HMAC-SHA256).
//   * A tracking URL never contains a recipient email, the destination URL or a
//     bearer token. The click destination lives only in the database.
//   * An invalid/forged token can never trigger an arbitrary redirect.
//   * Plain-text bodies are never touched; only HTML is instrumented.
//   * Scanner/prefetch traffic is classified so it is never counted as human
//     engagement by the caller.
//
// This module performs no I/O and reads no env, so the Node test suite can run
// the real functions directly (bundled with esbuild).
// ----------------------------------------------------------------------------

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------
function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function hmac(secret: string, content: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(content));
  return bytesToB64Url(new Uint8Array(sig)).slice(0, 32);
}

const TRACKING_ID_RE = /^[a-f0-9]{16,64}$/;

export function isTrackingId(value: unknown): boolean {
  return typeof value === "string" && TRACKING_ID_RE.test(value);
}

// ---------------------------------------------------------------------------
// Token format (opaque + signed)
//   open  : o1.<trackingId>.<sig>            sig = HMAC("o1:<trackingId>")
//   click : c1.<trackingId>.<linkIndex>.<sig> sig = HMAC("c1:<trackingId>:<index>")
// The destination is intentionally NOT part of the token.
// ---------------------------------------------------------------------------
export async function signOpenToken(secret: string, trackingId: string): Promise<string> {
  return `o1.${trackingId}.${await hmac(secret, `o1:${trackingId}`)}`;
}

export async function signClickToken(secret: string, trackingId: string, linkIndex: number): Promise<string> {
  return `c1.${trackingId}.${linkIndex}.${await hmac(secret, `c1:${trackingId}:${linkIndex}`)}`;
}

export async function verifyOpenToken(secret: string, token: string): Promise<string | null> {
  if (!secret) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "o1") return null;
  const [, trackingId, sig] = parts;
  if (!isTrackingId(trackingId)) return null;
  const expected = await hmac(secret, `o1:${trackingId}`);
  return timingSafeEqual(sig, expected) ? trackingId : null;
}

export async function verifyClickToken(
  secret: string,
  token: string,
): Promise<{ trackingId: string; linkIndex: number } | null> {
  if (!secret) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || parts[0] !== "c1") return null;
  const [, trackingId, rawIndex, sig] = parts;
  if (!isTrackingId(trackingId)) return null;
  const linkIndex = Number(rawIndex);
  if (!Number.isInteger(linkIndex) || linkIndex < 0 || linkIndex > 9999) return null;
  const expected = await hmac(secret, `c1:${trackingId}:${linkIndex}`);
  return timingSafeEqual(sig, expected) ? { trackingId, linkIndex } : null;
}

// ---------------------------------------------------------------------------
// HTML instrumentation
// ---------------------------------------------------------------------------
const PIXEL_MARKER = 'data-assistara-track="pixel"';
const ANCHOR_RE = /<a\b[^>]*>/gi;
const HREF_RE = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

export interface TrackableLink {
  index: number;
  url: string;
}

export interface PlanOptions {
  /** Public tracking base, e.g. https://www.getassistara.com/t — used only to
   *  avoid re-wrapping links that already point at the tracker (idempotency). */
  baseUrl?: string;
  maxLinks?: number;
}

function isSkippedHref(href: string): boolean {
  const h = href.trim();
  if (!h) return true;
  if (/^(#|mailto:|tel:|sms:|cid:|data:|javascript:)/i.test(h)) return true;
  if (!/^https?:\/\//i.test(h)) return true; // relative URLs are not tracked
  // Never wrap unsubscribe links (privacy + deliverability).
  if (/unsubscribe|opt[-_]?out/i.test(h)) return true;
  return false;
}

function alreadyTracked(href: string, baseUrl?: string): boolean {
  if (!baseUrl) return false;
  try {
    const a = new URL(href);
    const b = new URL(baseUrl);
    return a.host === b.host && a.pathname.replace(/\/+$/, "").startsWith(b.pathname.replace(/\/+$/, ""));
  } catch {
    return false;
  }
}

function rewriteAnchors(
  html: string,
  opts: PlanOptions,
  visit: (href: string, index: number) => string | null,
): string {
  const maxLinks = opts.maxLinks ?? 50;
  let index = -1;
  return html.replace(ANCHOR_RE, (tag) => {
    const m = tag.match(HREF_RE);
    if (!m) return tag;
    const href = (m[1] ?? m[2] ?? "").trim();
    if (isSkippedHref(href) || alreadyTracked(href, opts.baseUrl)) return tag;
    index++;
    if (index >= maxLinks) return tag;
    const replacement = visit(href, index);
    if (!replacement) return tag;
    return tag.replace(HREF_RE, `href="${replacement}"`);
  });
}

/**
 * List the links that WILL be rewritten, with the exact index applyTracking uses.
 * Excludes mailto/tel/#/relative/unsubscribe links and never wraps twice.
 */
export function planTrackableLinks(html: string, opts: PlanOptions = {}): TrackableLink[] {
  const source = String(html || "");
  if (!source || source.includes(PIXEL_MARKER)) return [];
  const links: TrackableLink[] = [];
  rewriteAnchors(source, opts, (href, index) => {
    links.push({ index, url: href });
    return null; // planning only
  });
  return links;
}

export function buildOpenPixelHtml(url: string): string {
  return (
    `<img src="${url}" width="1" height="1" alt="" ` +
    `${PIXEL_MARKER} style="display:none;border:0;outline:none;width:1px;height:1px;max-height:1px;max-width:1px" />`
  );
}

export interface ApplyOptions {
  openPixelUrl: string;
  clickUrls: Map<number, string>;
  baseUrl?: string;
  maxLinks?: number;
}

/**
 * Insert the pixel before </body> and rewrite each planned link to its signed
 * click URL. Idempotent: a body already carrying the pixel is returned unchanged.
 */
export function applyTracking(html: string, opts: ApplyOptions): string {
  const source = String(html || "");
  if (!source || source.includes(PIXEL_MARKER)) return source;

  const rewritten = rewriteAnchors(source, opts, (_href, index) => opts.clickUrls.get(index) ?? null);

  const pixel = buildOpenPixelHtml(opts.openPixelUrl);
  const bodyClose = /<\/body>/i;
  if (bodyClose.test(rewritten)) {
    return rewritten.replace(bodyClose, (m) => `${pixel}${m}`);
  }
  return `${rewritten}${pixel}`;
}

// ---------------------------------------------------------------------------
// Traffic classification (scanner/prefetch vs. a plausible human)
// ---------------------------------------------------------------------------
const BOT_UA_RE =
  /(googleimageproxy|google[- ]?image|yahoo|barracuda|proofpoint|mimecast|symantec|forcepoint|fireeye|cloudmark|appriver|messagelabs|microsoft office existence discovery|microsoft preview|outlook-?ios|headlesschrome|phantomjs|puppeteer|playwright|crawler|spider|\bbot\b|curl\/|wget\/|python-requests|python-urllib|go-http-client|java\/|okhttp|axios|node-fetch|postmanruntime|libwww|apache-httpclient|mass ?scanner|preview|probe|scan)/i;

export interface TrafficClass {
  userAgentClass: string;
  suspectedBot: boolean;
}

/**
 * Classify a hit. Missing UA, known proxy/scanner agents, explicit
 * prefetch intent, or (for clicks) non-navigation fetch metadata mark the hit
 * as a probable bot.
 *
 * `kind` matters: an open pixel is a SUBRESOURCE load by design
 * (Sec-Fetch-Dest: image, mode: no-cors), so the navigation heuristics are only
 * applied to clicks — otherwise every open would be mislabelled a scanner.
 */
export function classifyUserAgent(
  ua: string | null | undefined,
  headers: Record<string, string> = {},
  kind: "open" | "click" = "click",
): TrafficClass {
  const agent = String(ua || "").trim();
  const h = headers || {};

  const purpose = `${h["purpose"] || ""} ${h["x-purpose"] || ""} ${h["x-moz"] || ""}`.toLowerCase();
  if (/prefetch|preview|scan/.test(purpose)) return { userAgentClass: "prefetch", suspectedBot: true };

  // A genuine click is a top-level navigation (mode=navigate, dest=document).
  // Anything else with explicit fetch metadata is a machine subrequest.
  if (kind === "click") {
    const fetchMode = String(h["sec-fetch-mode"] || "").toLowerCase();
    const fetchDest = String(h["sec-fetch-dest"] || "").toLowerCase();
    if (fetchMode && fetchMode !== "navigate") return { userAgentClass: "fetch-non-navigate", suspectedBot: true };
    if (fetchDest && fetchDest !== "document") return { userAgentClass: "fetch-non-document", suspectedBot: true };
  }

  if (!agent) return { userAgentClass: "missing", suspectedBot: true };
  if (BOT_UA_RE.test(agent)) return { userAgentClass: "bot", suspectedBot: true };
  if (/applewebkit|gecko|trident|edg\/|chrome\/|safari\//i.test(agent)) return { userAgentClass: "browser", suspectedBot: false };
  if (/thunderbird|apple mail|outlook/i.test(agent)) return { userAgentClass: "mail_client", suspectedBot: false };
  return { userAgentClass: "unknown", suspectedBot: true };
}
