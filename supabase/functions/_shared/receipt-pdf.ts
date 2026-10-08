// Shared payment receipt PDF for Assistara Academy.
//
// Both payment paths render their attached receipt through this single
// template so the document is identical no matter how the student paid:
//   - supabase/functions/paymongo-webhook  (QR Ph via PayMongo)
//   - supabase/functions/payment-complete  (Stripe checkout)
//
// The module is a pure renderer: it performs no network calls, reads no
// environment variables and touches no database. Callers pass the already
// verified payment record fields and receive PDF bytes.
//
// Design: clean A4, Manrope typeface (embedded, including the peso sign),
// Assistara black / warm cream / white / signature yellow, one page.

import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import type { PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import { MANROPE_REGULAR_B64, MANROPE_SEMIBOLD_B64, MANROPE_EXTRABOLD_B64 } from "./manrope-fonts.ts";

export type ReceiptInput = {
  /** Receipt number, e.g. AST-2026-00042 (already generated and persisted). */
  receipt: string;
  name: string;
  email: string;
  /** Already-localised payment date string shown in the confirmation email. */
  date: string;
  /** Total actually paid, as verified with the payment gateway. */
  amount: number;
  /** ISO currency code; PHP is the only currency the checkout supports. */
  currency?: string;
  /** e.g. "QR Ph via PayMongo", "MASTERCARD ending 4242". */
  method: string;
  /** Gateway transaction / payment intent reference. */
  reference: string;
  /** Optional Stripe charge id (extra row when present). */
  charge?: string;
  /** Coupon code stored on the application at redemption time, if any. */
  promo?: string | null;
};

// Regular (list) price of Assistara Academy in PHP. This mirrors the
// `regular_amount_php: 6900` constant returned by apply-academy-promo and the
// 6900 fallback used by every checkout path. It is only used to display the
// original price and the coupon saving; the paid amount always comes from the
// verified payment record, so historical receipts keep their real figures
// even if the coupon or list price changes later.
const REGULAR_PRICE_PHP = 6900;

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const M = 56; // left/right margin
const RIGHT = PAGE_W - M;
const VALUE_X = 196; // value column in label/value rows
const MAX_VALUE_W = RIGHT - VALUE_X;

const ink = rgb(0.082, 0.082, 0.082); // #151515
const muted = rgb(0.416, 0.396, 0.369); // #6A655E
const cream = rgb(0.984, 0.98, 0.965); // #FBFAF6
const cardLine = rgb(0.929, 0.918, 0.882); // #EDEAE1
const hair = rgb(0.894, 0.882, 0.851); // #E4E1D9
const yellow = rgb(1, 0.835, 0.122); // #FFD51F

// The official Assistara mark, verbatim from assistara-local-v9/assistara-logo.svg
const LOGO_PATH =
  "M24 69.5 42.2 31.8c2.2-4.5 5.1-6.8 8.8-6.8 3.8 0 6.8 2.3 9 6.8l18.5 37.7c2.1 4.4-.8 8.5-5.2 8.5-2.7 0-4.9-1.5-6.1-4L52.8 45.3c-.8-1.6-2.8-1.6-3.6 0L35.2 74c-1.2 2.5-3.4 4-6 4-4.5 0-7.4-4.2-5.2-8.5Z";

/* --------------------------------------------------------------------- *
 * Font loading (Manrope 400 / 600 / 800, embedded from base64)          *
 * --------------------------------------------------------------------- */

const B64_BY_WEIGHT = {
  400: MANROPE_REGULAR_B64,
  600: MANROPE_SEMIBOLD_B64,
  800: MANROPE_EXTRABOLD_B64,
} as const;

const byteCache = new Map<number, Uint8Array>();
function fontBytes(weight: 400 | 600 | 800): Uint8Array {
  let bytes = byteCache.get(weight);
  if (!bytes) {
    const raw = atob(B64_BY_WEIGHT[weight]);
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    byteCache.set(weight, bytes);
  }
  return bytes;
}

// fontkit views of the same files, used only to check glyph coverage so a
// name or email that Manrope does not cover is cleaned instead of drawing
// tofu boxes. Created lazily, once per isolate.
const kitCache = new Map<number, any>();
function kitFont(weight: 400 | 600 | 800): any {
  let kit = kitCache.get(weight);
  if (!kit) {
    kit = fontkit.create(fontBytes(weight));
    kitCache.set(weight, kit);
  }
  return kit;
}

/* --------------------------------------------------------------------- *
 * Small text helpers                                                    *
 * --------------------------------------------------------------------- */

/** Drop control characters and anything the given Manrope weight lacks. */
function sanitize(text: string, kit: any): string {
  let out = "";
  for (const ch of String(text ?? "")) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x0a || cp === 0x09 || cp === 0x0d) {
      out += " ";
      continue;
    }
    if (cp < 0x20) continue;
    if (kit.hasGlyphForCodePoint(cp)) out += ch;
  }
  return out.replace(/ +/g, " ").trim();
}

