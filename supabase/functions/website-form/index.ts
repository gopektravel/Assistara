import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Assistara <forms@getassistara.com>";
const NOTIFICATION_EMAIL = Deno.env.get("NOTIFICATION_EMAIL") || "notifications@getassistara.com";
const ACADEMY_REPLY_TO = Deno.env.get("ACADEMY_REPLY_TO") || "academy@getassistara.com";
const B2B_REPLY_TO = Deno.env.get("B2B_REPLY_TO") || "support@getassistara.com";

const allowedOrigins = new Set([
  "https://getassistara.com",
  "https://www.getassistara.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

type FormType = "b2b" | "masterclass" | "academy_application";

type StoredSubmission = {
  id: string;
  type: FormType;
  name: string;
  email: string;
  details: Array<[string, string]>;
};

function originAllowed(origin: string | null) {
  return !!origin && (allowedOrigins.has(origin) || origin.endsWith(".vercel.app"));
}

function corsHeaders(origin: string | null) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": originAllowed(origin) ? origin! : "https://www.getassistara.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function clean(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function insertSubmission(table: string, row: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify(row),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(result) || !result[0]?.id) {
    console.error(`PostgREST ${table} insert failed`, response.status, result);
    throw new Error("Database write failed");
  }
  return String(result[0].id);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function firstName(name: string) {
  return escapeHtml(name.trim().split(/\s+/)[0] || "there");
}

function emailFrame(preview: string, heading: string, content: string, button?: { label: string; href: string }) {
  const action = button
    ? `<tr><td style="padding:8px 32px 32px"><a href="${button.href}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:999px">${button.label}</a></td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(preview)}</title></head>
<body style="margin:0;background:#f4f3ef;color:#151515;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f3ef;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e2dfd7">
        <tr><td style="background:#171717;color:#ffffff;padding:24px 32px;font-size:20px;font-weight:800"><span style="display:inline-block;background:#ffd51f;color:#151515;border-radius:10px;padding:6px 9px;margin-right:10px">A</span>Assistara</td></tr>
        <tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px;line-height:1.12;letter-spacing:-0.6px">${escapeHtml(heading)}</h1></td></tr>
        <tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45">${content}</td></tr>
        ${action}
        <tr><td style="border-top:1px solid #ece9e2;padding:20px 32px;color:#77716a;font-size:12px;line-height:1.5">Assistara<br><a href="https://www.getassistara.com" style="color:#55504a">www.getassistara.com</a></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function confirmationEmail(submission: StoredSubmission) {
  const hello = `<p style="margin:0 0 16px">Hi ${firstName(submission.name)},</p>`;

  if (submission.type === "masterclass") {
    return {
      subject: "You are on the list | Assistara Masterclass",
      replyTo: ACADEMY_REPLY_TO,
      html: emailFrame(
        "Your free masterclass registration is confirmed.",
        "You are on the list.",
        `${hello}<p style="margin:0 0 16px">Your place is saved for our free masterclass:</p><p style="margin:0 0 18px;font-size:20px;line-height:1.35;color:#151515"><strong>How to Land a Remote Job as a Complete Beginner</strong></p><p style="margin:0">We will email you the date, access details and next steps as soon as they are confirmed. Keep an eye on this inbox.</p>`,
        { label: "Visit Assistara Academy", href: "https://www.getassistara.com/academy" },
      ),
    };
  }

  if (submission.type === "academy_application") {
    return {
      subject: "Application received | Assistara Academy",
      replyTo: ACADEMY_REPLY_TO,
      html: emailFrame(
        "Your Assistara Academy application has been received.",
        "Your application is with us.",
        `${hello}<p style="margin:0 0 16px">Thank you for applying to Assistara Academy. We received your answers successfully.</p><p style="margin:0 0 16px"><strong>What happens next?</strong></p><p style="margin:0">Our team will review your application and contact you at this email address with the next step. You do not need to submit another application.</p>`,
        { label: "Visit Assistara Academy", href: "https://www.getassistara.com/academy" },
      ),
    };
  }

  return {
    subject: "We received your request | Assistara",
    replyTo: B2B_REPLY_TO,
    html: emailFrame(
      "The Assistara team received your request.",
      "Your request has been received.",
      `${hello}<p style="margin:0 0 16px">Thank you for telling us where your business needs support. Your request is safely with the Assistara team.</p><p style="margin:0 0 16px"><strong>What happens next?</strong></p><p style="margin:0">We will review your needs, identify the right type of support and contact you at this email address.</p>`,
      { label: "Visit Assistara", href: "https://www.getassistara.com" },
    ),
  };
}

function internalEmail(submission: StoredSubmission) {
  const labels: Record<FormType, { subject: string; heading: string }> = {
    b2b: { subject: `New B2B request: ${submission.name}`, heading: "New B2B client request" },
    masterclass: { subject: `New masterclass signup: ${submission.name || submission.email}`, heading: "New masterclass signup" },
    academy_application: { subject: `New Academy application: ${submission.name}`, heading: "New Academy application" },
  };
  const label = labels[submission.type];
  const rows = [
    ["Name", submission.name || "Not provided"],
    ["Email", submission.email],
    ...submission.details,
  ].map(([key, value]) => `<tr><td style="padding:10px 0;color:#77716a;vertical-align:top;width:34%">${escapeHtml(key)}</td><td style="padding:10px 0;color:#151515;vertical-align:top;white-space:pre-wrap">${escapeHtml(value || "Not provided")}</td></tr>`).join("");

  return {
    subject: label.subject,
    html: emailFrame(
      label.subject,
      label.heading,
      `<p style="margin:0 0 18px">A new website submission was saved in Supabase.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #ece9e2;border-bottom:1px solid #ece9e2">${rows}</table><p style="margin:18px 0 0;color:#77716a;font-size:13px">Submission ID: ${escapeHtml(submission.id)}</p>`,
      { label: "Reply to this person", href: `mailto:${encodeURIComponent(submission.email)}` },
    ),
  };
}

