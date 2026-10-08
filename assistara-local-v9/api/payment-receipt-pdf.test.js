"use strict";

// Static regression tests for the redesigned payment receipt PDF.
//
// The receipt renderer is a shared Deno Edge Function module, so these are
// source-level assertions (the local environment has no Deno runtime). They
// pin three things:
//   1. both email functions delegate to the single shared renderer,
//   2. the receipt input contract and coupon math stay correct,
//   3. the email/verification behaviour around the PDF is untouched.

const assert = require("node:assert");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..", "supabase", "functions");

function source(name) {
  return fs.readFileSync(path.join(ROOT, name, "index.ts"), "utf8");
}

function shared() {
  return fs.readFileSync(path.join(ROOT, "_shared", "receipt-pdf.ts"), "utf8");
}

function fonts() {
  return fs.readFileSync(path.join(ROOT, "_shared", "manrope-fonts.ts"), "utf8");
}

function indexOf(src, pattern) {
  const idx = src.indexOf(pattern);
  if (idx < 0) throw new Error(`Expected pattern not found: ${pattern}`);
  return idx;
}

/* ------------------------------------------------------------------ *
 * 1. Both functions delegate to the shared renderer                  *
 * ------------------------------------------------------------------ */

test("both email functions import buildReceiptPdf from _shared", () => {
  for (const fn of ["paymongo-webhook", "payment-complete"]) {
    const src = source(fn);
    assert.ok(
      src.includes('import { buildReceiptPdf } from "../_shared/receipt-pdf.ts"'),
      `${fn} must import the shared renderer`,
    );
    assert.ok(src.includes("buildReceiptPdf("), `${fn} must call buildReceiptPdf`);
  }
});

test("neither function keeps a local receiptPdf implementation", () => {
  for (const fn of ["paymongo-webhook", "payment-complete"]) {
    const src = source(fn);
    assert.ok(!src.includes("function receiptPdf"), `${fn}: local receiptPdf must be gone`);
    assert.ok(!src.includes("PDFDocument"), `${fn}: pdf-lib must only be imported by _shared`);
    assert.ok(!src.includes("StandardFonts"), `${fn}: StandardFonts must only be used by _shared`);
    assert.ok(!src.includes("esm.sh/pdf-lib"), `${fn}: no direct pdf-lib import`);
  }
});

test("payment-complete drops the now-unused ascii helper", () => {
  const src = source("payment-complete");
  assert.ok(!src.includes("ascii="), "ascii helper must be removed");
  assert.ok(!src.includes("ascii("), "ascii helper must not be called");
});

/* ------------------------------------------------------------------ *
 * 2. Receipt input contract                                           *
 * ------------------------------------------------------------------ */

test("paymongo receipt call passes method, reference and promo", () => {
  const src = source("paymongo-webhook");
  assert.ok(
    src.includes('method:"QR Ph via PayMongo"'),
    "QR Ph receipts must label their payment method",
  );
  assert.ok(src.includes("reference:paymentId"), "PayMongo reference must be passed");
  assert.ok(src.includes("promo:app.promo_code||null"), "historical promo_code must be passed");
});

test("payment-complete receipt call passes receipt, date, charge and promo", () => {
  const src = source("payment-complete");
  assert.ok(src.includes("buildReceiptPdf({receipt:receiptNumber"), "receipt number must be passed");
  assert.ok(src.includes("email:app.email,date,amount,currency,method"), "date/amount/currency/method must be passed");
  assert.ok(src.includes("charge:chargeId,promo:app.promo_code||null"), "charge id and historical promo_code must be passed");
});

test("both functions select promo_code on the application row", () => {
  assert.ok(source("paymongo-webhook").includes("paymongo_payment_intent_id,promo_code"));
  assert.ok(source("payment-complete").includes("receipt_number,paid_at,promo_code"));
});

