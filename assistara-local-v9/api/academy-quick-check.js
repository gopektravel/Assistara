"use strict";

const {
  ACADEMY_COOKIE,
  QA_COOKIE,
  allowedOrigin,
  adminTokenClaims,
  config,
  cookieValue,
  noStore,
  unseal,
  validatedLearnerSession,
} = require("./_academy-security");
const questionSets = require("./_quick-check-bank");

const setsByClass = new Map(questionSets.map(set => [set.class_key, set]));
const EMPTY_STATE = Object.freeze({ schema_version: 1, selections: {}, last_checked_selections: {} });
const MAX_BODY_BYTES = 24 * 1024;
const ALLOWED_ACTION_FIELDS = {
  load: new Set(["action", "class_key", "preview"]),
  save_draft: new Set(["action", "class_key", "question_set_version", "selections", "preview"]),
  check: new Set(["action", "class_key", "question_set_version", "selections", "preview"]),
};

function send(res, status, body) {
  noStore(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  let body;
  try {
    body = typeof req.body === "object" && req.body !== null
      ? req.body
      : JSON.parse(String(req.body || "{}"));
  } catch {
    return { error: "Invalid JSON request" };
  }
  if (!body || Array.isArray(body) || typeof body !== "object") return { error: "Invalid request" };
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded, "utf8") > MAX_BODY_BYTES) return { error: "Request is too large" };
  const allowed = ALLOWED_ACTION_FIELDS[body.action];
  if (!allowed) return { error: "Unknown action" };
  const unexpected = Object.keys(body).find(key => !allowed.has(key));
  if (unexpected) return { error: `Unexpected field: ${unexpected}` };
  return { body };
}

