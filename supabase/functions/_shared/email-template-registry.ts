// ----------------------------------------------------------------------------
// Legacy template registry (SHARED).
//
// The exact HTML each workflow sends TODAY, copied verbatim from the Edge
// Functions, so the Email Command Center can import every existing email as a
// draft and each sender can keep using its current output until a published
// dashboard template exists.
//
// IMPORTANT: these builders must never be edited to "improve" the design. They
// are a frozen snapshot of production. To change an email, publish a template
// in the dashboard — the senders already check the published template first.
// ----------------------------------------------------------------------------

import { brandedEmail, brandedText, countdownBand } from "./email-brand.ts";
import type { LegacyFallback, TemplateVars } from "./email-templates.ts";

export interface TemplateVarDef {
  name: string;
  label: string;
  description: string;
  type: "string" | "url" | "number" | "date" | "boolean";
  required: boolean;
  sample: string;
  /** true = generated per-send by the workflow, never typed by a human. */
  dynamic: boolean;
}

export interface TemplateDef {
  key: string;
  name: string;
  category: "transactional" | "campaign" | "internal";
  subject: string;
  previewText: string;
  isCritical: boolean;
  requiredVars: string[];
  requiredLinks: { label: string; test: RegExp }[];
  vars: TemplateVarDef[];
  /** Sample values used to render a faithful preview / import draft. */
  samples: TemplateVars;
  render: (v: TemplateVars) => LegacyFallback;
}

const SITE = "https://www.getassistara.com";
const LOGO = "https://www.getassistara.com/assistara-logo.png";
const FIRST = (v: TemplateVars) => String(v.first_name ?? "there");
const money = (v: TemplateVars) => String(v.amount ?? "₱0");