test("shared ReceiptInput keeps the documented fields", () => {
  const src = shared();
  assert.match(src, /export type ReceiptInput = \{/);
  for (const field of ["receipt: string;", "name: string;", "email: string;", "date: string;", "amount: number;", "method: string;", "reference: string;", "charge?: string;", "promo?: string | null;"]) {
    assert.ok(src.includes(field), `ReceiptInput must keep \`${field}\``);
  }
});

/* ------------------------------------------------------------------ *
 * 3. Coupon math is anchored to the canonical regular price          *
 * ------------------------------------------------------------------ */

test("REGULAR_PRICE_PHP matches apply-academy-promo's regular_amount_php", () => {
  const sharedSrc = shared();
  const promoSrc = source("apply-academy-promo");
  const sharedMatch = sharedSrc.match(/REGULAR_PRICE_PHP\s*=\s*(\d+)/);
  const promoMatch = promoSrc.match(/regular_amount_php:(\d+)/);
  assert.ok(sharedMatch, "REGULAR_PRICE_PHP constant must exist");
  assert.ok(promoMatch, "apply-academy-promo must expose regular_amount_php");
  assert.strictEqual(Number(sharedMatch[1]), Number(promoMatch[1]),
    "receipt regular price must match the promo endpoint's regular price");
  assert.strictEqual(Number(sharedMatch[1]), 6900, "regular price is currently PHP 6,900");
});

test("discount block only renders for peso coupon discounts", () => {
  const src = shared();
  assert.ok(src.includes("const discount = REGULAR_PRICE_PHP - amount;"),
    "discount derives from the regular price minus what was actually paid");
  assert.ok(src.includes("const showCoupon = !!promo && isPeso && discount > 0;"),
    "discount rows must require a promo code, PHP currency and a positive discount");
});

/* ------------------------------------------------------------------ *
 * 4. Email/verification behaviour is untouched                       *
 * ------------------------------------------------------------------ */

test("paymongo email invariants are unchanged", () => {
  const src = source("paymongo-webhook");
  assert.ok(src.includes("academy-paymongo-${app.id}-v1"), "idempotency key");
  assert.ok(src.includes("Assistara-Payment-Receipt-"), "attachment filename");
  assert.ok(src.includes("Assistara <forms@getassistara.com>"), "from address");
  assert.ok(src.includes("academy@getassistara.com"), "reply_to address");
  assert.ok(
    src.includes("if(!app.payment_confirmation_sent_at)EdgeRuntime.waitUntil(sendConfirmation("),
    "sending must stay behind the payment_confirmation_sent_at guard",
  );
  assert.strictEqual(src.split("sendConfirmation(").length - 1, 2,
    "exactly one definition and one guarded call");
});

test("payment-complete email invariants are unchanged", () => {
  const src = source("payment-complete");
  assert.ok(src.includes("academy-payment-${app.id}-branded-v2"), "idempotency key");
  assert.ok(src.includes("Assistara-Payment-Receipt-"), "attachment filename");
  assert.ok(src.includes("Assistara <forms@getassistara.com>"), "from address");
  assert.ok(src.includes("academy@getassistara.com"), "reply_to address");
  const guard = indexOf(src, "if(!app.payment_confirmation_sent_at)");
  const call = indexOf(src, "buildReceiptPdf({receipt:receiptNumber");
  assert.ok(guard < call, "pdf build must happen inside the send-once guard");
  assert.ok(src.includes("db.rpc('finalize_academy_payment'"),
    "payment must be finalized via the serialized service-role RPC");
  assert.ok(src.includes("if(!finalized?.ok)"),
    "the RPC persistence result must be checked before sending");
});

test("pdf build failures stay non-fatal (try/catch around renderer)", () => {
  assert.ok(source("paymongo-webhook").includes("paymongo_receipt_pdf_failed"));
  assert.ok(source("payment-complete").includes("receipt_pdf_failed"));
});

/* ------------------------------------------------------------------ *
 * 5. Shared renderer: template, branding, purity                     *
 * ------------------------------------------------------------------ */

test("template renders every required section", () => {
  const src = shared();
  for (const label of ["PAYMENT CONFIRMATION", "CUSTOMER DETAILS", "PURCHASE DETAILS", "PAYMENT DETAILS", "TOTAL PAID"]) {
    assert.ok(src.includes(label), `template must render "${label}"`);
  }
  assert.ok(src.includes("academy@getassistara.com"), "footer must show the support address");
});

test("renderer uses the official Assistara logo path", () => {
  const src = shared();
  assert.ok(src.includes("M24 69.5"), "logo A path must come from assistara-logo.svg");
  assert.ok(src.includes("size: 7.4 * s"), "logo dot must use the official radius (7.4/96 of the mark)");
});

test("renderer only uses pdf-lib drawing APIs that actually work", () => {
  const src = shared();
  // pdf-lib's drawCircle ignores `radius` (option is `size`) and silently
  // drops `borderRadius` on drawRectangle — both shipped as visual bugs
  // before. Keep the workarounds pinned.
  assert.ok(!src.includes("radius:"), "drawCircle must not use the ignored `radius` option");
  assert.ok(!src.includes("borderRadius:"), "drawRectangle silently ignores `borderRadius`");
  assert.ok(src.includes("roundRectPath"), "rounded corners must be drawn as bezier subpaths");
  assert.ok(src.includes("function drawRoundRect"), "rounded-rect helper must exist");
});

test("fonts are embedded as local base64, never fetched at runtime", () => {
  const src = shared();
  const fontSrc = fonts();
  assert.ok(src.includes('from "./manrope-fonts.ts"'), "must import local font file");
  for (const exp of ["MANROPE_REGULAR_B64", "MANROPE_SEMIBOLD_B64", "MANROPE_EXTRABOLD_B64"]) {
    assert.ok(fontSrc.includes(`export const ${exp}`), `${exp} must be exported`);
    assert.ok(src.includes(exp), `receipt must embed ${exp}`);
  }
  assert.ok(fontSrc.length > 300000, `font file looks too small (${fontSrc.length} bytes)`);
  assert.ok(src.includes("registerFontkit"), "fontkit must be registered for subsetting");
  assert.strictEqual(src.split("{ subset: true }").length - 1, 3, "all three weights must be subset");
  assert.ok(!/\bfetch\s*\(/.test(src), "renderer must not fetch anything at runtime");
});

test("shared renderer has no env, network or database access", () => {
  const src = shared();
  assert.ok(!src.includes("Deno.env"), "no environment access");
  assert.ok(!src.includes("createClient"), "no database access");
  assert.ok(!src.includes("EdgeRuntime"), "no background scheduling");
  assert.ok(src.includes("export async function buildReceiptPdf"), "single exported entry point");
});

test("font generator script is committed", () => {
  const script = path.join(__dirname, "..", "..", "scripts", "generate-receipt-fonts.mjs");
  assert.ok(fs.existsSync(script), "scripts/generate-receipt-fonts.mjs must exist");
  const src = fs.readFileSync(script, "utf8");
  assert.ok(src.includes("manrope-fonts.ts"), "generator must write the font module");
});
