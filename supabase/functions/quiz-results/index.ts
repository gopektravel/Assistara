// ----------------------------------------------------------------------------
// Assistara Remote Income Potential Quiz: the personalised results email.
//
// This is the one email a quiz visitor explicitly asked for. It is
// TRANSACTIONAL: it delivers the thing they requested, so it does not depend on
// marketing consent. Marketing consent is still recorded on the result row and
// still gates every promotional send, which is a separate decision made later.
//
// It is deliberately thin. Rendering goes through the canonical branded shell
// and the Email Command Center's published template, and sending goes through
// the shared delivery gateway so quotas, idempotency, suppression, provider
// failover and delivery logging behave exactly as they do for every other
// Assistara email.
//
// The result itself never depends on this function: the browser already has the
// full report before this runs, and the Vercel function calls us fire-and-forget.
// ----------------------------------------------------------------------------

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createEmailDelivery, EmailDeliveryOptions } from "../_shared/email-delivery.ts";
import { brandedEmail, brandedText, brandEsc, para, infoCard } from "../_shared/email-brand.ts";
import { resolveEmailTemplate } from "../_shared/email-templates.ts";

const SITE = "https://www.getassistara.com";
const TEMPLATE_KEY = "quiz_result_report";
// One send per result, ever. A retry reuses the same key, so the gateway's
// idempotency makes a double call a no-op rather than a second email.
const IDEMPOTENCY_PREFIX = "quiz-results-v1";

const cors: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const clean = (v: unknown, max: number) =>
  String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// The first name is a courtesy, never a gate. An unnamed result gets the same
// report as a named one.
const firstName = (v: unknown) => clean(v, 80).split(/\s+/)[0] || "there";

type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord {
  return v && typeof v === "object" ? (v as AnyRecord) : {};
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v ? v : fallback;
}

// A "₱1,200" style figure, always shown with the currency so a number in
// isolation can never be mistaken for a promise.
function peso(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return "\u20b1" + Math.round(n).toLocaleString("en-PH");
}

function hoursPerWeek(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "";
}

/** Non-empty strings from a report list. */
function sentences(list: unknown): string[] {
  return Array.isArray(list) ? list.map((x) => str(x)).filter(Boolean) : [];
}