// --- Brand shell copied verbatim from admin-applications/index.ts ----------
function appShell(title: string, body: string, cta?: { label: string; href: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif"><table width="100%" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px">${title}</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45">${body}</td></tr>${cta ? `<tr><td style="padding:8px 32px 12px"><a href="${cta.href}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">${cta.label}</a></td></tr><tr><td style="padding:0 32px 32px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="${cta.href}" style="color:#4f4b45;word-break:break-all">${cta.href}</a></td></tr>` : ""}</table></td></tr></table></body></html>`;
}

// --- Brand shell copied verbatim from admin-send-onboarding/index.ts --------
function onboardingShell(name: string, url: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif;color:#151515"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 30px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px;color:#fff;font-size:21px;font-weight:700">Assistara Academy</td></tr></table></td></tr><tr><td style="padding:34px 30px 8px"><h1 style="margin:0;font-size:30px">Set up your Academy account</h1></td></tr><tr><td style="padding:12px 30px 24px;font-size:16px;line-height:1.6;color:#4f4b45"><p>Hi ${name},</p><p>Your payment is confirmed and your place in Assistara Academy is secured.</p><p>Use the button below to finish onboarding and create your Academy account.</p></td></tr><tr><td style="padding:0 30px 18px"><a href="${url}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:12px">Create my Academy account</a></td></tr><tr><td style="padding:0 30px 34px;color:#77716a;font-size:12px">If the button does not work, copy this link:<br><a href="${url}" style="word-break:break-all">${url}</a></td></tr></table></td></tr></table></body></html>`;
}

// --- Payment shell copied verbatim from payment-complete/index.ts ----------
function paymentShell(title: string, body: string, cta: { label: string; href: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#151515"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 30px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px;color:#fff;font-size:23px;font-weight:700">Assistara</td></tr></table></td></tr><tr><td style="padding:34px 30px 8px"><h1 style="margin:0;font-size:30px;line-height:1.15">${title}</h1></td></tr><tr><td style="padding:12px 30px 24px;font-size:16px;line-height:1.6;color:#4f4b45">${body}</td></tr><tr><td style="padding:0 30px 18px"><a href="${cta.href}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">${cta.label}</a></td></tr><tr><td style="padding:0 30px 34px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="${cta.href}" style="color:#4f4b45;word-break:break-all">${cta.href}</a></td></tr></table></td></tr></table></body></html>`;
}

// --- GCash pay-now shell (admin-gcash-payment/index.ts) --------------------
function gcashShell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif;color:#151515"><table width="100%" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 8px"><h1>${title}</h1>${body}</td></tr></table></td></tr></table></body></html>`;
}

// --- Waitlist shell (admin-academy-capacity/index.ts) ----------------------
function capacityShell(title: string, body: string, cta?: { label: string; href: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif"><table width="100%" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px">${title}</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45">${body}</td></tr>${cta ? `<tr><td style="padding:8px 32px 12px"><a href="${cta.href}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">${cta.label}</a></td></tr><tr><td style="padding:0 32px 32px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="${cta.href}" style="color:#4f4b45;word-break:break-all">${cta.href}</a></td></tr>` : ""}</table></td></tr></table></body></html>`;
}

const esc = (s: unknown) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

// ===========================================================================
// The registry
// ===========================================================================
export const TEMPLATES: TemplateDef[] = [
  // 1. Academy application confirmation (website-form → frame())
  {
    key: "academy_application_confirmation",
    name: "Academy application confirmation",
    category: "transactional",
    subject: "Your Assistara Academy application ✨",
    previewText: "We've received your application.",
    isCritical: false,
    requiredVars: ["first_name", "apply_url"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Applicant's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "apply_url", label: "Application link", description: "Apply / next-step page", type: "url", required: true, sample: `${SITE}/academy/apply`, dynamic: false },
    ],
    samples: { first_name: "Jesse", apply_url: `${SITE}/academy/apply` },
    render: (v) => ({
      subject: "Your Assistara Academy application ✨",
      html: `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial;color:#151515"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px">We got your application</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45"><p>Hi ${esc(v.first_name ?? "there")},</p><p>Thanks for applying to Assistara Academy! We've received your application and our team is reviewing it now.</p><p>We'll email you as soon as we have an update — usually within a couple of days.</p><p>Warmly,<br><strong>The Assistara Team</strong></p></td></tr><tr><td style="border-top:1px solid #ece9e2;padding:20px 32px;color:#77716a;font-size:12px">Assistara<br>www.getassistara.com</td></tr></table></td></tr></table></body></html>`,
      text: `Hi ${FIRST(v)},\n\nThanks for applying to Assistara Academy! We've received your application and our team is reviewing it now.\n\nWe'll email you as soon as we have an update.\n\nThe Assistara Team — www.getassistara.com`,
      senderName: "Assistara",
    }),
  },

  // 2. Internal: new application notification (admin inbox)
  {
    key: "internal_new_application",
    name: "Internal: new application notification",
    category: "internal",
    subject: "New Academy application: {{first_name}}",
    previewText: "",
    isCritical: false,
    requiredVars: ["first_name", "email", "apply_url"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "Applicant name", description: "Full name of applicant", type: "string", required: true, sample: "Jesse Dela Cruz", dynamic: true },
      { name: "email", label: "Applicant email", description: "Applicant's email address", type: "string", required: true, sample: "jesse@example.com", dynamic: true },
      { name: "apply_url", label: "Admin link", description: "Link to the admin dashboard", type: "url", required: true, sample: `${SITE}/admin`, dynamic: false },
    ],
    samples: { first_name: "Jesse Dela Cruz", email: "jesse@example.com", apply_url: `${SITE}/admin` },
    render: (v) => ({
      subject: `New Academy application: ${String(v.first_name ?? "")}`,
      html: appShell("New Academy application", `<p><strong>Name:</strong> ${esc(v.first_name)}</p><p><strong>Email:</strong> ${esc(v.email)}</p><p>Review it in the admin dashboard.</p>`),
      text: `New Academy application\n\nName: ${String(v.first_name ?? "")}\nEmail: ${String(v.email ?? "")}\n\nReview in the admin dashboard: ${String(v.apply_url ?? "")}`,
      senderName: "Assistara",
    }),
  },

  // 3. Application accepted
  {
    key: "academy_application_accepted",
    name: "Application accepted",
    category: "transactional",
    subject: "You're IN! Welcome to Assistara Academy!",
    previewText: "",
    isCritical: true,
    requiredVars: ["first_name", "checkout_url", "limit"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Applicant's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "checkout_url", label: "Payment link", description: "Checkout link to secure the seat", type: "url", required: true, sample: `${SITE}/academy/enroll?token=sample-token`, dynamic: true },
      { name: "limit", label: "Cohort limit", description: "Paid spots available", type: "number", required: true, sample: "15", dynamic: false },
    ],
    samples: { first_name: "Jesse", checkout_url: `${SITE}/academy/enroll?token=sample-token`, limit: "15" },
    render: (v) => ({
      subject: "You're IN! Welcome to Assistara Academy!",
      html: appShell(
        "You're IN! Welcome to Assistara Academy!",
        `<p>Hi ${FIRST(v)},</p><h2 style="font-size:22px;margin:20px 0 8px">You did it!</h2><p>We've reviewed your application, and we're excited to offer you a place in the <strong>Assistara Academy Founding Cohort!</strong></p><p>You're one step closer to building your skills, finding your first remote client, and creating new opportunities for yourself.</p><p><strong>Here's the important part:</strong></p><div style="background:#fff9df;border:1px solid #e6c353;border-radius:12px;padding:18px;color:#151515"><strong>Only ${esc(v.limit)} paid spots available!</strong><br>Your application has been accepted, but your seat isn't reserved just yet. Spots are confirmed once payment is completed.</div><p>Ready to make it official? Secure your place and let's get started!</p><p>See you inside!<br><strong>The Assistara Team</strong></p>`,
        { label: "YES! Secure my spot", href: String(v.checkout_url ?? "") },
      ),
      senderName: "Assistara Academy",
    }),
  },

  // 4. Application not selected (waitlist)
  {
    key: "academy_application_waitlisted",
    name: "Application not selected",
    category: "transactional",
    subject: "Not this round, but you're on our list!",
    previewText: "",
    isCritical: false,
    requiredVars: ["first_name"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Applicant's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
    ],
    samples: { first_name: "Jesse" },
    render: (v) => ({
      subject: "Not this round, but you're on our list!",
      html: appShell(
        "Not this round, but you're on our list!",
        `<p>Hi ${FIRST(v)},</p><p>We've got some news for you!</p><p>The response to Assistara Academy has been incredible, and unfortunately, we couldn't offer you a spot in our first cohort.</p><p><strong>But fear not! You're on our waitlist!</strong></p><p>That means you'll be among the first to hear when spots open up or our next cohort launches.</p><p>Your journey toward landing your first remote client doesn't stop here. We're excited to hopefully have you join us next time!</p><p>Keep an eye on your inbox. We'll be in touch!</p><p><strong>See you soon!</strong><br>The Assistara Team</p>`,
      ),
      senderName: "Assistara Academy",
    }),
  },

  // 5. Onboarding / account setup
  {
    key: "academy_onboarding",
    name: "Academy onboarding / account setup",
    category: "transactional",
    subject: "Set up your Assistara Academy account",
    previewText: "",
    isCritical: true,
    requiredVars: ["first_name", "onboarding_url"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Student's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "onboarding_url", label: "Onboarding link", description: "Personal enrollment token link", type: "url", required: true, sample: `${SITE}/academy/onboarding?token=sample-token`, dynamic: true },
    ],
    samples: { first_name: "Jesse", onboarding_url: `${SITE}/academy/onboarding?token=sample-token` },
    render: (v) => ({
      subject: "Set up your Assistara Academy account",
      html: onboardingShell(String(v.first_name ?? "there"), String(v.onboarding_url ?? "")),
      senderName: "Assistara Academy",
    }),
  },

  // 6/7. Payment confirmation (payment-complete + paymongo-webhook)
  {
    key: "academy_payment_confirmation",
    name: "Payment confirmation",
    category: "transactional",
    subject: "Payment received 🎉 {{receipt_number}} | Assistara Academy",
    previewText: "",
    isCritical: true,
    requiredVars: ["first_name", "receipt_number", "amount", "currency", "payment_method", "date", "onboarding_url"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Buyer's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "receipt_number", label: "Receipt number", description: "Generated receipt reference", type: "string", required: true, sample: "RCPT-2026-0001", dynamic: true },
      { name: "amount", label: "Amount", description: "Formatted amount with currency", type: "string", required: true, sample: "₱14,900.00", dynamic: true },
      { name: "currency", label: "Currency", description: "PHP / EUR / USD", type: "string", required: true, sample: "PHP", dynamic: true },
      { name: "payment_method", label: "Payment method", description: "Card brand + last4 or GCash", type: "string", required: true, sample: "VISA ending 4242", dynamic: true },
      { name: "date", label: "Payment date", description: "Formatted payment timestamp", type: "string", required: true, sample: "October 11, 2026 at 6:00 PM", dynamic: true },
      { name: "onboarding_url", label: "Onboarding link", description: "Personal enrollment token link", type: "url", required: true, sample: `${SITE}/academy/onboarding?token=sample-token`, dynamic: true },
    ],
    samples: {
      first_name: "Jesse", receipt_number: "RCPT-2026-0001", amount: "₱14,900.00", currency: "PHP",
      payment_method: "VISA ending 4242", date: "October 11, 2026 at 6:00 PM",
      onboarding_url: `${SITE}/academy/onboarding?token=sample-token`,
    },
    render: (v) => {
      const details = `<p>Hi ${FIRST(v)},</p><p>We received your payment and your place in Assistara Academy is secured. 🎉</p><table width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;background:#faf9f5;border-radius:14px"><tr><td style="padding:16px 18px"><strong>Purchase</strong><br>Assistara Academy - Founding Cohort</td><td align="right" style="padding:16px 18px"><strong>${esc(money(v))}</strong></td></tr><tr><td style="padding:0 18px 12px;color:#777">Receipt</td><td align="right" style="padding:0 18px 12px">${esc(v.receipt_number)}</td></tr><tr><td style="padding:0 18px 12px;color:#777">Payment method</td><td align="right" style="padding:0 18px 12px">${esc(v.payment_method)}</td></tr><tr><td style="padding:0 18px 16px;color:#777">Status</td><td align="right" style="padding:0 18px 16px"><strong>PAID</strong></td></tr></table><p>Your branded payment receipt is attached as a PDF for your records.</p><p>Your next step is to set up your Academy account.</p>`;
      return {
        subject: `Payment received 🎉 ${String(v.receipt_number ?? "")} | Assistara Academy`,
        html: paymentShell("Payment received 🎉", details, { label: "Set up my Academy account", href: String(v.onboarding_url ?? "") }),
        senderName: "Assistara Academy",
      };
    },
  },

  // 8. GCash payment approved (review-gcash-payment)
  {
    key: "gcash_payment_approved",
    name: "GCash payment approved",
    category: "transactional",
    subject: "GCash payment confirmed 🎉",
    previewText: "",
    isCritical: false,
    requiredVars: ["first_name", "onboarding_url"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Buyer's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "onboarding_url", label: "Onboarding link", description: "Personal enrollment token link", type: "url", required: true, sample: `${SITE}/academy/onboarding?token=sample-token`, dynamic: true },
    ],
    samples: { first_name: "Jesse", onboarding_url: `${SITE}/academy/onboarding?token=sample-token` },
    render: (v) => ({
      subject: "GCash payment confirmed 🎉",
      html: appShell("GCash payment confirmed 🎉", `<p>Hi ${FIRST(v)},</p><p>We've confirmed your GCash payment. Your place in Assistara Academy is secured.</p><p>Use the button below to set up your Academy account.</p>`, { label: "Set up my Academy account", href: String(v.onboarding_url ?? "") }),
      senderName: "Assistara Academy",
    }),
  },

  // 9. GCash payment instructions (admin-gcash-payment)
  {
    key: "gcash_payment_instructions",
    name: "GCash payment instructions",
    category: "transactional",
    subject: "Your GCash payment link",
    previewText: "",
    isCritical: false,
    requiredVars: ["first_name", "amount", "gcash_url"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Buyer's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "amount", label: "Amount", description: "Amount due", type: "string", required: true, sample: "₱14,900.00", dynamic: true },
      { name: "gcash_url", label: "GCash link", description: "Payment/QR link", type: "url", required: true, sample: `${SITE}/academy/pay?token=sample-token`, dynamic: true },
    ],
    samples: { first_name: "Jesse", amount: "₱14,900.00", gcash_url: `${SITE}/academy/pay?token=sample-token` },
    render: (v) => ({
      subject: "Your GCash payment link",
      html: gcashShell("Complete your payment", `<p>Hi ${FIRST(v)},</p><p>Here's your GCash payment link for <strong>${esc(v.amount)}</strong>. Scan the QR code or use the link below.</p>`),
      senderName: "Assistara Academy",
    }),
  },

  // 10. Waitlist seat opened (admin-academy-capacity)
  {
    key: "academy_waitlist_seat_opened",
    name: "Waitlist seat opened",
    category: "transactional",
    subject: "A seat just opened in the Academy cohort 🎉",
    previewText: "",
    isCritical: false,
    requiredVars: ["first_name", "waitlist_url"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Waitlisted applicant's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "waitlist_url", label: "Claim link", description: "Personal private link to claim the seat", type: "url", required: true, sample: `${SITE}/academy/enroll?token=sample-token`, dynamic: true },
    ],
    samples: { first_name: "Jesse", waitlist_url: `${SITE}/academy/enroll?token=sample-token` },
    render: (v) => ({
      subject: "A seat just opened in the Academy cohort 🎉",
      html: capacityShell(
        "A seat just opened in the Academy cohort 🎉",
        `<p>Hi ${FIRST(v)},</p><p>Good news — a spot just opened up in the Assistara Academy founding cohort, and you're next on the priority waitlist.</p><p>Your invite is time-sensitive: seats are confirmed in payment order.</p><p><strong>This link is private — please don't share it.</strong></p>`,
        { label: "Secure my spot →", href: String(v.waitlist_url ?? "") },
      ),
      senderName: "Assistara Academy",
    }),
  },

  // 11. Masterclass 24h reminder (Xyra's personal email) — plain design
  {
    key: "masterclass_reminder_24h",
    name: "Masterclass 24h reminder",
    category: "campaign",
    subject: "{{first_name}}, your Assistara masterclass is {{day_word}} — here's your join link",
    previewText: "Your personal join link is inside.",
    isCritical: true,
    requiredVars: ["first_name", "event_date", "event_time", "day_word", "join_url", "unsubscribe_url", "calendar_url", "ics_url"],
    requiredLinks: [{ label: "unsubscribe link", test: /href="\{\{unsubscribe_url\}\}"/ }],
    vars: [
      { name: "first_name", label: "First name", description: "Attendee's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "event_date", label: "Event date", description: "Formatted event date", type: "string", required: true, sample: "Sunday, October 11", dynamic: true },
      { name: "event_time", label: "Event time", description: "Formatted event time", type: "string", required: true, sample: "6:00 PM", dynamic: true },
      { name: "day_word", label: "Day word", description: "today / tomorrow / weekday", type: "string", required: true, sample: "tomorrow", dynamic: true },
      { name: "join_url", label: "Join link", description: "Personal livestream link", type: "url", required: true, sample: `${SITE}/live?t=sampletoken`, dynamic: true },
      { name: "unsubscribe_url", label: "Unsubscribe link", description: "Token-based opt-out link", type: "url", required: true, sample: `${SITE}/unsubscribe?t=sampletoken`, dynamic: true },
      { name: "calendar_url", label: "Calendar link", description: "Add-to-calendar link", type: "url", required: true, sample: "https://calendar.google.com/calendar/render?action=TEMPLATE", dynamic: true },
      { name: "ics_url", label: "Calendar file", description: ".ics download link", type: "url", required: true, sample: `${SITE}/masterclass.ics?t=sampletoken`, dynamic: true },
    ],
    samples: {
      first_name: "Jesse", event_date: "Sunday, October 11", event_time: "6:00 PM", day_word: "tomorrow",
      join_url: `${SITE}/live?t=sampletoken`, unsubscribe_url: `${SITE}/unsubscribe?t=sampletoken`,
      calendar_url: "https://calendar.google.com/calendar/render?action=TEMPLATE", ics_url: `${SITE}/masterclass.ics?t=sampletoken`,
    },
    render: (v) => ({
      subject: `${FIRST(v)}, your Assistara masterclass is ${String(v.day_word ?? "")} — here's your join link`,
      html: reminder24hHtml(v),
      text: reminder24hText(v),
      senderName: "Xyra from Assistara",
      replyTo: "xyra@getassistara.com",
    }),
  },

  // 12. Masterclass follow-up
  {
    key: "masterclass_followup",
    name: "Masterclass follow-up",
    category: "campaign",
    subject: "Oops, one more thing! 💛",
    previewText: "",
    isCritical: false,
    requiredVars: ["first_name", "apps_count", "seats", "unsubscribe_url", "academy_url"],
    requiredLinks: [{ label: "unsubscribe link", test: /href="\{\{unsubscribe_url\}\}"/ }],
    vars: [
      { name: "first_name", label: "First name", description: "Attendee's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "apps_count", label: "Applications", description: "Academy applications so far", type: "number", required: true, sample: "13", dynamic: true },
      { name: "seats", label: "Seats", description: "Cohort seats", type: "number", required: true, sample: "15", dynamic: false },
      { name: "unsubscribe_url", label: "Unsubscribe link", description: "Token-based opt-out link", type: "url", required: true, sample: `${SITE}/unsubscribe?t=sampletoken`, dynamic: true },
      { name: "academy_url", label: "Academy link", description: "Academy apply page", type: "url", required: true, sample: `${SITE}/academy/apply`, dynamic: false },
    ],
    samples: { first_name: "Jesse", apps_count: "13", seats: "15", unsubscribe_url: `${SITE}/unsubscribe?t=sampletoken`, academy_url: `${SITE}/academy/apply` },
    render: (v) => ({
      subject: "Oops, one more thing! 💛",
      html: followupHtml(v),
      text: followupText(v),
      senderName: "Xyra from Assistara",
      replyTo: "xyra@getassistara.com",
    }),
  },

  // 13. Masterclass 30-min reminder (canonical branded)
  {
    key: "masterclass_reminder_30",
    name: "Masterclass 30-minute reminder",
    category: "campaign",
    subject: "We're going live in 30 minutes! 💛",
    previewText: "",
    isCritical: true,
    requiredVars: ["first_name", "join_url", "unsubscribe_url"],
    requiredLinks: [{ label: "unsubscribe link", test: /href="\{\{unsubscribe_url\}\}"/ }],
    vars: [
      { name: "first_name", label: "First name", description: "Attendee's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "join_url", label: "Join link", description: "Personal livestream link", type: "url", required: true, sample: `${SITE}/live?t=sampletoken`, dynamic: true },
      { name: "unsubscribe_url", label: "Unsubscribe link", description: "Token-based opt-out link", type: "url", required: true, sample: `${SITE}/unsubscribe?t=sampletoken`, dynamic: true },
    ],
    samples: { first_name: "Jesse", join_url: `${SITE}/live?t=sampletoken`, unsubscribe_url: `${SITE}/unsubscribe?t=sampletoken` },
    render: (v) => ({
      subject: "We're going live in 30 minutes! 💛",
      html: reminder30Html(v),
      text: reminder30Text(v),
      senderName: "Assistara Academy",
    }),
  },

  // 14. Masterclass 5-min reminder (canonical branded)
  {
    key: "masterclass_reminder_5",
    name: "Masterclass 5-minute reminder",
    category: "campaign",
    subject: "We're live! Where are you? 👀",
    previewText: "",
    isCritical: true,
    requiredVars: ["first_name", "join_url", "unsubscribe_url"],
    requiredLinks: [{ label: "unsubscribe link", test: /href="\{\{unsubscribe_url\}\}"/ }],
    vars: [
      { name: "first_name", label: "First name", description: "Attendee's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "join_url", label: "Join link", description: "Personal livestream link", type: "url", required: true, sample: `${SITE}/live?t=sampletoken`, dynamic: true },
      { name: "unsubscribe_url", label: "Unsubscribe link", description: "Token-based opt-out link", type: "url", required: true, sample: `${SITE}/unsubscribe?t=sampletoken`, dynamic: true },
    ],
    samples: { first_name: "Jesse", join_url: `${SITE}/live?t=sampletoken`, unsubscribe_url: `${SITE}/unsubscribe?t=sampletoken` },
    render: (v) => ({
      subject: "We're live! Where are you? 👀",
      html: reminder5Html(v),
      text: reminder5Text(v),
      senderName: "Assistara Academy",
    }),
  },

  // 15. Masterclass registration confirmation (website-form, when a visitor
  //     saves a free masterclass spot).
  {
    key: "masterclass_registration_confirmation",
    name: "Masterclass registration confirmation",
    category: "transactional",
    subject: "You're in 🎉 See you Sunday",
    previewText: "",
    isCritical: false,
    requiredVars: ["first_name", "live_url"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Registrant's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "live_url", label: "Masterclass link", description: "Personal masterclass link", type: "url", required: true, sample: `${SITE}/live?t=sampletoken`, dynamic: true },
    ],
    samples: { first_name: "Jesse", live_url: `${SITE}/live?t=sampletoken` },
    render: (v) => {
      const first = FIRST(v);
      const liveUrl = String(v.live_url ?? "");
      const body = `<p>Hey ${esc(first)},</p><p>Your spot is officially saved for:</p><h2 style="margin:20px 0 8px;color:#151515;font-size:24px;line-height:1.2">How to Land Your First Remote Client</h2><div style="margin:18px 0 22px;padding:20px 22px;background:#fff8d6;border:1px solid #f1df86;border-radius:16px"><div style="font-size:20px;line-height:1.4;font-weight:800;color:#151515">📅 Sunday, October 11</div><div style="margin-top:4px;font-size:16px;font-weight:700;color:#4f4b45">6:00 PM PHT · Live Online</div></div><p>We're going to show you the practical path from <strong>complete beginner → finding international clients → landing your first remote client.</strong></p><p><strong>Come ready to take notes. 🚀💛</strong></p>`;
      const cta = `<div style="margin:26px 0 8px"><a href="${esc(liveUrl)}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:800;padding:15px 21px;border-radius:999px">Join the masterclass →</a></div><p style="margin:10px 0 20px;font-size:13px;color:#77716a;line-height:1.55">Your personal masterclass link:<br><a href="${esc(liveUrl)}" style="color:#151515;font-weight:700;word-break:break-all">${esc(liveUrl)}</a></p>`;
      return {
        subject: "You're in 🎉 See you Sunday",
        html: wfFrame("You're in. 🎉", body + cta),
        text: `You're in 🎉\n\nHey ${first},\n\nYour spot is officially saved for: How to Land Your First Remote Client\n\n📅 Sunday, October 11\n6:00 PM PHT · Live Online\n\nJoin the masterclass: ${liveUrl}`,
        senderName: "Assistara",
      };
    },
  },

  // 16. GCash payment could not be verified
  {
    key: "gcash_payment_unverified",
    name: "GCash payment could not be verified",
    category: "transactional",
    subject: "We need your GCash payment screenshot | Assistara Academy",
    previewText: "",
    isCritical: false,
    requiredVars: ["first_name", "gcash_reference"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Applicant's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "gcash_reference", label: "GCash reference", description: "Reference the applicant submitted", type: "string", required: true, sample: "GXCH-123456", dynamic: true },
    ],
    samples: { first_name: "Jesse", gcash_reference: "GXCH-123456" },
    render: (v) => ({
      subject: "We need your GCash payment screenshot | Assistara Academy",
      html: gcashShell("We could not verify your GCash payment", `<p>Hi ${FIRST(v)},</p><p>We received your payment submission, but we could not verify it from the reference provided.</p><p><strong>Please reply directly to this email with a screenshot of your GCash payment or receipt.</strong> We will review it manually.</p><p>Reference: <strong>${esc(v.gcash_reference)}</strong></p>`),
      senderName: "Assistara Academy",
    }),
  },

  // 17. GCash screenshot request
  {
    key: "gcash_screenshot_request",
    name: "GCash screenshot request",
    category: "transactional",
    subject: "Quick check on your GCash payment 👀 | Assistara Academy",
    previewText: "",
    isCritical: false,
    requiredVars: ["first_name"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Applicant's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
    ],
    samples: { first_name: "Jesse" },
    render: (v) => ({
      subject: "Quick check on your GCash payment 👀 | Assistara Academy",
      html: gcashShell("Quick check on your GCash payment 👀", `<p>Hey ${FIRST(v)},</p><p>We got your payment details, but we couldn't match the payment just yet.</p><p><strong>Already paid?</strong> Reply to this email with a screenshot of your GCash payment and we'll check it for you.</p><p>Once you've paid, reply here with the screenshot and we'll take care of the rest. 💛</p><p>Assistara Academy</p>`),
      senderName: "Assistara Academy",
    }),
  },

  // 18. GCash payment follow-up
  {
    key: "gcash_payment_followup",
    name: "GCash payment follow-up",
    category: "transactional",
    subject: "Still want to secure your place? 😊 | Assistara Academy",
    previewText: "",
    isCritical: false,
    requiredVars: ["first_name"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Applicant's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
    ],
    samples: { first_name: "Jesse" },
    render: (v) => ({
      subject: "Still want to secure your place? 😊 | Assistara Academy",
      html: gcashShell("Still want to secure your place? 😊", `<p>Hey ${FIRST(v)},</p><p>Just a quick follow-up on your Assistara Academy payment.</p><p><strong>If you already paid,</strong> reply with your GCash screenshot and we'll verify it for you.</p><p>Once it's done, send us the screenshot and we'll take care of the rest. 💛</p><p>Assistara Academy</p>`),
      senderName: "Assistara Academy",
    }),
  },

  // 19. GCash payment approved (review-gcash-payment send site)
  {
    key: "gcash_payment_approved",
    name: "GCash payment approved",
    category: "transactional",
    subject: "Payment received 🎉{{receipt_number}} | Assistara Academy",
    previewText: "",
    isCritical: true,
    requiredVars: ["first_name", "receipt_number", "onboarding_url"],
    requiredLinks: [],
    vars: [
      { name: "first_name", label: "First name", description: "Buyer's first name", type: "string", required: true, sample: "Jesse", dynamic: true },
      { name: "receipt_number", label: "Receipt number", description: "Generated receipt reference", type: "string", required: true, sample: "RCPT-2026-0001", dynamic: true },
      { name: "onboarding_url", label: "Onboarding link", description: "Personal enrollment token link", type: "url", required: true, sample: `${SITE}/academy/onboarding?token=sample-token`, dynamic: true },
    ],
    samples: { first_name: "Jesse", receipt_number: "RCPT-2026-0001", onboarding_url: `${SITE}/academy/onboarding?token=sample-token` },
    render: (v) => ({
      subject: `Payment received 🎉${v.receipt_number ? " " + String(v.receipt_number) : ""} | Assistara Academy`,
      html: gcashShell("Payment received 🎉", `<p>Hi ${FIRST(v)},</p><p>We verified your GCash payment of <strong>₱6,900</strong>. Your place in Assistara Academy is secured.</p>${v.receipt_number ? `<p>Receipt: <strong>${esc(v.receipt_number)}</strong></p>` : ""}<p>Your next step is to set up your Academy account.</p>`),
      senderName: "Assistara Academy",
    }),
  },
];

// --- website-form frame() copied verbatim (masterclass registration email) --
function wfFrame(pre: string, heading: string, content: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial;color:#151515"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px">${heading}</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45">${content}</td></tr><tr><td style="border-top:1px solid #ece9e2;padding:20px 32px;color:#77716a;font-size:12px">Assistara<br>www.getassistara.com</td></tr></table></td></tr></table></body></html>`;
}

// ---------------------------------------------------------------------------
// Verbatim legacy renderers for the masterclass templates
// ---------------------------------------------------------------------------
function reminder24hHtml(v: TemplateVars): string {
  const joinUrl = String(v.join_url ?? "");
  const unsubUrl = String(v.unsubscribe_url ?? "");
  const calUrl = String(v.calendar_url ?? "");
  const icsUrl = String(v.ics_url ?? "");
  const escAttr = (s: string) => esc(s).replaceAll("`", "&#096;");
  const P = "margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323";
  const A = "color:#1155cc;text-decoration:underline";
  const first = FIRST(v);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your free masterclass reminder</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="left" style="padding:32px 20px 44px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="font-family:Arial,Helvetica,sans-serif;color:#232323;font-size:16px;line-height:1.62">
    <p style="${P}">Hey ${esc(first)}! 💛</p>
    <p style="${P}">Okay, I have to admit... I&#8217;ve been looking forward to <b>tomorrow</b> all week! ✨</p>
    <p style="${P}">I&#8217;m Xyra, co-founder of Assistara, and ${String(v.day_word ?? "")} I&#8217;ll be going live with the free masterclass you signed up for:</p>
    <p style="${P}"><b>How to Land Your First Remote Client (as a Complete Beginner)</b></p>
    <p style="${P}">And don&#8217;t worry, I&#8217;m not going to tell you to just &#8220;learn some skills&#8221; and send 100 job applications. 😅</p>
    <p style="${P}">I&#8217;ve worked remotely with <b>multiple international clients</b>, earned in foreign currencies, and experienced firsthand what it&#8217;s like to build opportunities beyond the traditional 9-to-5.</p>
    <p style="${P}">I&#8217;ve seen what clients actually look for, what makes them trust someone enough to hire them, and why so many beginners struggle to get noticed.</p>
    <p style="${P}">And if there&#8217;s one thing that experience has taught me, it&#8217;s this:</p>
    <p style="${P}"><b>Making money online doesn&#8217;t have to be as complicated as people make it seem.</b> 💛</p>
    <p style="${P}">You don&#8217;t need to have everything figured out. You need to know what services people are willing to pay for, where to find the right clients, and how to give them a reason to choose you.</p>
    <p style="${P}">That&#8217;s exactly what I want to show you ${String(v.day_word ?? "")}.</p>
    <p style="margin:0 0 20px;line-height:1.7;font-size:16px;color:#232323">
      📅 <b>${esc(String(v.event_date ?? ""))}</b><br>
      ⏰ <b>${esc(String(v.event_time ?? ""))} Philippine Time</b><br>
      📍 <b>Live on Assistara</b>
    </p>
    <p style="${P}">Here&#8217;s your personal link to join us live:</p>
    <p style="${P}"><a href="${escAttr(joinUrl)}" style="${A};word-break:break-all">${esc(joinUrl)}</a></p>
    <p style="${P}">Save this email so you can easily find your link when it&#8217;s time to join! 💛</p>
    <p style="${P}"><a href="${escAttr(calUrl)}" style="${A}">📅 Add to Calendar</a></p>
    <p style="margin:-8px 0 18px;line-height:1.5;font-size:13px;color:#8a8a8a">On Apple or Outlook? <a href="${escAttr(icsUrl)}" style="color:#8a8a8a;text-decoration:underline">Download the calendar file (.ics)</a></p>
    <p style="${P}">Grab your favorite drink, bring your questions, and come with an open mind. I have so much I want to share with you! ☀️</p>
    <p style="${P}">Can&#8217;t wait to see you there! 💛</p>
    <p style="margin:26px 0 30px;line-height:1.55;font-size:16px;color:#232323"><b>Xyra Mendoza</b><br><span style="color:#6b6b6b">Co-founder, Assistara</span></p>
    <p style="margin:0;line-height:1.6;font-size:12px;color:#8a8a8a">You&#8217;re receiving this because you registered for the Assistara free masterclass.<br><a href="${escAttr(unsubUrl)}" style="color:#8a8a8a;text-decoration:underline">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function reminder24hText(v: TemplateVars): string {
  const dayWord = String(v.day_word ?? "");
  return [
    `Hey ${FIRST(v)}! 💛`,
    "Okay, I have to admit... I've been looking forward to tomorrow all week! ✨",
    `I'm Xyra, co-founder of Assistara, and ${dayWord} I'll be going live with the free masterclass you signed up for:`,
    "How to Land Your First Remote Client (as a Complete Beginner)",
    [`📅 ${String(v.event_date ?? "")}`, `⏰ ${String(v.event_time ?? "")} Philippine Time`, "📍 Live on Assistara"].join("\n"),
    ["Here's your personal link to join us live:", String(v.join_url ?? "")].join("\n"),
    "Save this email so you can easily find your link when it's time to join! 💛",
    ["Add to Calendar: " + String(v.calendar_url ?? ""), "Apple / Outlook (.ics): " + String(v.ics_url ?? "")].join("\n"),
    "Can't wait to see you there! 💛",
    ["Xyra Mendoza", "Co-founder, Assistara"].join("\n"),
    ["You're receiving this because you registered for the Assistara free masterclass.", "Unsubscribe: " + String(v.unsubscribe_url ?? "")].join("\n"),
  ].join("\n\n");
}

function followupHtml(v: TemplateVars): string {
  const unsubUrl = String(v.unsubscribe_url ?? "");
  const escAttr = (s: string) => esc(s).replaceAll("`", "&#096;");
  const P = "margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323";
  const A = "color:#1155cc;text-decoration:underline";
  const ACADEMY_URL = String(v.academy_url ?? `${SITE}/academy/apply`);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oops, one more thing</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="left" style="padding:32px 20px 44px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="font-family:Arial,Helvetica,sans-serif;color:#232323;font-size:16px;line-height:1.62">
    <p style="${P}">Hey ${esc(FIRST(v))}! 💛</p>
    <p style="${P}">Oops! 😅 The P.S. from my last email got cut off, and I didn&#8217;t want you to miss it!</p>
    <p style="${P}"><b>P.S.</b> We&#8217;ve already received <b>${esc(String(v.apps_count ?? ""))} applications for our ${esc(String(v.seats ?? ""))} Academy spots!</b> 💛</p>
    <p style="${P}">We review applications in the order they come in, so I wanted to make sure you had the chance to apply before tomorrow&#8217;s masterclass!</p>
    <p style="${P}">👉 <a href="${escAttr(ACADEMY_URL)}" style="${A}">${esc(ACADEMY_URL)}</a></p>
    <p style="${P}">See you tomorrow!</p>
    <p style="margin:26px 0 30px;line-height:1.55;font-size:16px;color:#232323">Xyra 💛</p>
    <p style="margin:0;line-height:1.6;font-size:12px;color:#8a8a8a">You&#8217;re receiving this because you registered for the Assistara free masterclass.<br><a href="${escAttr(unsubUrl)}" style="color:#8a8a8a;text-decoration:underline">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function followupText(v: TemplateVars): string {
  const ACADEMY_URL = String(v.academy_url ?? `${SITE}/academy/apply`);
  return [
    `Hey ${FIRST(v)}! 💛`,
    "Oops! 😅 The P.S. from my last email got cut off, and I didn't want you to miss it!",
    `P.S. We've already received ${String(v.apps_count ?? "")} applications for our ${String(v.seats ?? "")} Academy spots! 💛`,
    "We review applications in the order they come in, so I wanted to make sure you had the chance to apply before tomorrow's masterclass!",
    "👉 " + ACADEMY_URL,
    "See you tomorrow!",
    "Xyra 💛",
    ["You're receiving this because you registered for the Assistara free masterclass.", "Unsubscribe: " + String(v.unsubscribe_url ?? "")].join("\n"),
  ].join("\n\n");
}

function reminder30Html(v: TemplateVars): string {
  const joinUrl = String(v.join_url ?? "");
  const unsubUrl = String(v.unsubscribe_url ?? "");
  const bodyHtml =
    `<p style="margin:0 0 16px">Hey ${esc(FIRST(v))}! 💛</p>` +
    `<p style="margin:0 0 16px">It&#8217;s almost time!! 😍</p>` +
    `<p style="margin:0 0 16px">We&#8217;re going live in <b>30 minutes</b>, and I can&#8217;t wait to see you there!</p>` +
    `<p style="margin:0">Here&#8217;s your personal link:</p>`;
  const afterHtml =
    `<p style="margin:0 0 16px">Grab a coffee, get comfy, and I&#8217;ll see you soon! ☕✨</p>` +
    `<p style="margin:0">The Assistara Team 💛</p>`;
  const footerHtml = `You&#8217;re receiving this because you registered for the Assistara free masterclass.<br><a href="${esc(unsubUrl)}" style="color:#77716a;text-decoration:underline">Unsubscribe</a>`;
  return brandedEmail({
    bodyHtml,
    cta: { label: "JOIN THE MASTERCLASS", href: joinUrl },
    afterHtml,
    footerHtml,
    countdownHtml: countdownBand({ big: "30", label: "MINUTES TO GO", meta: "Sunday, October 11 · 6:00 PM PHT" }),
  });
}

function reminder30Text(v: TemplateVars): string {
  return brandedText({
    lines: [`Hey ${FIRST(v)}! 💛`, "It's almost time!! 😍", "We're going live in 30 minutes, and I can't wait to see you there!", "Here's your personal link:"],
    cta: { label: "JOIN THE MASTERCLASS", href: String(v.join_url ?? "") },
    afterLines: ["Grab a coffee, get comfy, and I'll see you soon! ☕✨", "The Assistara Team 💛"],
    footerLines: ["You're receiving this because you registered for the Assistara free masterclass.", "Unsubscribe: " + String(v.unsubscribe_url ?? "")],
  });
}

function reminder5Html(v: TemplateVars): string {
  const joinUrl = String(v.join_url ?? "");
  const unsubUrl = String(v.unsubscribe_url ?? "");
  const bodyHtml =
    `<p style="margin:0 0 16px">Hey ${esc(FIRST(v))}!</p>` +
    `<p style="margin:0 0 16px">We&#8217;re live! Where are youuu? 👀</p>` +
    `<p style="margin:0">Come join us, we&#8217;re waiting for you!</p>`;
  const afterHtml = `<p style="margin:0">The Assistara Team 💛</p>`;
  const footerHtml = `You&#8217;re receiving this because you registered for the Assistara free masterclass.<br><a href="${esc(unsubUrl)}" style="color:#77716a;text-decoration:underline">Unsubscribe</a>`;
  return brandedEmail({ bodyHtml, cta: { label: "JOIN US LIVE", href: joinUrl }, afterHtml, footerHtml });
}

function reminder5Text(v: TemplateVars): string {
  return brandedText({
    lines: [`Hey ${FIRST(v)}!`, "We're live! Where are youuu? 👀", "Come join us, we're waiting for you!"],
    cta: { label: "JOIN US LIVE", href: String(v.join_url ?? "") },
    afterLines: ["The Assistara Team 💛"],
    footerLines: ["You're receiving this because you registered for the Assistara free masterclass.", "Unsubscribe: " + String(v.unsubscribe_url ?? "")],
  });
}

// ---------------------------------------------------------------------------
// Helpers used by the admin function
// ---------------------------------------------------------------------------
export function findTemplateDef(key: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

export function legacyFallback(key: string, vars: TemplateVars): LegacyFallback {
  const def = findTemplateDef(key);
  if (!def) throw new Error(`No legacy template registered for key "${key}"`);
  return def.render({ ...def.samples, ...vars });
}

export const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);
