"use strict";

// Admin-only read of the answers submitted on the Assistara Academy
// application form.
//
// public.academy_applications has no anon or authenticated grant, so the
// answers cannot be read from a browser query. This function reads them
// server-side with the service role, and only after the caller's Admin token
// has been verified with the same HMAC check the rest of the Admin
// infrastructure uses (see _academy-security.js adminTokenClaims, reused by
// api/test-portal-session.js). It never returns the service key, never accepts
// an unauthenticated read, and never widens any database grant or RLS policy.

const {
  config,
  allowedOrigin,
  adminTokenClaims,
  noStore,
} = require("./_academy-security");
const {
  APPLICATION_FIELDS,
  SYSTEM_FIELDS,
  CANONICAL_FIELDS,
  humanizeField,
} = require("./_academy-application-fields");

const MAX_IDS_PER_REQUEST = 50;
// Matches the application primary key shape and nothing that could break out
// of the PostgREST filter, so ids can be used in `id=in.(...)` safely.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function json(res, status, body) {
  noStore(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  try {
    const parsed = JSON.parse(String(req.body || "{}"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function bearerToken(req) {
  const header = String((req.headers && req.headers.authorization) || "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : "";
}

function requestedIds(body) {
  const raw = Array.isArray(body.ids)
    ? body.ids
    : body.id !== undefined && body.id !== null
      ? [body.id]
      : [];
  const ids = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!SAFE_ID.test(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids.slice(0, MAX_IDS_PER_REQUEST);
}

function projectRow(row) {
  const answers = {};
  const details = {};
  for (const field of APPLICATION_FIELDS) {
    if (field.group === "details") details[field.field] = row[field.field] ?? null;
    else answers[field.field] = row[field.field] ?? null;
  }

  // Deny-by-default on noise, allow-by-default on real application data: any
  // stored column that is neither a canonical field nor a known system column
  // is surfaced instead of being silently dropped.
  const internal = new Set([...SYSTEM_FIELDS, ...CANONICAL_FIELDS]);
  for (const [key, value] of Object.entries(row)) {
    if (internal.has(key)) continue;
    answers[key] = value ?? null;
  }

  return {
    id: String(row.id),
    answers,
    details,
  };
}

module.exports = async function adminApplicationAnswers(req, res) {
  noStore(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST" || !allowedOrigin(req.headers && req.headers.origin)) {
    return json(res, 403, { ok: false, error: "Forbidden" });
  }

  const body = readBody(req);
  if (!body) return json(res, 400, { ok: false, error: "Invalid request" });

  const ids = requestedIds(body);
  if (!ids.length) {
    return json(res, 400, { ok: false, error: "A valid application id is required" });
  }

  let cfg;
  try {
    cfg = config();
  } catch (error) {
    console.error("admin-application-answers configuration", error.message);
    return json(res, 503, { ok: false, error: "Admin authorization could not be verified" });
  }

  if (!adminTokenClaims(bearerToken(req), cfg.service)) {
    return json(res, 401, { ok: false, error: "Valid Admin authorization is required" });
  }

  const filter = ids.map(id => `"${id}"`).join(",");
  const url = `${cfg.url}/rest/v1/academy_applications?select=*&id=in.(${filter})`;

  let rows;
  try {
    const response = await fetch(url, {
      headers: {
        apikey: cfg.service,
        Authorization: `Bearer ${cfg.service}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("admin-application-answers query", response.status);
      return json(res, 502, { ok: false, error: "Application answers could not be loaded" });
    }
    rows = await response.json();
  } catch (error) {
    console.error("admin-application-answers query", error);
    return json(res, 502, { ok: false, error: "Application answers could not be loaded" });
  }

  const records = Array.isArray(rows) ? rows : [];
  const byId = new Map();
  for (const row of records) {
    if (!row || row.id === undefined || row.id === null) continue;
    byId.set(String(row.id), projectRow(row));
  }

  const applications = ids.map(id => {
    const record = byId.get(id);
    return record ? { ...record, found: true } : { id, answers: {}, details: {}, found: false };
  });

  const extraFields = [];
  for (const record of applications) {
    for (const field of Object.keys(record.answers)) {
      if (CANONICAL_FIELDS.includes(field)) continue;
      if (extraFields.some(entry => entry.field === field)) continue;
      extraFields.push({ field, label: humanizeField(field), group: "answers" });
    }
  }

  return json(res, 200, {
    ok: true,
    fields: APPLICATION_FIELDS,
    extra_fields: extraFields,
    applications,
  });
};
