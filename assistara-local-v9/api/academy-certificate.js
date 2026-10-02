"use strict";

// GET /api/academy-certificate
//
// Streams the Certificate of Completion as a PDF when (and only when) the
// caller genuinely qualifies:
//   * the Academy cookie unseals into a live learner session, and
//   * all 90 classes are recorded complete for that learner, and
//   * every phase exam is recorded passed, and
//   * the final Academy assessment is recorded passed.
//
// Graduation is derived from authoritative server-side rows only; nothing the
// browser sends can buy the certificate. The learner simply navigates to this
// route (the HttpOnly cookie rides along), the server re-verifies everything,
// and only then renders the PDF. No answer keys or learner data are involved.
//
// ?preview=1 is accepted only when the QA portal cookie unseals, for the test
// portal's visual check; it never issues a real certificate in a learner flow.

const {
  ACADEMY_COOKIE,
  QA_COOKIE,
  allowedOrigin,
  config,
  cookieValue,
  noStore,
  unseal,
  validatedLearnerSession,
} = require("./_academy-security");
const { ALL_CLASS_KEYS } = require("./_curriculum");
const { buildCertificatePdf } = require("./_certificate-pdf");

const PHASE_EXAM_KEYS = ["phase_1", "phase_2", "phase_3", "phase_4"];

function sendText(res, status, message) {
  noStore(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}

function learnerHeaders(cfg, session) {
  return { apikey: cfg.anon, Authorization: `Bearer ${session.access_token}` };
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  let body = {};
  try { body = await response.json(); } catch {}
  return { response, body };
}

function restUrl(cfg, table, params) {
  const query = new URLSearchParams(params);
  return `${cfg.url}/rest/v1/${table}?${query.toString()}`;
}

async function completedClassKeys(cfg, session) {
  const { response, body } = await requestJSON(restUrl(cfg, "academy_class_progress", {
    select: "class_key",
    user_id: `eq.${session.user_id}`,
    completed: "eq.true",
    limit: "1000",
  }), { headers: learnerHeaders(cfg, session) });
  if (!response.ok) throw new Error("Could not load class progress");
  return new Set(Array.isArray(body) ? body.map(row => row.class_key) : []);
}

async function ownAttempts(cfg, session, examKey) {
  const { response, body } = await requestJSON(restUrl(cfg, "academy_exam_attempts", {
    select: "exam_key,score,passed,attempted_at",
    user_id: `eq.${session.user_id}`,
    exam_key: `eq.${examKey}`,
    order: "attempted_at.desc",
    limit: "100",
  }), { headers: learnerHeaders(cfg, session) });
  if (!response.ok) throw new Error("Could not load exam history");
  return Array.isArray(body) ? body : [];
}

function bestPassed(rows) {
  return rows.some(row => row.passed === true);
}

module.exports = async function academyCertificate(req, res) {
  noStore(res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendText(res, 405, "Method not allowed");
  }

  const origin = String(req.headers.origin || "");
  if (origin && !allowedOrigin(origin)) {
    return sendText(res, 403, "Forbidden");
  }

  let cfg;
  try { cfg = config(); } catch {
    return sendText(res, 503, "Academy service unavailable");
  }

  const isPreview = String(req.url || "").includes("preview=1");

  try {
    let owner = null;      // display name
    let session = null;
    let grantDate = null;
    let preview = false;

    if (isPreview) {
      const qa = unseal(cookieValue(req, QA_COOKIE), cfg.cookieSecret);
      if (!qa || qa.aud !== "academy-test-portal") {
        return sendText(res, 403, "Preview certificate requires valid QA access");
      }
      owner = "Test Student";
      preview = true;
    } else {
      const cookie = unseal(cookieValue(req, ACADEMY_COOKIE), cfg.cookieSecret);
      if (!cookie || cookie.aud !== "academy" || !cookie.access_token) {
        return sendText(res, 403, "Sign in to download your certificate");
      }
      session = await validatedLearnerSession({ access_token: cookie.access_token }, cfg);
      if (!session || session.user_id !== cookie.user_id) {
        return sendText(res, 403, "Academy access is not available");
      }
    }

    if (!preview) {
      // Re-verify graduation from authoritative rows. The browser cannot fake
      // any of these three conditions.
      const [completed, ...attemptRows] = await Promise.all([
        completedClassKeys(cfg, session),
        ...PHASE_EXAM_KEYS.map(key => ownAttempts(cfg, session, key)),
        ownAttempts(cfg, session, "final"),
      ]);
      const phases = attemptRows.slice(0, PHASE_EXAM_KEYS.length);
      const finalRows = attemptRows[PHASE_EXAM_KEYS.length];

      const allClassesDone = ALL_CLASS_KEYS.every(classKey => completed.has(classKey));
      const allPhasesPassed = phases.every(bestPassed);
      const finalPassed = bestPassed(finalRows);

      if (!allClassesDone || !allPhasesPassed || !finalPassed) {
        return sendText(res, 403,
          "Graduation requirements are not complete. Finish every class and pass every exam before downloading the certificate.");
      }

      // Use the learner's recorded name, falling back to the email prefix.
      const user = await fetch(`${cfg.url}/auth/v1/user`, {
        headers: { apikey: cfg.anon, Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      }).then(r => r.json()).catch(() => ({}));
      const meta = (user.user_metadata || {});
      owner = meta.name || meta.full_name || String(user.email || "").split("@")[0] || "Assistara Academy Graduate";

      const lastFinal = finalRows.slice().sort((a, b) =>
        String(b.attempted_at || "").localeCompare(String(a.attempted_at || "")))[0];
      grantDate = lastFinal && lastFinal.attempted_at
        ? String(lastFinal.attempted_at).slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    }

    const pdf = buildCertificatePdf({
      learnerName: owner,
      courseTitle: "Assistara Academy Virtual Assistant Program",
      grantDate: grantDate || new Date().toISOString().slice(0, 10),
    });

    noStore(res);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="Assistara-Academy-Certificate.pdf"');
    res.setHeader("Content-Length", String(pdf.length));
    res.end(pdf);
  } catch (error) {
    console.error("academy-certificate", error && error.message ? error.message : "request failed");
    return sendText(res, 503, "Certificate service unavailable");
  }
};

module.exports._test = { bestPassed };