/** e.g. ₱6,900.00 — falls back to "PHP " if a weight ever lacks the glyph. */
function money(amount: number, currency: string | undefined, kit: any): string {
  const cur = String(currency || "PHP").toUpperCase();
  const prefix = cur === "PHP"
    ? kit.hasGlyphForCodePoint(0x20b1) ? "\u20b1" : "PHP "
    : cur + " ";
  const n = Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return prefix + n;
}

function trackedWidth(text: string, font: PDFFont, size: number, tracking: number): number {
  if (!text) return 0;
  return font.widthOfTextAtSize(text, size) + tracking * (Array.from(text).length - 1);
}

/** Draw letter-spaced uppercase micro-labels (align: left | right | center). */
function drawTracked(
  page: PDFPage,
  text: string,
  opts: {
    x?: number;
    right?: number;
    y: number;
    size: number;
    font: PDFFont;
    color: ReturnType<typeof rgb>;
    tracking: number;
    align?: "left" | "right" | "center";
  },
) {
  const { y, size, font, color, tracking } = opts;
  const align = opts.align || (opts.right !== undefined ? "right" : "left");
  const w = trackedWidth(text, font, size, tracking);
  let cx = align === "right" ? (opts.right as number) - w
    : align === "center" ? (opts.x as number) - w / 2
    : (opts.x as number);
  for (const ch of text) {
    page.drawText(ch, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

/** Right-aligned value at the page margin. */
function rightText(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>) {
  page.drawText(text, { x: RIGHT - font.widthOfTextAtSize(text, size), y, size, font, color });
}

/** Fit a user-supplied value into maxW: shrink first, then ellipsize. */
function fit(text: string, font: PDFFont, size: number, maxW: number): { text: string; size: number } {
  let s = size;
  while (s > 9 && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5;
  if (font.widthOfTextAtSize(text, s) <= maxW) return { text, size: s };
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t.slice(0, -1) + "\u2026", s) > maxW) t = t.slice(0, -1);
  return { text: t.slice(0, -1) + "\u2026", size: s };
}

/* --------------------------------------------------------------------- *
 * Drawing primitives                                                    *
 * --------------------------------------------------------------------- */

/** Rounded-rect subpath in SVG (y-down) coordinates. pdf-lib's drawRectangle
 *  silently ignores borderRadius, so corners are drawn as bezier arcs instead. */
function roundRectPath(w: number, h: number, r: number): string {
  const n = (v: number) => Math.round(v * 1000) / 1000;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const k = rr * 0.5523;
  return [
    `M ${n(rr)} 0`,
    `L ${n(w - rr)} 0`,
    `C ${n(w - rr + k)} 0 ${n(w)} ${n(rr - k)} ${n(w)} ${n(rr)}`,
    `L ${n(w)} ${n(h - rr)}`,
    `C ${n(w)} ${n(h - rr + k)} ${n(w - rr + k)} ${n(h)} ${n(w - rr)} ${n(h)}`,
    `L ${n(rr)} ${n(h)}`,
    `C ${n(rr - k)} ${n(h)} 0 ${n(h - rr + k)} 0 ${n(h - rr)}`,
    `L 0 ${n(rr)}`,
    `C 0 ${n(rr - k)} ${n(rr - k)} 0 ${n(rr)} 0`,
    "Z",
  ].join(" ");
}

/** Filled (optionally bordered) rounded rectangle with real rounded corners. */
function drawRoundRect(
  page: PDFPage,
  x: number,
  yTop: number,
  w: number,
  h: number,
  r: number,
  opts: { color?: unknown; borderColor?: unknown; borderWidth?: number },
) {
  page.drawSvgPath(roundRectPath(w, h, r), { x, y: yTop, ...opts } as any);
}

/** The official Assistara mark: yellow rounded square, A, dot. */
function drawLogo(page: PDFPage, x: number, y: number, size: number) {
  const s = size / 96;
  drawRoundRect(page, x, y + size, size, size, 27 * s, { color: yellow });
  page.drawSvgPath(LOGO_PATH, { x, y: y + size, scale: s, color: ink });
  page.drawCircle({ x: x + 48 * s, y: y + 28 * s, size: 7.4 * s, color: ink });
}

/** Tracked uppercase section title with a hairline running to the margin. */
function section(page: PDFPage, title: string, y: number, font: PDFFont) {
  drawTracked(page, title, { x: M, y, size: 9, font, color: ink, tracking: 1.7 });
  const ruleX = M + trackedWidth(title, font, 9, 1.7) + 14;
  if (RIGHT - ruleX > 40) page.drawRectangle({ x: ruleX, y: y + 2.5, width: RIGHT - ruleX, height: 1, color: hair });
}

/** Label/value row: muted tracked label at the margin, value in the column. */
function row(page: PDFPage, label: string, value: string, y: number, fonts: Fonts, kit: any) {
  drawTracked(page, label.toUpperCase(), { x: M, y, size: 8.5, font: fonts.semi, color: muted, tracking: 1.1 });
  const clean = sanitize(value, kit);
  const fitted = fit(clean || "-", fonts.reg, 11.5, MAX_VALUE_W);
  page.drawText(fitted.text, { x: VALUE_X, y, size: fitted.size, font: fonts.reg, color: ink });
}

/**
 * Like row(), but lets a long value (e.g. an email address) continue onto a
 * second line before ellipsizing, so the address stays fully readable.
 */
function rowWrapped(page: PDFPage, label: string, value: string, y: number, fonts: Fonts, kit: any) {
  drawTracked(page, label.toUpperCase(), { x: M, y, size: 8.5, font: fonts.semi, color: muted, tracking: 1.1 });
  const clean = sanitize(value, kit) || "-";
  if (fonts.reg.widthOfTextAtSize(clean, 11.5) <= MAX_VALUE_W) {
    page.drawText(clean, { x: VALUE_X, y, size: 11.5, font: fonts.reg, color: ink });
    return;
  }
  // Split across two lines; shrink only if the second line still overflows.
  let size = 11.5;
  while (size > 10 && fonts.reg.widthOfTextAtSize(clean, size) > MAX_VALUE_W * 2) size -= 0.5;
  // Greedy cut: fill line one to maxW, remainder on line two.
  let cut = clean.length;
  while (cut > 1 && fonts.reg.widthOfTextAtSize(clean.slice(0, cut), size) > MAX_VALUE_W) cut--;
  const first = clean.slice(0, cut);
  const second = fit(clean.slice(cut), fonts.reg, size, MAX_VALUE_W);
  page.drawText(first, { x: VALUE_X, y, size, font: fonts.reg, color: ink });
  page.drawText(second.text, { x: VALUE_X, y: y - 13.5, size: second.size, font: fonts.reg, color: ink });
}

/** Label row with an amount flush right. */
function rowAmount(
  page: PDFPage,
  label: string,
  value: string,
  y: number,
  fonts: Fonts,
  opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> },
) {
  drawTracked(page, label.toUpperCase(), { x: M, y, size: 8.5, font: fonts.semi, color: muted, tracking: 1.1 });
  rightText(page, value, y, opts.size ?? 11.5, opts.font ?? fonts.reg, opts.color ?? ink);
}

type Fonts = { reg: PDFFont; semi: PDFFont; extra: PDFFont };

/* --------------------------------------------------------------------- *
 * Document                                                              *
 * --------------------------------------------------------------------- */

export async function buildReceiptPdf(d: ReceiptInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts: Fonts = {
    reg: await pdf.embedFont(fontBytes(400), { subset: true }),
    semi: await pdf.embedFont(fontBytes(600), { subset: true }),
    extra: await pdf.embedFont(fontBytes(800), { subset: true }),
  };
  const kitReg = kitFont(400);
  const kitExtra = kitFont(800);

  const page = pdf.addPage([PAGE_W, PAGE_H]);

  const receipt = sanitize(String(d.receipt || ""), kitReg) || "-";
  const name = sanitize(String(d.name || ""), kitReg);
  const email = sanitize(String(d.email || ""), kitReg);
  const date = sanitize(String(d.date || ""), kitReg);
  const method = sanitize(String(d.method || ""), kitReg);
  const reference = sanitize(String(d.reference || ""), kitReg);
  const charge = sanitize(String(d.charge || ""), kitReg);
  const promo = sanitize(String(d.promo || ""), kitReg).toUpperCase();
  const amount = Number(d.amount || 0);
  const currency = String(d.currency || "PHP").toUpperCase();
  const isPeso = currency === "PHP";
  const total = money(amount, currency, kitExtra);

  /* Header ------------------------------------------------------------ */
  page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: yellow });
  drawLogo(page, M, PAGE_H - 52 - 46, 46);
  page.drawText("Assistara", { x: M + 46 + 14, y: 774, size: 19, font: fonts.extra, color: ink });
  drawTracked(page, "ACADEMY", { x: M + 46 + 14, y: 758, size: 8.5, font: fonts.semi, color: muted, tracking: 3.4 });

  drawTracked(page, "PAYMENT RECEIPT", { right: RIGHT, y: 776, size: 20.5, font: fonts.extra, color: ink, tracking: -0.4 });
  rightText(page, "Receipt " + receipt, 757, 10.5, fonts.semi, ink);
  rightText(page, date, 741.5, 10.5, fonts.reg, muted);

  page.drawRectangle({ x: M, y: 722, width: RIGHT - M, height: 1, color: hair });
  page.drawRectangle({ x: M, y: 722, width: 64, height: 2, color: yellow });

  /* Payment confirmation ---------------------------------------------- */
  section(page, "PAYMENT CONFIRMATION", 704, fonts.semi);

  const cardY = 604, cardH = 84;
  drawRoundRect(page, M, cardY + cardH, RIGHT - M, cardH, 16, {
    color: cream, borderColor: cardLine, borderWidth: 0.8,
  });

  const pillText = "PAID";
  const pillW = trackedWidth(pillText, fonts.extra, 11, 1.5) + 30;
  const pillY = cardY + cardH - 16 - 26;
  drawRoundRect(page, 76, pillY + 26, pillW, 26, 13, { color: yellow });
  drawTracked(page, pillText, {
    x: 76 + pillW / 2, y: pillY + 9, size: 11, font: fonts.extra, color: ink, tracking: 1.5, align: "center",
  });
  page.drawText("Payment confirmed", { x: 76, y: 626, size: 10.5, font: fonts.reg, color: muted });

  drawTracked(page, "TOTAL PAID", { right: RIGHT, y: 664, size: 9, font: fonts.semi, color: muted, tracking: 1.8 });
  rightText(page, total, 626, 26, fonts.extra, ink);

  /* Customer details --------------------------------------------------- */
  section(page, "CUSTOMER DETAILS", 576, fonts.semi);
  row(page, "Name", name, 549, fonts, kitReg);
  rowWrapped(page, "Email", email, 524, fonts, kitReg);

  /* Purchase details --------------------------------------------------- */
  section(page, "PURCHASE DETAILS", 490, fonts.semi);
  drawTracked(page, "PRODUCT", { x: M, y: 460, size: 8.5, font: fonts.semi, color: muted, tracking: 1.1 });
  page.drawText("Assistara Academy", { x: VALUE_X, y: 460, size: 13.5, font: fonts.semi, color: ink });
  page.drawText("Founding Cohort", { x: VALUE_X, y: 444, size: 9.5, font: fonts.reg, color: muted });

  const discount = REGULAR_PRICE_PHP - amount;
  const showCoupon = !!promo && isPeso && discount > 0;

  let nextSection: number;
  if (showCoupon) {
    rowAmount(page, "Original price", money(REGULAR_PRICE_PHP, currency, kitReg), 416, fonts, { color: muted });

    drawTracked(page, "COUPON", { x: M, y: 391, size: 8.5, font: fonts.semi, color: muted, tracking: 1.1 });
    const codeW = trackedWidth(promo, fonts.semi, 9.5, 0.8);
    const chipW = codeW + 28;
    drawRoundRect(page, RIGHT - chipW, 391 - 6.5 + 20, chipW, 20, 10, { color: yellow });
    drawTracked(page, promo, {
      x: RIGHT - chipW + 14, y: 391, size: 9.5, font: fonts.semi, color: ink, tracking: 0.8, align: "left",
    });

    const minus = kitReg.hasGlyphForCodePoint(0x2212) ? "\u2212" : "-";
    rowAmount(page, "Discount", minus + money(discount, currency, kitReg), 366, fonts, { font: fonts.semi });

    page.drawRectangle({ x: M, y: 344, width: RIGHT - M, height: 1, color: hair });
    drawTracked(page, "TOTAL PAID", { x: M, y: 324, size: 9, font: fonts.semi, color: ink, tracking: 1.7 });
    rightText(page, total, 324, 15, fonts.extra, ink);
    nextSection = 286;
  } else {
    page.drawRectangle({ x: M, y: 422, width: RIGHT - M, height: 1, color: hair });
    drawTracked(page, "TOTAL PAID", { x: M, y: 402, size: 9, font: fonts.semi, color: ink, tracking: 1.7 });
    rightText(page, total, 402, 15, fonts.extra, ink);
    nextSection = 364;
  }

  /* Payment details ----------------------------------------------------- */
  section(page, "PAYMENT DETAILS", nextSection, fonts.semi);
  let y = nextSection - 27;
  row(page, "Payment method", method, y, fonts, kitReg);
  y -= 25;
  row(page, "Payment date", date, y, fonts, kitReg);
  y -= 25;
  row(page, "Reference", reference, y, fonts, kitReg);
  if (charge) {
    y -= 25;
    row(page, "Charge ID", charge, y, fonts, kitReg);
  }
  y -= 25;
  drawTracked(page, "STATUS", { x: M, y, size: 8.5, font: fonts.semi, color: muted, tracking: 1.1 });
  page.drawText("Paid", { x: VALUE_X, y, size: 11.5, font: fonts.semi, color: ink });

  /* Footer ---------------------------------------------------------------- */
  page.drawRectangle({ x: M, y: 118, width: RIGHT - M, height: 1, color: hair });
  drawLogo(page, M, 90, 22);
  page.drawText("Assistara", { x: M + 22 + 10, y: 104, size: 12, font: fonts.extra, color: ink });
  page.drawText("Support: academy@getassistara.com", { x: M + 22 + 10, y: 91.5, size: 9, font: fonts.reg, color: muted });
  rightText(page, "This is a payment receipt, not a tax invoice.", 104, 9, fonts.reg, muted);
  rightText(page, "www.getassistara.com", 91.5, 9, fonts.reg, muted);

  return new Uint8Array(await pdf.save());
}
