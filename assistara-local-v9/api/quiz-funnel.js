"use strict";

// ----------------------------------------------------------------------------
// Assistara Remote Income Potential Quiz — server API.
//
// This is the ONLY place the quiz is scored and stored. The browser never
// computes a match: it posts raw answers, this module validates them, runs the
// canonical engine, persists the report and returns it. That is what makes a
// stored result reproducible and its scoring/report versions meaningful.
//
// Actions (single endpoint, method + `action`):
//   GET  ?action=meta                  questions + career content (no PII)
//   GET  ?action=result&token=...      a stored report by its secure token
//   POST { action: "progress" }        resume-after-refresh (anonymous)
//   POST { action: "event" }           funnel analytics, idempotent
//   POST { action: "submit" }          score + persist + return the report
//   POST { action: "consent" }         withdraw promotional consent (unsubscribe)
//
// Product rules enforced here:
//   * No email or account is required to get a result. `email` is optional and
//     the report is returned in this response whether it was given or not.
//   * Report delivery and promotional consent are two separate decisions:
//     giving an address asks for the report (transactional), and the
//     marketing opt-in is stored separately, unchecked by default, and can be
//     withdrawn later from the result page or by declining again.
//   * The result is ALWAYS returned in the submit response. Email is fired
//     afterwards and best-effort: a provider outage can never eat a result.
//   * Report tokens are 32 random bytes; only their SHA-256 hash is stored, so
//     a leaked row cannot be replayed into a report.
//   * Nothing here needs or exposes a service-role key to the client.
//
// Attribution is carried through verbatim (visit id, visitor id, tracking
// token, UTMs, referrer) and is resolved later by the shared Assistara
// attribution resolver, so a quiz lead attributes exactly like an Academy
// application does.
// ----------------------------------------------------------------------------

const crypto = require("node:crypto");
const { config, noStore, allowedOrigin } = require("./_academy-security");
const engine = require("./_quiz-engine");
const report = require("./_quiz-report");

const SITE = "https://www.getassistara.com";
const RESULT_TOKEN_TTL_DAYS = 7;

// Where a promotional consent decision was recorded. Stored for every visitor
// who leaves an address, whether they said yes or no, so the admin surface can
// show an accurate "given / declined / withdrawn" state with a date.
const CONSENT_SOURCE = "quiz_results_form_v2";

// How long a half-finished quiz is still resumable after a refresh. Exposed on
// the meta route so the browser never hardcodes the window, and so a session
// parked overnight is not silently picked back up days later.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Per-identity ceilings. Generous for a real visitor, useless for a scraper.
const LIMITS = {
  submit: { count: 5, windowMs: 60 * 60 * 1000 },
  progress: { count: 60, windowMs: 60 * 60 * 1000 },
  event: { count: 120, windowMs: 60 * 60 * 1000 },
  // A result may only be re-read a handful of times per hour per identity.
  result: { count: 30, windowMs: 60 * 60 * 1000 },
  // Consent withdrawals need the private result token anyway; this only stops
  // someone hammering the endpoint.
  consent: { count: 20, windowMs: 60 * 60 * 1000 },
};

// Below this, a submission is humanly implausible. It is still accepted and
// stored, but flagged, so a bot flood is visible instead of silently trusted.
const PLAUSIBLE_MIN_MS = 8000;

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(body));
}

function fail(res, status, error, extra) {
  return send(res, status, Object.assign({ ok: false, error }, extra || {}));
}

function readBody(req) {
  // Vercel's Node runtime parses a JSON body into `req.body` BEFORE the handler
  // runs, so the raw stream is already consumed and would never emit `data` or
  // `end` again. Reading the stream first would hang every POST until the
  // platform times the invocation out, so the pre-parsed body wins and the
  // stream is only a fallback for runtimes (and tests) that leave it raw.
  if (req.body !== null && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === "string") {
    const trimmed = req.body.trim();
    if (!trimmed) return Promise.resolve({});
    try {
      return Promise.resolve(JSON.parse(trimmed));
    } catch {
      return Promise.resolve(null);
    }
  }

  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      // Hard ceiling: a quiz payload is a few hundred bytes.
      if (size > 64 * 1024) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || String(req.headers["x-real-ip"] || "").trim() || "";
}