async function sendEmail(to: string, subject: string, html: string, replyTo: string, idempotencyKey: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      reply_to: replyTo,
      subject,
      html,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Resend ${response.status}: ${JSON.stringify(result)}`);
  return result;
}

async function sendSubmissionEmails(submission: StoredSubmission) {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not configured. Submission was saved without email delivery.");
    return false;
  }

  const confirmation = confirmationEmail(submission);
  const internal = internalEmail(submission);
  const results = await Promise.allSettled([
    sendEmail(submission.email, confirmation.subject, confirmation.html, confirmation.replyTo, `submission-${submission.id}-confirmation`),
    sendEmail(NOTIFICATION_EMAIL, internal.subject, internal.html, submission.email, `submission-${submission.id}-internal`),
  ]);

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    console.error("One or more submission emails failed", failures);
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers });
  if (origin && !originAllowed(origin)) return new Response(JSON.stringify({ ok: false, error: "Origin not allowed" }), { status: 403, headers });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers });
  }

  const type = clean(body.type, 50) as FormType;
  const name = clean(body.name, 200);
  const email = clean(body.email, 254).toLowerCase();
  if (!validEmail(email)) return new Response(JSON.stringify({ ok: false, error: "Valid email required" }), { status: 400, headers });

  try {
    let submission: StoredSubmission;

    if (type === "b2b") {
      if (!name) return new Response(JSON.stringify({ ok: false, error: "Name required" }), { status: 400, headers });
      const company = clean(body.company, 300);
      const timeThieves = clean(body.time_thieves, 5000);
      const supportLevel = clean(body.support_level, 300);
      const id = await insertSubmission("b2b_leads", {
        name,
        email,
        company: company || null,
        time_thieves: timeThieves || null,
        support_level: supportLevel || null,
        source: "website_b2b_form",
      });
      submission = {
        id,
        type,
        name,
        email,
        details: [["Company", company], ["Time-consuming work", timeThieves], ["Support needed", supportLevel]],
      };
    } else if (type === "masterclass") {
      const phone = clean(body.phone, 100);
      const id = await insertSubmission("masterclass_signups", {
        name: name || null,
        email,
        phone: phone || null,
        source: "website_masterclass_form",
        status: "registered",
      });
      submission = { id, type, name, email, details: [["Phone", phone]] };
    } else if (type === "academy_application") {
      if (!name) return new Response(JSON.stringify({ ok: false, error: "Name required" }), { status: 400, headers });
      const currentSituation = clean(body.current_situation, 1000);
      const whyRemoteWork = clean(body.why_remote_work, 5000);
      const whatTried = clean(body.what_tried, 5000);
      const biggestObstacle = clean(body.biggest_obstacle, 5000);
      const remoteWorkInterest = clean(body.remote_work_interest, 1000);
      const weeklyCommitment = clean(body.weekly_commitment, 500);
      const paymentReadiness = clean(body.payment_readiness, 500);
      const id = await insertSubmission("academy_applications", {
        name,
        email,
        current_situation: currentSituation || null,
        why_remote_work: whyRemoteWork || null,
        what_tried: whatTried || null,
        biggest_obstacle: biggestObstacle || null,
        remote_work_interest: remoteWorkInterest || null,
        weekly_commitment: weeklyCommitment || null,
        payment_readiness: paymentReadiness || null,
        source: "website_academy_application",
      });
      submission = {
        id,
        type,
        name,
        email,
        details: [
          ["Current situation", currentSituation],
          ["Why remote work", whyRemoteWork],
          ["What they tried", whatTried],
          ["Biggest obstacle", biggestObstacle],
          ["Remote work interest", remoteWorkInterest],
          ["Weekly commitment", weeklyCommitment],
          ["Payment readiness", paymentReadiness],
        ],
      };
    } else {
      return new Response(JSON.stringify({ ok: false, error: "Unknown form type" }), { status: 400, headers });
    }

    const emailSent = await sendSubmissionEmails(submission);
    return new Response(JSON.stringify({ ok: true, emailSent }), { status: 200, headers });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: "Could not save submission" }), { status: 500, headers });
  }
});