/** Ends a phrase with a full stop so joined copy reads as real prose. */
function sentence(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** "Week 1: Foundations. Focus. Task. Task." from one roadmap week. */
function weekLine(w: AnyRecord, index: number): string {
  const label = str(w.week) || `Week ${index + 1}`;
  const title = str(w.title);
  const parts = [sentence(title ? `${label}: ${title}` : label)];
  const focus = str(w.focus);
  if (focus) parts.push(sentence(focus));
  const tasks = sentences(w.tasks).map(sentence);
  if (tasks.length) parts.push(tasks.join(" "));
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Template variables
// ---------------------------------------------------------------------------
// Everything here comes from the report the server already stored. Nothing is
// recalculated here, so the email and the on-page result cannot drift apart.
export function buildVars(report: AnyRecord, token: string, name: unknown): Record<string, string> {
  const primary = asRecord(report.primary);
  const secondary = asRecord(report.secondary);
  const readiness = asRecord(report.readiness);
  const income = asRecord(report.income);
  const nextStep = asRecord(report.nextStep);
  const cta = asRecord(nextStep.cta);
  const strengths = asRecord(report.strengths);
  const roadmap = asRecord(report.roadmap);
  const weeks = (Array.isArray(roadmap.weeks) ? roadmap.weeks : []).map(asRecord);

  const resultUrl = token ? `${SITE}/academy/quiz?t=${encodeURIComponent(token)}` : `${SITE}/academy/quiz`;
  // Same private report, with the preferences panel opened. This is the
  // unsubscribe route for this email: one token-verified click, and the
  // promotional opt-in is withdrawn without touching the report itself.
  const prefsUrl = token ? `${resultUrl}&prefs=1` : resultUrl;
  const required = peso(income.requiredRate);
  const goal = peso(income.goal);

  return {
    first_name: firstName(name),
    primary_career: str(primary.title, "your matched career"),
    primary_tagline: str(primary.tagline),
    secondary_career: str(secondary.title),
    readiness: str(readiness.title),
    weekly_hours: hoursPerWeek(income.weeklyHours),
    goal_income: goal,
    required_rate: required,
    // The promised report sections, carried verbatim from the stored report.
    // The website never renders the report, so this email is the report: one
    // primary match, why it fits, the visitor's strengths, what to develop
    // next, and the practical 30-day plan.
    why_fit: sentences(primary.why).join(" "),
    strengths: sentences(strengths.paragraphs).join(" "),
    skills_to_develop: sentences(readiness.missing).join("; "),
    plan_intro: str(roadmap.promise),
    plan_w1: weeks[0] ? weekLine(weeks[0], 0) : "",
    plan_w2: weeks[1] ? weekLine(weeks[1], 1) : "",
    plan_w3: weeks[2] ? weekLine(weeks[2], 2) : "",
    plan_w4: weeks[3] ? weekLine(weeks[3], 3) : "",
    next_step_heading: str(nextStep.heading, "Your next step"),
    next_step_body: str(nextStep.body),
    next_step_cta: str(cta.label, "See your full result"),
    next_step_url: str(cta.href, `${SITE}/academy`),
    result_url: resultUrl,
    prefs_url: prefsUrl,
    site_url: SITE,
  };
}

// The inline builder used only when no template has been published to the
// Email Command Center yet. Behaviour is identical either way; the published
// copy simply wins when an admin has edited it. This builder IS the report:
// the website never renders it, so every promised section lives here.
function fallbackTemplate(v: Record<string, string>) {
  const name = brandEsc(v.first_name);
  const resultUrl = brandEsc(v.result_url);
  const prefsUrl = brandEsc(v.prefs_url || v.result_url);
  const section = (title: string, value?: string) =>
    value ? para(`<strong>${brandEsc(title)}</strong>`) + para(brandEsc(value)) : "";
  const week = (n: number) => (v[`plan_w${n}`] ? para(brandEsc(v[`plan_w${n}`])) : "");

  const body =
    para(`Hi ${name},`) +
    para(
      `Thanks for taking the Remote Income Potential Quiz. Here is your personalised remote ` +
        `career report, built from the ten answers you gave. Everything you asked for is in this email.`,
    ) +
    infoCard([
      { label: "Primary match", value: v.primary_career || "Your matched career" },
      { label: "Where you are starting from", value: v.readiness || "-" },
      ...(v.weekly_hours ? [{ label: "Hours you have each week", value: `${v.weekly_hours} hrs` }] : []),
      ...(v.goal_income ? [{ label: "Monthly income you are aiming for", value: v.goal_income }] : []),
    ]) +
    (v.primary_tagline ? para(brandEsc(v.primary_tagline)) : "") +
    (v.required_rate
      ? para(
          `For the goal you set, that works out at about ${brandEsc(v.required_rate)} per paid hour ` +
            `at the hours you told us you have. That is arithmetic you can check, not a forecast.`,
        )
      : "") +
    section("Why it fits", v.why_fit) +
    section("Your strengths", v.strengths) +
    section("Skills to develop", v.skills_to_develop ? `${v.skills_to_develop}.` : "") +
    para(`<strong>Your 30-day plan</strong>`) +
    (v.plan_intro ? para(brandEsc(v.plan_intro)) : "") +
    week(1) + week(2) + week(3) + week(4) +
    para(`<strong>${brandEsc(v.next_step_heading)}</strong>`) +
    para(brandEsc(v.next_step_body));

  const html = brandedEmail({
    heading: "Your personalised remote career report",
    bodyHtml: body,
    cta: { label: v.next_step_cta || "Explore the Academy", href: v.next_step_url || v.result_url },
    afterHtml:
      `<p style="margin:0 0 16px">Your result link reopens your confirmation page and email ` +
      `preferences. This email is your report: there is no account to create and nothing ` +
      `hidden behind a login.</p>` +
      `<p style="margin:0;color:#77716a;font-size:12px;line-height:1.6">Income figures in your report are ` +
      `illustrative calculations based on your answers and example hourly rates. They are not earnings ` +
      `predictions or guarantees, and completing Assistara Academy does not guarantee employment.</p>`,
    footerHtml:
      `This email was requested by you when you asked for your quiz result, so it is not a promotional email.<br>` +
      `Assistara Academy &middot; <a href="${resultUrl}" style="color:#4f4b45">Open your result</a>` +
      ` &middot; <a href="${prefsUrl}" style="color:#4f4b45">Manage email preferences</a><br>` +
      `Assistara &middot; www.getassistara.com`,
  });

  const text = brandedText({
    heading: "Your personalised remote career report",
    lines: [
      `Hi ${v.first_name},`,
      `Thanks for taking the Remote Income Potential Quiz. Here is your personalised remote career report, built from the ten answers you gave.`,
      `Primary match: ${v.primary_career}`,
      v.primary_tagline || "",
      `Starting from: ${v.readiness}`,
      v.weekly_hours ? `Hours each week: ${v.weekly_hours}` : "",
      v.goal_income ? `Monthly income you are aiming for: ${v.goal_income}` : "",
      v.required_rate ? `That works out at about ${v.required_rate} per paid hour at the hours you have.` : "",
      v.why_fit ? `Why it fits: ${v.why_fit}` : "",
      v.strengths ? `Your strengths: ${v.strengths}` : "",
      v.skills_to_develop ? `Skills to develop: ${v.skills_to_develop}.` : "",
      `Your 30-day plan`,
      v.plan_intro || "",
      v.plan_w1 || "",
      v.plan_w2 || "",
      v.plan_w3 || "",
      v.plan_w4 || "",
      v.next_step_heading,
      v.next_step_body,
      `Income figures are illustrative calculations based on your answers and example hourly rates. They are not earnings predictions or guarantees.`,
    ].filter(Boolean),
    cta: { label: v.next_step_cta || "Explore the Academy", href: v.next_step_url || v.result_url },
    footerLines: [
      "This email was requested by you when you asked for your quiz result, so it is not a promotional email.",
      `Manage your email preferences: ${v.prefs_url}`,
      `The Assistara Team \u{1F49B}`,
    ],
  });

  return { subject: `Your quiz result: ${v.primary_career} is your match`, previewText: "Your personalised remote career report is ready.", html, text, senderName: "Assistara Academy" };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

  // Called only by the quiz API, which presents the project's service
  // credential.
  //
  // That credential is configured in two independent places - the Vercel
  // function's environment and this function's environment - and the two copies
  // can drift apart. A project migrated to the new API keys can hold the
  // sb_secret_ key on one side and the legacy service_role JWT on the other, so
  // comparing the two strings (as this function used to) refuses a caller that
  // is genuinely privileged. That is exactly how the report email went missing
  // while every other part of the flow kept working.
  //
  // So do not compare secrets here. Take the credential the caller presents and
  // let the database be the authority: quiz_results is granted to service_role
  // alone, so a credential without that role reads nothing and is refused
  // below. The function stays closed to the public without keeping a second
  // copy of any secret, and neither side has to be rotated to repair the link.
  const auth = String(req.headers.get("authorization") || "");
  const presented =
    auth.replace(/^Bearer\s+/i, "").trim() ||
    String(req.headers.get("apikey") || "").trim();
  if (!presented) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  let body: AnyRecord;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const resultId = clean(body.result_id, 64);
  const token = clean(body.result_token, 128);
  if (!resultId) return json(400, { ok: false, error: "result_id is required" });

  // Every privileged read and write below runs with the caller's own
  // credential, so a caller without service_role gains nothing by getting this
  // far.
  const headers = {
    "Content-Type": "application/json",
    apikey: presented,
    Authorization: `Bearer ${presented}`,
  };

  let row: AnyRecord | null = null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/quiz_results?id=eq.${encodeURIComponent(resultId)}` +
        `&select=id,email,first_name,report,primary_career,email_state,marketing_consent&limit=1`,
      { headers, cache: "no-store" },
    );
    // PostgREST refuses a credential that is not service_role, so the authority
    // check happens here. Nothing is read and nothing is leaked.
    if (res.status === 401 || res.status === 403) {
      return json(401, { ok: false, error: "Unauthorized" });
    }
    const rows = await res.json().catch(() => []);
    row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (error) {
    console.error("quiz-results load", String(error));
    return json(503, { ok: false, error: "Quiz storage unavailable" });
  }

  if (!row) return json(404, { ok: false, error: "Result not found" });

  const email = clean(row.email, 254).toLowerCase();
  // No address means nothing to send. This is a normal, successful outcome:
  // the visitor chose to see their result without leaving an email.
  if (!email || !/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(email)) {
    await markState(SUPABASE_URL, headers, resultId, "not_requested");
    return json(200, { ok: true, skipped: "no_email" });
  }

  const report = asRecord(row.report);
  const vars = buildVars(report, token, row.first_name);

  // The visitor's confirmation must reflect a real queue handoff, so this
  // function answers within a bounded window instead of holding the quiz API
  // open for the whole provider round trip:
  //   * finished inside the window  -> the true outcome (sent/failed and the
  //     provider that handled it);
  //   * slower than the window      -> accepted: the send continues in this
  //     function and email_state records the outcome when it lands.
  // Either way the quiz only confirms what actually happened; a failure that
  // is known synchronously still comes back as an error.
  const QUEUE_WINDOW_MS = 6000;

  const deliver = async (): Promise<
    { ok: boolean; status: string; provider: string | null; attempts: number; error?: string }
  > => {
    let resolved;
    try {
      resolved = await resolveEmailTemplate(TEMPLATE_KEY, vars, () => fallbackTemplate(vars) as never);
    } catch (error) {
      // Never let a template problem block the send of a requested result.
      console.error("quiz-results template", String(error));
      resolved = { ...fallbackTemplate(vars), source: "fallback" as const };
    }

    const options: EmailDeliveryOptions = {
      // Stable per result, so a retried call can never produce a second copy.
      idempotencyKey: `${IDEMPOTENCY_PREFIX}:${resultId}`,
      emailType: "quiz_result_report",
      campaignKey: "quiz-results-2026",
      recipientId: resultId,
      to: email,
      toName: str(row.first_name),
      subject: resolved.subject,
      html: resolved.html,
      text: resolved.text,
      fromName: "Assistara Academy",
      metadata: {
        template_key: TEMPLATE_KEY,
        primary_career: str(row.primary_career),
        marketing_consent: row.marketing_consent === true,
        result_id: resultId,
      },
    };

    try {
      const delivery = await createEmailDelivery("quiz-results");
      const result = await delivery.send(options);

      // A suppressed or bounced address is a completed attempt, not a failure to
      // retry forever. The gateway has already logged the detail.
      const state =
        result.status === "sent" ? "sent"
        : result.status === "suppressed" ? "suppressed"
        : "failed";

      await markState(SUPABASE_URL, headers, resultId, state, {
        error: result.error,
        attempts: result.attempts,
      }).catch(() => {});

      const rawDetail =
        typeof result.error === "string" ? result.error
        : result.error instanceof Error ? result.error.message
        : "";
      return {
        ok: result.success || state === "suppressed",
        status: result.status,
        provider: result.provider ?? null,
        attempts: result.attempts,
        ...(rawDetail ? { error: rawDetail } : {}),
      };
    } catch (error) {
      console.error("quiz-results send", String(error));
      await markState(SUPABASE_URL, headers, resultId, "failed", {
        error: error instanceof Error ? error.message : String(error),
        attempts: 1,
      }).catch(() => {});
      return {
        ok: false,
        status: "failed",
        provider: null,
        attempts: 1,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const raced = await Promise.race([
    deliver().then((v) => ({ kind: "done" as const, v })),
    new Promise<{ kind: "slow" }>((resolve) =>
      setTimeout(() => resolve({ kind: "slow" }), QUEUE_WINDOW_MS),
    ),
  ]);

  if (raced.kind === "slow") {
    return json(200, { ok: true, emailQueued: true, status: "accepted", provider: null, attempts: 0 });
  }

  const outcome = raced.v;
  const failed = !outcome.ok && outcome.status !== "suppressed";
  // On failure, pass the gateway's reason back so the quiz API can log it.
  // The gateway reports statuses, table names and HTTP codes; any address
  // that might appear in a provider response is masked before it is sent.
  const detail = failed
    ? clean(outcome.error || outcome.status, 240).replace(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/g, "[email]")
    : "";
  return json(failed ? 502 : 200, {
    ok: !failed,
    status: outcome.status,
    provider: outcome.provider,
    attempts: outcome.attempts,
    ...(failed && detail ? { detail } : {}),
  });
});

// Best-effort state stamp so the admin lead view can show delivery status.
async function markState(
  url: string,
  headers: Record<string, string>,
  id: string,
  state: string,
  detail?: { error?: string; attempts?: number },
): Promise<void> {
  const patch: Record<string, unknown> = { email_state: state };
  if (state === "sent") patch.email_sent_at = new Date().toISOString();
  // The failure reason and attempt count are kept so a retry from the admin
  // can be distinguished from a genuine first attempt.
  if (detail?.error) patch.email_error = String(detail.error).slice(0, 500);
  if (detail?.attempts != null) patch.email_attempts = Number(detail.attempts) || 0;
  await fetch(`${url}/rest/v1/quiz_results?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
    cache: "no-store",
  });
}