function validateClassKey(value) {
  return typeof value === "string" && setsByClass.has(value) ? setsByClass.get(value) : null;
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSelections(selections, set, { complete = false } = {}) {
  if (!plainObject(selections)) return { ok: false, error: "Selections must be an object" };
  const questions = new Map(set.questions.map(question => [question.id, question]));
  const entries = Object.entries(selections);
  if (entries.length > questions.size) return { ok: false, error: "Too many question selections" };
  if (complete && entries.length !== questions.size) return { ok: false, error: "Answer every question before checking" };

  for (const [questionId, optionId] of entries) {
    const question = questions.get(questionId);
    if (!question) return { ok: false, error: "Unknown question ID" };
    if (typeof optionId !== "string" || !question.options.some(option => option.id === optionId)) {
      return { ok: false, error: "Unknown option ID" };
    }
  }
  return { ok: true };
}

function validateStoredState(state, set) {
  if (!plainObject(state) || state.schema_version !== 1) return false;
  const allowed = new Set(["schema_version", "selections", "last_checked_selections"]);
  if (Object.keys(state).some(key => !allowed.has(key))) return false;
  return validateSelections(state.selections, set).ok
    && validateSelections(state.last_checked_selections, set).ok;
}

function publicQuestions(set) {
  return set.questions.map(question => ({
    id: question.id,
    prompt: question.prompt,
    options: question.options.map(option => ({ id: option.id, text: option.text })),
  }));
}

function grade(selections, set) {
  return set.questions.map(question => {
    const selectedOptionId = selections[question.id];
    const correct = selectedOptionId === question.correct_option_id;
    const result = {
      question_id: question.id,
      selected_option_id: selectedOptionId,
      correct,
    };
    if (correct) result.feedback = question.correct_explanation;
    else result.feedback = question.wrong_feedback_by_option[selectedOptionId];
    return result;
  });
}

function isAllCorrect(results, set) {
  return results.length === set.questions.length && results.every(result => result.correct === true);
}

function learnerHeaders(cfg, session, extra = {}) {
  return {
    apikey: cfg.anon,
    Authorization: `Bearer ${session.access_token}`,
    ...extra,
  };
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

async function ownProgress(cfg, session, classKey) {
  const { response, body } = await requestJSON(restUrl(cfg, "academy_class_progress", {
    select: "class_key,completed,completed_at",
    user_id: `eq.${session.user_id}`,
    class_key: `eq.${classKey}`,
    limit: "1",
  }), { headers: learnerHeaders(cfg, session) });
  if (!response.ok) throw new Error("Could not load class progress");
  return Array.isArray(body) ? body[0] || null : null;
}

async function ownDraft(cfg, session, classKey) {
  const { response, body } = await requestJSON(restUrl(cfg, "academy_quick_check_drafts", {
    select: "class_key,question_set_version,state,created_at,updated_at",
    user_id: `eq.${session.user_id}`,
    class_key: `eq.${classKey}`,
    limit: "1",
  }), {
    headers: {
      apikey: cfg.service,
      Authorization: `Bearer ${cfg.service}`,
    },
  });
  if (!response.ok) throw new Error("Could not load Quick Check draft");
  return Array.isArray(body) ? body[0] || null : null;
}

async function writeOwnDraft(cfg, session, set, state) {
  const url = `${cfg.url}/rest/v1/academy_quick_check_drafts?on_conflict=user_id%2Cclass_key`;
  const { response } = await requestJSON(url, {
    method: "POST",
    headers: {
      apikey: cfg.service,
      Authorization: `Bearer ${cfg.service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: session.user_id,
      class_key: set.class_key,
      question_set_version: set.question_set_version,
      state,
    }),
  });
  if (!response.ok) throw new Error("Could not save Quick Check draft");
}

async function deleteOwnDraft(cfg, session, classKey) {
  const { response } = await requestJSON(`${cfg.url}/rest/v1/academy_quick_check_drafts?user_id=eq.${session.user_id}&class_key=eq.${classKey}`, {
    method: "DELETE",
    headers: {
      apikey: cfg.service,
      Authorization: `Bearer ${cfg.service}`,
    },
  });
  if (!response.ok) throw new Error("Could not clear Quick Check draft");
}

async function serverComplete(cfg, userId, classKey) {
  const { response, body } = await requestJSON(`${cfg.url}/rest/v1/rpc/academy_complete_class`, {
    method: "POST",
    headers: {
      apikey: cfg.service,
      Authorization: `Bearer ${cfg.service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_user_id: userId, p_class_key: classKey }),
  });
  if (!response.ok || body !== true) throw new Error("Could not persist class completion");
}

async function authenticate(req, body, cfg) {
  if (body.preview === true) {
    const qaCookie = unseal(cookieValue(req, QA_COOKIE), cfg.cookieSecret);
    if (!qaCookie || qaCookie.aud !== "academy-test-portal") return { error: "Admin QA access is required" };
    const claims = adminTokenClaims(qaCookie.token, cfg.service);
    if (!claims) return { error: "Admin QA access is required" };
    return { preview: true };
  }

  const cookie = unseal(cookieValue(req, ACADEMY_COOKIE), cfg.cookieSecret);
  if (!cookie || cookie.aud !== "academy" || !cookie.access_token) return { error: "Academy session required" };
  const session = await validatedLearnerSession({ access_token: cookie.access_token }, cfg);
  if (!session || session.user_id !== cookie.user_id) return { error: "Academy access is not available" };
  return { preview: false, session };
}

async function loadAction(cfg, auth, set) {
  if (auth.preview) {
    return {
      ok: true,
      class_key: set.class_key,
      question_set_version: set.question_set_version,
      questions: publicQuestions(set),
      completed: false,
      draft: EMPTY_STATE,
      draft_reset: false,
      preview: true,
    };
  }

  const [progress, storedDraft] = await Promise.all([
    ownProgress(cfg, auth.session, set.class_key),
    ownDraft(cfg, auth.session, set.class_key),
  ]);

  if (progress && progress.completed) {
    if (storedDraft) await deleteOwnDraft(cfg, auth.session, set.class_key);
    return {
      ok: true,
      class_key: set.class_key,
      question_set_version: set.question_set_version,
      questions: publicQuestions(set),
      completed: true,
      completed_at: progress.completed_at,
      draft: EMPTY_STATE,
      draft_reset: !!storedDraft,
    };
  }

  let draft = EMPTY_STATE;
  let draftReset = false;
  if (storedDraft) {
    if (storedDraft.question_set_version !== set.question_set_version || !validateStoredState(storedDraft.state, set)) {
      await deleteOwnDraft(cfg, auth.session, set.class_key);
      draftReset = true;
    } else {
      draft = storedDraft.state;
    }
  }

  const checked = validateSelections(draft.last_checked_selections, set, { complete: true });
  const sameAsChecked = checked.ok
    && Object.keys(draft.selections).length === Object.keys(draft.last_checked_selections).length
    && set.questions.every(question => draft.selections[question.id] === draft.last_checked_selections[question.id]);

  return {
    ok: true,
    class_key: set.class_key,
    question_set_version: set.question_set_version,
    questions: publicQuestions(set),
    completed: false,
    draft,
    draft_reset: draftReset,
    last_check_results: sameAsChecked ? grade(draft.last_checked_selections, set) : null,
  };
}

async function saveAction(cfg, auth, set, selections) {
  const valid = validateSelections(selections, set);
  if (!valid.ok) return { status: 400, body: { ok: false, error: valid.error } };
  if (auth.preview) return { status: 200, body: { ok: true, saved: true, preview: true } };

  const progress = await ownProgress(cfg, auth.session, set.class_key);
  if (progress && progress.completed) {
    await deleteOwnDraft(cfg, auth.session, set.class_key);
    return { status: 200, body: { ok: true, completed: true, saved: false } };
  }

  const existing = await ownDraft(cfg, auth.session, set.class_key);
  let lastChecked = {};
  if (existing && existing.question_set_version === set.question_set_version && validateStoredState(existing.state, set)) {
    lastChecked = existing.state.last_checked_selections;
  }
  const state = { schema_version: 1, selections, last_checked_selections: lastChecked };
  await writeOwnDraft(cfg, auth.session, set, state);
  return { status: 200, body: { ok: true, saved: true } };
}

async function checkAction(cfg, auth, set, selections) {
  const valid = validateSelections(selections, set, { complete: true });
  if (!valid.ok) return { status: 400, body: { ok: false, error: valid.error } };
  const results = grade(selections, set);
  const allCorrect = isAllCorrect(results, set);

  if (auth.preview) {
    return {
      status: 200,
      body: { ok: true, results, completed: false, quick_check_passed: allCorrect, preview: true },
    };
  }

  const progress = await ownProgress(cfg, auth.session, set.class_key);
  if (progress && progress.completed) {
    await deleteOwnDraft(cfg, auth.session, set.class_key);
    return { status: 200, body: { ok: true, completed: true, results: null } };
  }

  if (allCorrect) {
    await serverComplete(cfg, auth.session.user_id, set.class_key);
    return {
      status: 200,
      body: { ok: true, results, completed: true, completed_at: new Date().toISOString() },
    };
  }

  await writeOwnDraft(cfg, auth.session, set, {
    schema_version: 1,
    selections,
    last_checked_selections: selections,
  });
  return { status: 200, body: { ok: true, results, completed: false } };
}

module.exports = async function academyQuickCheck(req, res) {
  noStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, error: "Method not allowed" });
  }
  if (!allowedOrigin(req.headers.origin)) return send(res, 403, { ok: false, error: "Forbidden" });

  const parsed = parseBody(req);
  if (parsed.error) return send(res, 400, { ok: false, error: parsed.error });
  const { body } = parsed;
  const set = validateClassKey(body.class_key);
  if (!set) return send(res, 404, { ok: false, error: "Quick Check not found" });
  if (body.action !== "load" && body.question_set_version !== undefined && body.question_set_version !== set.question_set_version) {
    return send(res, 409, { ok: false, error: "Quick Check version is stale", question_set_version: set.question_set_version });
  }
  if (body.action !== "load" && body.question_set_version !== set.question_set_version) {
    return send(res, 409, { ok: false, error: "Current question-set version is required", question_set_version: set.question_set_version });
  }

  let cfg;
  try { cfg = config(); } catch {
    return send(res, 503, { ok: false, error: "Academy service unavailable" });
  }
  try {
    const auth = await authenticate(req, body, cfg);
    if (auth.error) return send(res, 403, { ok: false, error: auth.error });

    if (body.action === "load") return send(res, 200, await loadAction(cfg, auth, set));
    const selections = body.selections;
    if (!plainObject(selections)) return send(res, 400, { ok: false, error: "Selections must be an object" });
    if (body.action === "save_draft") {
      const result = await saveAction(cfg, auth, set, selections);
      return send(res, result.status, result.body);
    }
    const result = await checkAction(cfg, auth, set, selections);
    return send(res, result.status, result.body);
  } catch (error) {
    console.error("academy-quick-check", error && error.message ? error.message : "request failed");
    return send(res, 503, { ok: false, error: "Quick Check service unavailable" });
  }
};

module.exports._test = {
  questionSets,
  validateSelections,
  validateStoredState,
  publicQuestions,
  grade,
  isAllCorrect,
};
