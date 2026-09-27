"use strict";

// Internal reviewer notes for Academy applications.
//
// These notes are strictly internal. `admin_notes` is deliberately NOT part of
// the applicant-facing answers allowlist (see _academy-application-fields.js and
// admin-application-answers.js), so it can never reach the student dashboard,
// the learner gate, or any applicant-facing response. This function is the only
// reader and the only writer, and it is reachable only by a verified Admin.
//
// The write path touches the `admin_notes` column and nothing else. It cannot
// change an application status, cannot create a payment or enrolment record,
// and cannot send an email, so saving a note has no side effects on the
// applicant or on the funnel.

const {
  config,
  allowedOrigin,
  adminTokenClaims,
  adminTokenDiagnostic,
  noStore,
} = require("./_academy-security");

const MAX_IDS_PER_REQUEST = 50;
const MAX_NOTE_LENGTH = 5000;
// Matches the application primary key shape, so an id can never break out of a
// PostgREST filter.
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

function validId(value) {
  return typeof value === "string" && SAFE_ID.test(value.trim());
}

function requestedIds(body) {
  const raw = Array.isArray(body.ids)
    ? body.ids
    : body.id !== undefined && body.id !== null
      ? [body.id]
      : [];
  const ids = [];
  for (const value of raw) {
    if (!validId(value)) continue;
    const id = value.trim();
    if (ids.includes(id)) continue;
    ids.push(id);
  }
  return ids.slice(0, MAX_IDS_PER_REQUEST);
}

// The only column this function is ever allowed to read or write.
const NOTE_COLUMN = "admin_notes";

module.exports = async function adminApplicationNotes(req, res) {
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

  const action = String(body.action || "read");

  // Validate the request shape before doing anything expensive, but never
  // touch the database until the Admin token has been verified.
  const writeId = action === "write" ? (validId(body.id) ? body.id.trim() : null) : null;
  const readIds = action === "read" ? requestedIds(body) : null;
  if (action === "write" && !writeId) {
    return json(res, 400, { ok: false, error: "A valid application id is required" });
  }
  if (action === "write" && typeof body.note !== "string") {
    return json(res, 400, { ok: false, error: "A note is required" });
  }
  if (action === "write" && body.note.trim().length > MAX_NOTE_LENGTH) {
    return json(res, 400, { ok: false, error: "That note is too long" });
  }
  if (action === "read" && !readIds.length) {
    return json(res, 400, { ok: false, error: "A valid application id is required" });
  }
  if (action !== "read" && action !== "write") {
    return json(res, 400, { ok: false, error: "Unknown action" });
  }

  // Fail closed: without a verified Admin token nothing below runs.
  let cfg;
  try {
    cfg = config();
  } catch (error) {
    console.error("admin-application-notes configuration", error.message);
    return json(res, 503, { ok: false, error: "Admin authorization could not be verified" });
  }
  const token = bearerToken(req);
  if (!adminTokenClaims(token, cfg.service)) {
    return json(res, 401, { ok: false, error: "Valid Admin authorization is required", authDiagnostic: adminTokenDiagnostic(token, cfg.service) });
  }

  if (action === "write") {
    const note = body.note.trim();
    const url = `${cfg.url}/rest/v1/academy_applications?id=eq.${encodeURIComponent(writeId)}`;
    let updated;
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          apikey: cfg.service,
          Authorization: `Bearer ${cfg.service}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        // admin_notes and nothing else, so a saved note cannot change status,
        // create a payment, or trigger an enrolment email.
        body: JSON.stringify({ [NOTE_COLUMN]: note || null }),
        cache: "no-store",
      });
      if (!response.ok) {
        console.error("admin-application-notes update", response.status);
        return json(res, 502, { ok: false, error: "The note could not be saved" });
      }
      updated = await response.json();
    } catch (error) {
      console.error("admin-application-notes update", error);
      return json(res, 502, { ok: false, error: "The note could not be saved" });
    }
    const row = Array.isArray(updated) ? updated[0] : null;
    if (!row) return json(res, 404, { ok: false, error: "That application no longer exists" });
    return json(res, 200, {
      ok: true,
      id: String(row.id),
      note: typeof row[NOTE_COLUMN] === "string" ? row[NOTE_COLUMN] : note,
    });
  }

  const filter = readIds.map(id => `"${id}"`).join(",");
  const url = `${cfg.url}/rest/v1/academy_applications?select=id,${NOTE_COLUMN}&id=in.(${filter})`;

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
      console.error("admin-application-notes query", response.status);
      return json(res, 502, { ok: false, error: "Reviewer notes could not be loaded" });
    }
    rows = await response.json();
  } catch (error) {
    console.error("admin-application-notes query", error);
    return json(res, 502, { ok: false, error: "Reviewer notes could not be loaded" });
  }

  const records = Array.isArray(rows) ? rows : [];
  const byId = new Map();
  for (const row of records) {
    if (!row || row.id === undefined || row.id === null) continue;
    const note = row[NOTE_COLUMN];
    byId.set(String(row.id), { note: typeof note === "string" ? note : "" });
  }

  return json(res, 200, {
    ok: true,
    notes: readIds.map(id => ({ id, ...(byId.get(id) || { note: "" }) })),
  });
};