// The raw address is never stored: rate limiting keys off an HMAC so a DB read
// cannot recover visitor addresses.
function rateKeyFor(req, cfg) {
  const ip = clientIp(req);
  if (!ip) return "";
  return crypto.createHmac("sha256", cfg.cookieSecret).update(`quiz:${ip}`).digest("hex");
}

// ---------------------------------------------------------------------------
// Supabase (PostgREST) helpers
// ---------------------------------------------------------------------------

async function rest(cfg, method, path, body, extraHeaders) {
  const headers = Object.assign(
    {
      "Content-Type": "application/json",
      apikey: cfg.service,
      Authorization: `Bearer ${cfg.service}`,
      Prefer: "return=representation",
    },
    extraHeaders || {},
  );
  const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  });
  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { status: response.status, ok: response.ok, data };
}

// A missing table means the migration has not been applied yet. That is a
// deployment-order problem, not a reason to 500 a visitor's result.
function isMissingRelation(error) {
  const code = error && (error.code || error.hint || "");
  const message = (error && error.message) || "";
  return (
    /PGRST205|42P01/.test(String(code)) ||
    /relation .* does not exist|Could not find the table/i.test(String(message))
  );
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

function mintToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

// The stored report is read back on the same Academy-branded quiz page, so a
// shared or bookmarked link never lands on a bare, unbranded route.
function resultUrl(token) {
  return `${SITE}/academy/quiz?t=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

// Whatever the browser already resolved is carried through unchanged; nothing
// is invented server-side. Unknown keys are dropped, so a crafted payload
// cannot smuggle columns.
function normaliseAttribution(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const str = (v, max) => {
    const s = String(v == null ? "" : v).trim();
    return s ? s.slice(0, max) : null;
  };
  const out = {
    acquisition_visit_id: null,
    acquisition_visitor_id: str(src.visitorId || src.acquisition_visitor_id, 128),
    tracking_token: str(src.token || src.tracking_token, 64),
    utm_source: str(src.utm_source, 128),
    utm_medium: str(src.utm_medium, 128),
    utm_campaign: str(src.utm_campaign, 256),
    utm_content: str(src.utm_content, 256),
    utm_term: str(src.utm_term, 128),
    landing_path: str(src.landing_path, 512),
    referrer: str(src.referrer, 1024),
  };
  // A visit id must look like a UUID before it can be stored as a FK target.
  const visit = str(src.visitId || src.acquisition_visit_id, 64);
  if (visit && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visit)) {
    out.acquisition_visit_id = visit;
  }
  return out;
}

// The three attribution columns the migration declares on quiz_results, and
// the same three plus the first-touch UTMs on quiz_events. Only quiz_sessions
// carries the full normalised set (content/term, landing path and referrer
// included); acquisition_visits keeps those for the whole funnel, and a
// result stays attributable on its own through the visit/visitor/token trio.
// Spreading the full attribution into the narrower tables makes PostgREST
// reject the whole write with "Could not find the 'landing_path' column",
// which silently cost every stored result and every funnel event.
function resultAttribution(attr) {
  return {
    acquisition_visit_id: attr.acquisition_visit_id,
    acquisition_visitor_id: attr.acquisition_visitor_id,
    tracking_token: attr.tracking_token,
  };
}

function eventAttribution(attr) {
  return {
    acquisition_visit_id: attr.acquisition_visit_id,
    acquisition_visitor_id: attr.acquisition_visitor_id,
    tracking_token: attr.tracking_token,
    utm_source: attr.utm_source,
    utm_medium: attr.utm_medium,
    utm_campaign: attr.utm_campaign,
  };
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function overLimit(cfg, rateKey, action) {
  if (!rateKey) return false;
  const limit = LIMITS[action];
  if (!limit) return false;
  try {
    const since = new Date(Date.now() - limit.windowMs).toISOString();
    // Only a bounded prefix is read: we only need to know whether the ceiling
    // was reached, never how far past it a client went.
    const rows = await rest(
      cfg,
      "GET",
      `quiz_sessions?rate_key=eq.${encodeURIComponent(rateKey)}` +
        `&started_at=gte.${since}&select=id&limit=${limit.count}`,
    );
    if (!rows.ok) return false;
    return Array.isArray(rows.data) && rows.data.length >= limit.count;
  } catch {
    // Failing open on a rate-limit read is deliberate: throttling is a abuse
    // control, not correctness, and a blip must not block a real visitor.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function newClientKey() {
  return `qz_${crypto.randomBytes(16).toString("hex")}`;
}

function validClientKey(v) {
  return typeof v === "string" && /^qz_[0-9a-f]{32}$/.test(v);
}

async function upsertSession(cfg, fields) {
  const row = Object.assign({ status: "in_progress" }, fields);
  const r = await rest(cfg, "POST", "quiz_sessions", row, {
    Prefer: "resolution=merge-duplicates,return=representation",
  });
  return r.ok && Array.isArray(r.data) ? r.data[0] || null : null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function actionMeta(res) {
  noStore(res);
  // Content only: no PII, no rates that are not already public, and the income
  // model is returned so the slider maths on the page matches the server.
  return send(res, 200, {
    ok: true,
    scoringVersion: engine.SCORING_VERSION,
    reportVersion: engine.REPORT_VERSION,
    questions: engine.QUESTIONS,
    sessionTtlMs: SESSION_TTL_MS,
    careers: engine.CAREER_ORDER.map((id) => ({
      id,
      title: engine.CAREERS[id].title,
      category: engine.CAREERS[id].category,
      tagline: engine.CAREERS[id].tagline,
    })),
    incomeModel: {
      currency: engine.INCOME_MODEL.currency,
      symbol: engine.INCOME_MODEL.symbol,
      exampleRates: engine.INCOME_MODEL.exampleRates,
      labelledAsTypical: engine.INCOME_MODEL.labelledAsTypical,
      weeksPerYear: engine.INCOME_MODEL.weeksPerYear,
      monthsPerYear: engine.INCOME_MODEL.monthsPerYear,
      modellingNotes: engine.INCOME_MODEL.modellingNotes,
      openEndedModelling: engine.INCOME_MODEL.openEndedModelling,
    },
    readinessStages: engine.READINESS_STAGES,
  });
}

async function actionResult(req, res, cfg, query) {
  noStore(res);
  const token = String(query.get("t") || query.get("token") || "");
  // A token is the only key that opens a report. Ids alone must never work.
  if (!token || token.length < 20 || token.length > 128) return fail(res, 404, "Not found");

  const rateKey = rateKeyFor(req, cfg);
  if (await overLimit(cfg, rateKey, "result")) return fail(res, 429, "Too many requests");

  try {
    const r = await rest(
      cfg,
      "GET",
      `quiz_results?result_token_hash=eq.${hashToken(token)}&result_token_expires_at=gt.${new Date().toISOString()}&select=id,report,first_name,primary_career,secondary_career,readiness_stage,readiness_key,created_at,result_view_count,marketing_consent,marketing_consent_at,consent_source,email_state&limit=1`,
    );
    const row = r.ok && Array.isArray(r.data) ? r.data[0] : null;
    if (!row || !row.report) return fail(res, 404, "Not found");

    // Best-effort view counter; never blocks the reader.
    rest(
      cfg,
      "PATCH",
      `quiz_results?id=eq.${encodeURIComponent(row.id)}`,
      { result_view_count: (Number(row.result_view_count) || 0) + 1, last_viewed_at: new Date().toISOString() },
    ).catch(() => {});

    return send(res, 200, {
      ok: true,
      report: row.report,
      firstName: row.first_name || "",
      primaryCareer: row.primary_career,
      secondaryCareer: row.secondary_career,
      readinessStage: row.readiness_stage,
      readinessKey: row.readiness_key,
      createdAt: row.created_at,
      // Email preferences travel with the result so the page can show the
      // state honestly, and so an emailed link can offer the withdrawal.
      marketingConsent: row.marketing_consent === true,
      marketingConsentAt: row.marketing_consent_at || null,
      consentSource: row.consent_source || null,
      emailState: row.email_state || null,
      // The answers that produced this report are never exposed on this route.
      siteUrl: SITE,
    });
  } catch (error) {
    if (isMissingRelation(error)) return fail(res, 503, "Quiz storage is not available yet");
    console.error("quiz-funnel result", error.message);
    return fail(res, 500, "Could not load that result");
  }
}

async function actionProgress(req, res, cfg, body) {
  noStore(res);
  const clientKey = validClientKey(body.clientKey) ? body.clientKey : newClientKey();
  const rateKey = rateKeyFor(req, cfg);
  if (await overLimit(cfg, rateKey, "progress")) return fail(res, 429, "Too many requests");

  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  const currentQuestion = Math.min(10, Math.max(1, Number(body.currentQuestion) || 1));
  const attr = normaliseAttribution(body.attribution);

  try {
    const row = await upsertSession(cfg, Object.assign({}, attr, {
      client_key: clientKey,
      rate_key: rateKey || null,
      current_question: currentQuestion,
      answers,
      status: "in_progress",
      client_elapsed_ms: Number.isFinite(Number(body.elapsedMs)) ? Math.max(0, Math.floor(Number(body.elapsedMs))) : null,
      honeypot: String(body.honeypot || "").slice(0, 200) || null,
    }));
    return send(res, 200, { ok: true, clientKey, sessionId: row ? row.id : null });
  } catch (error) {
    if (isMissingRelation(error)) return fail(res, 503, "Quiz storage is not available yet");
    console.error("quiz-funnel progress", error.message);
    // Progress is a convenience; losing it must never lose the quiz.
    return send(res, 200, { ok: true, clientKey, sessionId: null, saved: false });
  }
}

async function actionEvent(req, res, cfg, body) {
  noStore(res);
  const rateKey = rateKeyFor(req, cfg);
  if (await overLimit(cfg, rateKey, "event")) return fail(res, 429, "Too many requests");

  const EVENTS = [
    "landing_viewed",
    "started",
    "question_completed",
    "results_viewed",
    "lead_submitted",
    "email_failed",
    "email_sent",
    // Withdrawing the promotional opt-in from the saved result page. The
    // preference itself is the consent PATCH; this is only the funnel record
    // that the visitor used the control rather than an unsubscribe link.
    "consent_withdrawn",
    "shared",
    "academy_cta_clicked",
    "abandoned",
  ];
  const event = String(body.event || "");
  if (!EVENTS.includes(event)) return fail(res, 400, "Unknown event");

  const attr = normaliseAttribution(body.attribution);
  // The dedupe key is supplied by the browser so a re-render, a back button or
  // a double click can never inflate a funnel count.
  const eventKey = validClientKey(body.clientKey)
    ? `${event}:${body.clientKey}:${String(body.eventKey || "").slice(0, 64)}`
    : `${event}:${crypto.randomBytes(12).toString("hex")}`;

  try {
    await rest(
      cfg,
      "POST",
      "quiz_events",
      Object.assign({}, eventAttribution(attr), {
        event_key: eventKey,
        event,
        question_number: Number.isFinite(Number(body.questionNumber))
          ? Math.min(10, Math.max(1, Number(body.questionNumber)))
          : null,
      }),
      { Prefer: "resolution=ignore-duplicates,return=minimal" },
    );
    return send(res, 200, { ok: true });
  } catch (error) {
    if (isMissingRelation(error)) return fail(res, 200, "Quiz storage is not available yet");
    console.error("quiz-funnel event", error.message);
    return send(res, 200, { ok: true, saved: false });
  }
}

async function actionSubmit(req, res, cfg, body) {
  noStore(res);

  // A filled honeypot is a bot. Say nothing useful and store nothing.
  if (String(body.honeypot || "").trim()) return fail(res, 400, "Invalid submission");

  const rateKey = rateKeyFor(req, cfg);
  if (await overLimit(cfg, rateKey, "submit")) return fail(res, 429, "Too many requests");

  // --- answers: validated by the same engine that scores them ---------------
  const normalised = engine.normaliseAnswers(body.answers);
  if (!normalised.ok) return fail(res, 400, normalised.error, { field: "answers" });

  // --- lead fields (all optional) -------------------------------------------
  const rawName = String(body.firstName || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const rawEmail = String(body.email || "").trim().toLowerCase().slice(0, 254);
  const decidedAt = new Date();

  if (rawEmail && !EMAIL_RE.test(rawEmail)) {
    return fail(res, 400, "That email address does not look right.", { field: "email" });
  }

  // Two separate decisions, deliberately kept apart:
  //
  //  1. REPORT DELIVERY (transactional). Leaving an address on the reveal step
  //     means "send me my report". The results email is the thing the visitor
  //     asked for, so it never depends on promotional consent.
  //  2. PROMOTIONAL CONSENT (opt-in). Unchecked by default, needs an address,
  //     and recorded with the time it was decided so a later decline reads as
  //     a withdrawal rather than as an absence of data.
  //
  // Neither is required: declining both still returns the full report.
  const reportDelivery = !!rawEmail && body.reportDelivery !== false;
  let marketingConsent = body.marketingConsent === true || body.marketingConsent === "true";
  if (marketingConsent && !rawEmail) marketingConsent = false;

  const elapsedMs = Number.isFinite(Number(body.elapsedMs)) ? Math.max(0, Math.floor(Number(body.elapsedMs))) : null;
  const attr = normaliseAttribution(body.attribution);
  const clientKey = validClientKey(body.clientKey) ? body.clientKey : newClientKey();

  // --- idempotency ----------------------------------------------------------
  // A client key plus the exact normalised answers identifies one submission.
  // Replaying it returns the stored report instead of a second lead row.
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(`${clientKey}:${JSON.stringify(normalised.answers)}`, "utf8")
    .digest("hex");

  try {
    const existing = await rest(
      cfg,
      "GET",
      `quiz_results?idempotency_key=eq.${idempotencyKey}&select=id,report,first_name,primary_career,secondary_career,readiness_stage,readiness_key,scoring_version,report_version,marketing_consent,marketing_consent_at,consent_source,email_state&limit=1`,
    );
    const dup = existing.ok && Array.isArray(existing.data) ? existing.data[0] : null;
    if (dup && dup.report) {
      // Safe replay: same payload, same person, no second lead, no second email.
      return send(res, 200, {
        ok: true,
        alreadySubmitted: true,
        resultId: dup.id,
        // No token is re-issued here: the browser already holds the link it
        // minted, and minting another would let a replayed payload rotate a
        // link out from under the emailed copy.
        report: dup.report,
        firstName: dup.first_name || "",
        primaryCareer: dup.primary_career,
        secondaryCareer: dup.secondary_career,
        readinessStage: dup.readiness_stage,
        readinessKey: dup.readiness_key,
        // The stored decision rides along with a replay too, so a second
        // response cannot leave the page showing a preference the visitor
        // never actually made.
        marketingConsent: dup.marketing_consent === true,
        marketingConsentAt: dup.marketing_consent_at || null,
        consentSource: dup.consent_source || null,
        emailState: dup.email_state || null,
      });
    }

    // --- score + build the report (server-side, canonical) ------------------
    const answers = normalised.answers;
    const scoring = engine.scoreAnswers(answers);
    const readiness = engine.readinessFor(answers);
    const income = engine.incomeScenarios(answers);
    const built = report.buildReport({ answers, firstName: rawName, referral: attr.tracking_token || "" });
    const priority = engine.leadPriority(answers);

    const token = mintToken();
    const now = new Date();
    const expires = new Date(now.getTime() + RESULT_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const row = Object.assign({}, resultAttribution(attr), {
      session_id: null,
      idempotency_key: idempotencyKey,
      first_name: rawName || null,
      email: rawEmail || null,
      // The timestamp records the DECISION, so "what did this person choose,
      // and when" is answerable from the row itself. The schema only requires
      // a timestamp when consent is true.
      marketing_consent: marketingConsent,
      marketing_consent_at: rawEmail ? decidedAt.toISOString() : null,
      consent_source: marketingConsent
        ? CONSENT_SOURCE
        : rawEmail
          ? `${CONSENT_SOURCE}_declined`
          : null,
      answers,
      scores: scoring.scores,
      primary_career: scoring.primary,
      secondary_career: scoring.secondary,
      readiness_stage: readiness.stage,
      readiness_key: readiness.key,
      income_goal_php: income.goal,
      weekly_hours: income.weeklyHours,
      obstacle: built.obstacle.key,
      start_timeline: built.nextStep.timeline || null,
      // No application can exist yet at this moment, so the stored score is
      // the quiz-only score. Surfaces that know about a later application add
      // LEAD_PRIORITY.applicationBonus on top, which is asserted equal in
      // tests so the two can never drift apart.
      lead_priority: priority.score,
      lead_priority_band: priority.band,
      lead_priority_reasons: priority.reasons,
      report: built,
      scoring_version: engine.SCORING_VERSION,
      report_version: engine.REPORT_VERSION,
      result_token_hash: hashToken(token),
      result_token_expires_at: expires.toISOString(),
    });

    const inserted = await rest(cfg, "POST", "quiz_results", row);
    if (!inserted.ok) {
      // A concurrent double-submit races on the unique idempotency key; that is
      // exactly what the constraint is for, so read back rather than fail.
      if (inserted.status === 409) {
        const again = await rest(
          cfg,
          "GET",
          `quiz_results?idempotency_key=eq.${idempotencyKey}&select=id,report,marketing_consent,marketing_consent_at,consent_source,email_state&limit=1`,
        );
        const winner = again.ok && Array.isArray(again.data) ? again.data[0] : null;
        if (winner) {
          return send(res, 200, {
            ok: true,
            alreadySubmitted: true,
            resultId: winner.id,
            report: winner.report,
            // Same as the safe-replay path: the stored preference travels with
            // the response so the page never invents one.
            marketingConsent: winner.marketing_consent === true,
            marketingConsentAt: winner.marketing_consent_at || null,
            consentSource: winner.consent_source || null,
            emailState: winner.email_state || null,
          });
        }
      }
      const msg = (inserted.data && inserted.data.message) || "";
      if (isMissingRelation(inserted.data)) return fail(res, 503, "Quiz storage is not available yet");
      console.error("quiz-funnel insert", inserted.status, msg);
      // If storage is down the visitor still gets their result, computed live.
      return send(res, 200, {
        ok: true,
        stored: false,
        resultId: null,
        report: built,
        firstName: rawName,
        primaryCareer: scoring.primary,
        secondaryCareer: scoring.secondary,
        readinessStage: readiness.stage,
        readinessKey: readiness.key,
        emailQueued: false,
        reportDelivery,
        marketingConsent,
      });
    }

    const saved = Array.isArray(inserted.data) ? inserted.data[0] : null;
    const resultId = saved ? saved.id : null;

    // Link the completion back to the acquisition visit, exactly the way a
    // masterclass signup or an application already does. Best-effort: the
    // result is on screen either way, and attribution can still be recovered
    // from the visit id / token carried on the result row itself.
    if (resultId && attr.acquisition_visit_id) {
      rest(
        cfg,
        "PATCH",
        `acquisition_visits?id=eq.${encodeURIComponent(attr.acquisition_visit_id)}`,
        { quiz_result_id: resultId },
      ).catch(() => {});
    }

    // A later decline withdraws an earlier opt-in for the same address, so
    // "unsubscribe" is honoured even when it happens by filling the form in
    // again rather than by clicking a link. Best-effort, and never blocking.
    if (resultId && rawEmail && !marketingConsent) {
      void withdrawPriorConsent(cfg, rawEmail, decidedAt);
    }

    // The report is already in the response, so the email is fire-and-forget.
    // A provider outage is logged, surfaced in admin, and never blocks this.
    // Only a requested report is ever queued here: this send is transactional.
    let emailQueued = false;
    if (reportDelivery) {
      emailQueued = await queueResultEmail(cfg, resultId, token);
    }

    // Keep the session tidy so the browser can resume if it refreshes.
    rest(cfg, "PATCH", `quiz_sessions?client_key=eq.${encodeURIComponent(clientKey)}`, {
      status: "completed",
      completed_at: now.toISOString(),
    }).catch(() => {});

    return send(res, 200, {
      ok: true,
      stored: true,
      resultId,
      token,
      resultUrl: resultUrl(token),
      report: built,
      firstName: rawName,
      primaryCareer: scoring.primary,
      secondaryCareer: scoring.secondary,
      readinessStage: readiness.stage,
      readinessKey: readiness.key,
      emailQueued,
      // The two email decisions travel back separately so the page can report
      // them honestly: a report was requested or it was not, and the
      // promotional opt-in was given or declined. Neither changes the report.
      reportDelivery,
      marketingConsent,
      flaggedFast: elapsedMs !== null && elapsedMs < PLAUSIBLE_MIN_MS,
    });
  } catch (error) {
    if (isMissingRelation(error)) return fail(res, 503, "Quiz storage is not available yet");
    console.error("quiz-funnel submit", error.message);
    return fail(res, 500, "Could not save that result");
  }
}

// ---------------------------------------------------------------------------
// Consent withdrawal
// ---------------------------------------------------------------------------
// Promotional consent is honoured wherever it is withdrawn: through the
// unsubscribe control on the saved result page, or simply by submitting the
// form again with the opt-in left off. Both end at the same place, the stored
// decision, so a withdrawn address can never later be read as an active opt-in.
async function actionConsent(req, res, cfg, body) {
  noStore(res);
  const token = String(body.token || "");
  if (!token || token.length < 20 || token.length > 128) {
    return fail(res, 400, "Invalid request", { field: "token" });
  }
  const rateKey = rateKeyFor(req, cfg);
  if (await overLimit(cfg, rateKey, "consent")) return fail(res, 429, "Too many requests");

  try {
    const at = new Date();
    const r = await rest(
      cfg,
      "PATCH",
      `quiz_results?result_token_hash=eq.${hashToken(token)}`,
      {
        marketing_consent: false,
        marketing_consent_at: at.toISOString(),
        consent_source: `${CONSENT_SOURCE}_withdrawn`,
      },
    );
    const rows = r.ok && Array.isArray(r.data) ? r.data : [];
    if (!rows.length) return fail(res, 404, "Not found");
    return send(res, 200, {
      ok: true,
      marketingConsent: false,
      marketingConsentAt: at.toISOString(),
      // The report itself is untouched: withdrawing an opt-in never removes
      // access to a result.
    });
  } catch (error) {
    if (isMissingRelation(error)) return fail(res, 503, "Quiz storage is not available yet");
    console.error("quiz-funnel consent", error.message);
    return fail(res, 500, "Could not update that preference");
  }
}

async function withdrawPriorConsent(cfg, email, at) {
  try {
    const r = await rest(
      cfg,
      "PATCH",
      `quiz_results?email=eq.${encodeURIComponent(email)}&marketing_consent=eq.true`,
      {
        marketing_consent: false,
        marketing_consent_at: (at instanceof Date ? at : new Date()).toISOString(),
        consent_source: `${CONSENT_SOURCE}_withdrawn`,
      },
    );
    return !!r.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Results email
// ---------------------------------------------------------------------------
// Rendering and sending live behind the shared gateway so the quiz reuses the
// same provider routing, quota, idempotency and delivery logging as every other
// Assistara email. This function only asks for the send; it never talks to a
// mail provider itself.
async function queueResultEmail(cfg, resultId, token) {
  if (!resultId) return false;
  try {
    const r = await fetch(`${cfg.url}/functions/v1/quiz-results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.service,
        Authorization: `Bearer ${cfg.service}`,
      },
      // Only the token's hash is stored, so the raw token has to travel with
      // the request: it exists in memory here and nowhere else. Without it the
      // emailed link could not be built.
      body: JSON.stringify({ result_id: resultId, result_token: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      // The gateway answered but refused or failed. The status and a short
      // body snippet are the only way to tell an auth mismatch from a
      // template or provider failure after the fact; the function's error
      // responses carry nothing sensitive (never the token, the report or
      // the address), so both are safe to log. Returning the boolean is
      // unchanged: the visitor's result never depends on this.
      let detail = "";
      try {
        detail = (await r.text()).slice(0, 200);
      } catch {
        detail = "(no body)";
      }
      console.error("quiz-funnel email queue", r.status, detail);
      return false;
    }
    return true;
  } catch (error) {
    console.error("quiz-funnel email queue", error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

module.exports = async function quizFunnel(req, res) {
  const cfg = (() => {
    try {
      return config();
    } catch {
      return null;
    }
  })();

  const url = new URL(req.url || "/", SITE);
  const query = url.searchParams;
  const action = String(query.get("action") || "").trim();

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return send(res, 204, {});
  }

  if (!cfg) {
    // Never leak configuration detail, and never fail a public read that does
    // not need the database.
    if (req.method === "GET" && action === "meta") return actionMeta(res);
    return fail(res, 503, "Quiz service is not configured");
  }

  try {
    if (req.method === "GET") {
      if (!action || action === "meta") return actionMeta(res);
      if (action === "result") return actionResult(req, res, cfg, query);
      return fail(res, 404, "Not found");
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return fail(res, 405, "Method not allowed");
    }

    // Only same-origin or known Assistara origins may post lead data.
    const origin = req.headers.origin;
    if (origin && !allowedOrigin(origin)) return fail(res, 403, "Origin not allowed");

    const body = await readBody(req);
    if (body === null) return fail(res, 400, "Invalid request body");

    const postAction = String(body.action || action || "").trim();
    if (postAction === "progress") return actionProgress(req, res, cfg, body);
    if (postAction === "event") return actionEvent(req, res, cfg, body);
    if (postAction === "submit") return actionSubmit(req, res, cfg, body);
    if (postAction === "consent") return actionConsent(req, res, cfg, body);
    return fail(res, 400, "Unknown action");
  } catch (error) {
    console.error("quiz-funnel", error && error.message);
    return fail(res, 500, "Unexpected error");
  }
};

// Exported for tests only.
module.exports._internal = {
  mintToken,
  hashToken,
  normaliseAttribution,
  validClientKey,
  EMAIL_RE,
  CONSENT_SOURCE,
  RESULT_TOKEN_TTL_DAYS,
  PLAUSIBLE_MIN_MS,
  LIMITS,
  SITE,
  SESSION_TTL_MS,
};
