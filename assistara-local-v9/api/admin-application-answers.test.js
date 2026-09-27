"use strict";

// End-to-end coverage for the Admin application-answers feature.
//
// Two halves:
//   1. api/admin-application-answers.js must fail closed for every caller that
//      is not a verified Admin, and must never widen a database grant.
//   2. assistara-local-v9/admin.html must render the real stored answers on an
//      expandable card, using the live application form's question wording.
//
// The Admin is a single inline script in a static page, so half 2 runs that
// exact script inside a small DOM shim with the network stubbed. Nothing in
// the production page is re-implemented here.
//
//   node --test api/admin-application-answers.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const security = require("./_academy-security");
const {
  APPLICATION_FIELDS,
  APPLICATION_FIELDS_BY_NAME,
} = require("./_academy-application-fields");

const ROOT = path.join(__dirname, "..");
const ADMIN_HTML = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
const APPLY_HTML = fs.readFileSync(path.join(ROOT, "academy-apply.html"), "utf8");
const ADMIN_TOKEN_SECRET = "local-test-service-role-key";

/* ------------------------------------------------------------------ *
 * Tiny DOM shim: enough of the platform to run the real Admin script. *
 * ------------------------------------------------------------------ */

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&amp;/g, "&");
}

function encodeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function encodeAttribute(value) {
  return encodeText(value).replace(/"/g, "&quot;");
}

class TextNode {
  constructor(data) {
    this.nodeType = 3;
    this.parentNode = null;
    this.data = data;
  }
  get textContent() {
    return this.data;
  }
}

class Element {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = String(tagName).toLowerCase();
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.style = {};
    this._value = "";
    this.dataset = new Proxy({}, {
      get: (_, key) => this.getAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`) ?? undefined,
      set: (_, key, value) => { this.setAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value); return true; },
    });
    this.classList = {
      contains: name => (this.getAttribute("class") || "").split(/\s+/).includes(name),
      add: (...names) => {
        const set = new Set((this.getAttribute("class") || "").split(/\s+/).filter(Boolean));
        names.forEach(name => set.add(name));
        this.setAttribute("class", [...set].join(" "));
      },
      remove: (...names) => {
        const set = new Set((this.getAttribute("class") || "").split(/\s+/).filter(Boolean));
        names.forEach(name => set.delete(name));
        this.setAttribute("class", [...set].join(" "));
      },
      toggle: (name, force) => {
        const has = this.classList.contains(name);
        const next = force === undefined ? !has : !!force;
        if (next) this.classList.add(name);
        else this.classList.remove(name);
        return next;
      },
    };
  }
  get id() {
    return this.getAttribute("id") || "";
  }
  get value() {
    if (this._value !== "") return this._value;
    return this.getAttribute("value") || "";
  }
  set value(next) {
    this._value = String(next);
  }
  get textContent() {
    return this.childNodes.map(node => node.textContent).join("");
  }
  set textContent(next) {
    this.childNodes = [];
    if (next !== "" && next !== null && next !== undefined) this.append(new TextNode(String(next)));
  }
  get innerHTML() {
    return this.childNodes.map(serialize).join("");
  }
  set innerHTML(html) {
    this.childNodes = [];
    parse(String(html), this);
  }
  setAttribute(name, value) {
    this.attributes.set(String(name).toLowerCase(), String(value));
  }
  getAttribute(name) {
    const value = this.attributes.get(String(name).toLowerCase());
    return value === undefined ? null : value;
  }
  removeAttribute(name) {
    this.attributes.delete(String(name).toLowerCase());
  }
  append(node) {
    node.parentNode = this;
    this.childNodes.push(node);
  }
  descendants() {
    const out = [];
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  matches(selector) {
    return selector
      .split(",")
      .map(part => part.trim())
      .filter(Boolean)
      .some(part => {
        const tokens = part.split(/\s+/);
        const last = tokens.pop();
        if (!matchesSimple(this, last)) return false;
        let node = this;
        for (const ancestor of tokens) {
          node = node.parentNode;
          if (!node || node.nodeType !== 1 || !matchesSimple(node, ancestor)) return false;
        }
        return true;
      });
  }
  closest(selector) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
  querySelectorAll(selector) {
    return this.descendants().filter(node => node.matches(selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatchEvent(event) {
    event.target = event.target || this;
    let node = this;
    while (node) {
      for (const handler of node.listeners.get(event.type) || []) handler.call(node, event);
      node = node.parentNode;
    }
    return true;
  }
  click() {
    this.dispatchEvent({ type: "click", target: this, preventDefault() {}, stopPropagation() {} });
  }
}

function matchesSimple(node, selector) {
  const pattern = /^([a-zA-Z][\w-]*)?((?:[#.][\w-]+|\[[^\]]+\])*)$/;
  const match = pattern.exec(selector);
  if (!match) return false;
  if (match[1] && node.tagName !== match[1].toLowerCase()) return false;
  const rest = match[2] || "";
  const parts = rest.match(/[#.][\w-]+|\[[^\]]+\]/g) || [];
  for (const part of parts) {
    if (part.startsWith(".")) {
      if (!node.classList.contains(part.slice(1))) return false;
    } else if (part.startsWith("#")) {
      if (node.id !== part.slice(1)) return false;
    } else {
      const inner = part.slice(1, -1);
      const eq = inner.indexOf("=");
      if (eq < 0) {
        if (!node.attributes.has(inner.toLowerCase())) return false;
      } else {
        const key = inner.slice(0, eq).toLowerCase();
        const raw = inner.slice(eq + 1).replace(/^["']|["']$/g, "");
        if (node.getAttribute(key) !== raw) return false;
      }
    }
  }
  return true;
}

function serialize(node) {
  if (node.nodeType === 3) return encodeText(node.data);
  const attrs = [...node.attributes.entries()].map(([key, value]) => ` ${key}="${encodeAttribute(value)}"`).join("");
  if (VOID_TAGS.has(node.tagName)) return `<${node.tagName}${attrs}>`;
  return `<${node.tagName}${attrs}>${node.childNodes.map(serialize).join("")}</${node.tagName}>`;
}

function parse(html, root) {
  const stack = [root];
  let index = 0;
  const push = node => stack[stack.length - 1].append(node);
  while (index < html.length) {
    const lt = html.indexOf("<", index);
    if (lt < 0) {
      const text = html.slice(index);
      if (text) push(new TextNode(decodeEntities(text)));
      break;
    }
    if (lt > index) {
      const text = html.slice(index, lt);
      if (text) push(new TextNode(decodeEntities(text)));
    }
    if (html.startsWith("<!--", lt)) {
      index = html.indexOf("-->", lt) + 3;
      continue;
    }
    if (html.startsWith("<!", lt)) {
      index = html.indexOf(">", lt) + 1;
      continue;
    }
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;
    const raw = html.slice(lt + 1, gt);
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim().toLowerCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tagName === name) {
          stack.length = i;
          break;
        }
      }
      index = gt + 1;
      continue;
    }
    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameMatch = /^([a-zA-Z][\w-]*)/.exec(body);
    const element = new Element(nameMatch ? nameMatch[1] : "div");
    const attrPattern = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    attrPattern.lastIndex = nameMatch ? nameMatch[0].length : 0;
    let attr;
    while ((attr = attrPattern.exec(body))) {
      const value = attr[2] ?? attr[3] ?? attr[4] ?? "";
      element.setAttribute(attr[1], decodeEntities(value));
    }
    push(element);
    if (!selfClosing && !VOID_TAGS.has(element.tagName)) stack.push(element);
    index = gt + 1;
  }
}

function buildDocument() {
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(ADMIN_HTML);
  assert.ok(bodyMatch, "admin.html must have a body");
  const documentElement = new Element("html");
  const body = new Element("body");
  documentElement.append(body);
  parse(bodyMatch[1].replace(/<script>[\s\S]*?<\/script>/gi, ""), body);
  const document = {
    documentElement,
    body,
    getElementById: id => body.querySelector(`#${id}`),
    querySelector: selector => body.querySelector(selector),
    querySelectorAll: selector => body.querySelectorAll(selector),
  };
  return document;
}

/* ------------------------------------------------------------------ *
 * Fixtures                                                            *
 * ------------------------------------------------------------------ */

// A stored row shaped exactly like public.academy_applications for the real
// Edward Apolito application, including the special characters and long
// free-text answers a real applicant produces.
const EDWARD_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Edward Apolito",
  email: "apolitoedward08@gmail.com",
  contact_id: "22222222-2222-4222-8222-222222222222",
  current_situation: "Currently unemployed / between jobs",
  why_remote_work:
    "I want to work remotely and build a stable income for my family. I have been applying for remote work for months and I am ready to be disciplined about it. & I would like to help my parents.",
  what_tried: "Online courses, cold DMs, and two Upwork profiles.",
  biggest_obstacle: "No income while I learn & no clear niche yet.",
  remote_work_interest: "Virtual assistant",
  weekly_commitment: "Yes",
  payment_readiness: "Willing to invest in myself",
  status: "new",
  decision: null,
  payment_status: null,
  payment_method: null,
  auth_user_id: null,
  source: "website_academy_application",
  tracking_token: "LAUNCH01",
  acquisition_visit_id: "33333333-3333-4333-8333-333333333333",
  acquisition_visitor_id: "visitor-abc",
  gcash_reference: null,
  notes: null,
  admin_notes: null,
  reviewed_at: null,
  created_at: "2026-09-20T08:15:00Z",
};

const MARIA_ROW = {
  ...EDWARD_ROW,
  id: "44444444-4444-4444-8444-444444444444",
  name: "Maria Santos",
  email: "maria@example.test",
  // Deliberately awkward stored values: arrays, booleans, an object, and
  // columns that were never answered.
  current_situation: null,
  why_remote_work: ["Social media", "Admin support"],
  what_tried: "",
  biggest_obstacle: "needs_more_time",
  remote_work_interest: { first_choice: "Admin", second_choice: "Bookkeeping" },
  weekly_commitment: true,
  payment_readiness: false,
  notes: "Referred by a past client.",
};

const JOHN_ROW = {
  ...EDWARD_ROW,
  id: "55555555-5555-5555-8555-555555555555",
  name: "John Dizon",
  email: "john@example.test",
  current_situation: "Student / recent graduate",
  why_remote_work: "I want to build a portfolio.",
  what_tried: "Nothing yet.",
  biggest_obstacle: "Starting from zero.",
  remote_work_interest: "Not sure yet",
  weekly_commitment: "Not sure",
  payment_readiness: "Need payment plan",
  source: null,
  tracking_token: null,
  notes: null,
};

function adminToken(payload = { u: "admin", exp: Date.now() + 12 * 60 * 60 * 1000 }) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const signature = Buffer.from(
    crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(encoded, "utf8").digest(),
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${encoded}.${signature}`;
}

function adminEnv() {
  process.env.SUPABASE_URL = "https://supabase.example.test";
  process.env.SUPABASE_ANON_KEY = "local-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = ADMIN_TOKEN_SECRET;
  process.env.ACADEMY_COOKIE_SECRET = "local-test-cookie-secret-32-bytes-minimum";
}

/* ------------------------------------------------------------------ *
 * 1. Endpoint security                                                *
 * ------------------------------------------------------------------ */

function apiRequest({ origin = "https://getassistara.com", authorization, body } = {}) {
  const headers = {};
  if (origin !== null) headers.origin = origin;
  if (authorization) headers.authorization = authorization;
  return { method: "POST", headers, body };
}

function apiResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    end(value = "") { this.body = Buffer.isBuffer(value) ? value.toString("utf8") : String(value); },
  };
}

test("the allowlist is exactly the live form's questions, in form order", () => {
  // Closed list: the seven questions the applicant actually answers, and
  // nothing else. Adding a column to the database must not add a question.
  assert.deepEqual(APPLICATION_FIELDS_BY_NAME, [
    "current_situation",
    "why_remote_work",
    "what_tried",
    "biggest_obstacle",
    "remote_work_interest",
    "weekly_commitment",
    "payment_readiness",
  ]);
  // Every label is the form's own wording, and every question is asked in that
  // order in the DOM.
  let cursor = 0;
  for (const field of APPLICATION_FIELDS) {
    const at = APPLY_HTML.indexOf(field.label, cursor);
    assert.ok(at > -1, `academy-apply.html no longer asks: ${field.label}`);
    cursor = at;
  }
  // Nothing technical is on the list.
  for (const banned of [
    "source",
    "tracking_token",
    "created_at",
    "updated_at",
    "reviewed_at",
    "notes",
    "admin_notes",
    "id",
  ]) {
    assert.equal(APPLICATION_FIELDS_BY_NAME.includes(banned), false, `${banned} must not be a question`);
  }

  // Every answer the website-form Edge Function writes must be described.
  const wired = [...APPLY_HTML.matchAll(/JSON\.stringify\(\{type:'academy_application'([\s\S]*?)\}\)\}\)/g)]
    .map(m => [...m[1].matchAll(/(\w+):fd\.get\('(\w+)'\)/g)].map(p => p[1]));
  assert.ok(wired.length, "could not read the application payload from academy-apply.html");
  for (const key of wired[0]) {
    if (key === "name" || key === "email") continue;
    assert.ok(APPLICATION_FIELDS_BY_NAME.includes(key), `stored answer column is not a listed question: ${key}`);
  }
});

test("machine choice values map to the label the applicant saw on the form", () => {
  const readiness = APPLICATION_FIELDS.find(f => f.field === "payment_readiness");
  assert.ok(readiness.options, "payment readiness stores a machine token and needs a label map");
  for (const [stored, label] of Object.entries(readiness.options)) {
    assert.ok(APPLY_HTML.includes(`value="${stored}"`), `form no longer offers: ${stored}`);
    assert.ok(APPLY_HTML.includes(label), `form no longer shows this exact label: ${label}`);
  }
  // A form whose stored value already is the human answer needs no map.
  assert.equal(APPLICATION_FIELDS.find(f => f.field === "weekly_commitment").options, undefined);
  assert.ok(APPLY_HTML.includes('name="commitment" value="Yes"'));
  assert.ok(APPLY_HTML.includes('name="commitment" value="Not sure"'));
});

test("application answers endpoint fails closed for every non-Admin caller", async () => {
  adminEnv();
  delete process.env.ACADEMY_ALLOWED_ORIGINS;
  const handler = require("./admin-application-answers");
  const before = global.fetch;

  global.fetch = () => { throw new Error("an unauthorized request must never reach the database"); };
  for (const request of [
    apiRequest({ body: { action: "list", ids: [EDWARD_ROW.id] } }),
    apiRequest({ origin: null, body: { action: "list", ids: [EDWARD_ROW.id] } }),
    apiRequest({ origin: "https://attacker.example", body: { action: "list", ids: [EDWARD_ROW.id] } }),
    apiRequest({ origin: "https://attacker.vercel.app", body: { action: "list", ids: [EDWARD_ROW.id] } }),
    apiRequest({ authorization: "Bearer nonsense", body: { action: "list", ids: [EDWARD_ROW.id] } }),
    apiRequest({
      authorization: `Bearer ${adminToken({ u: "learner", exp: Date.now() + 60_000 })}`,
      body: { action: "list", ids: [EDWARD_ROW.id] },
    }),
    apiRequest({
      authorization: `Bearer ${adminToken({ u: "admin", exp: Date.now() - 1 })}`,
      body: { action: "list", ids: [EDWARD_ROW.id] },
    }),
  ]) {
    const res = apiResponse();
    await handler(request, res);
    assert.ok([400, 401, 403].includes(res.statusCode), `expected a refusal, got ${res.statusCode}`);
    assert.doesNotMatch(res.body, /apolito|maria|john/i, "a refused request must not leak application data");
  }
  global.fetch = before;
});

test("application answers endpoint rejects unusable ids before touching the database", async () => {
  adminEnv();
  const handler = require("./admin-application-answers");
  const before = global.fetch;
  global.fetch = async () => { throw new Error("no request may reach the database"); };
  const auth = `Bearer ${adminToken()}`;
  for (const body of [{}, { ids: [] }, { ids: [1, 2, 3] }, { ids: "not-an-array" }, { id: "a".repeat(65) }]) {
    const res = apiResponse();
    await handler(apiRequest({ authorization: auth, body }), res);
    assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
  const bad = apiResponse();
  await handler(apiRequest({ authorization: auth, body: '{"action":"list",' }), bad);
  assert.equal(bad.statusCode, 400);
  global.fetch = before;
});

test("application answers endpoint returns every stored answer for a verified Admin", async () => {
  adminEnv();
  const handler = require("./admin-application-answers");
  const before = global.fetch;
  let seenUrl = "";
  global.fetch = async url => {
    seenUrl = String(url);
    return new Response(JSON.stringify([EDWARD_ROW, MARIA_ROW]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const res = apiResponse();
  await handler(
    apiRequest({ authorization: `Bearer ${adminToken()}`, body: { action: "list", ids: [EDWARD_ROW.id, MARIA_ROW.id, JOHN_ROW.id] } }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Cache-Control"], /no-store/);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, true);

  const edward = payload.applications.find(a => a.id === EDWARD_ROW.id);
  assert.equal(edward.found, true);
  // Exactly the allowlisted questions come back, in order, and nothing else.
  assert.deepEqual(Object.keys(edward.answers), APPLICATION_FIELDS_BY_NAME);
  assert.equal(edward.answers.why_remote_work, EDWARD_ROW.why_remote_work);
  assert.equal(edward.answers.weekly_commitment, "Yes");
  assert.equal(edward.answers.payment_readiness, "Willing to invest in myself");
  assert.equal(payload.fields.length, 7);
  assert.equal(payload.extra_fields, undefined, "unknown-column discovery is removed");

  // Requested but missing ids come back empty rather than failing the batch.
  const missing = payload.applications.find(a => a.id === JOHN_ROW.id);
  assert.equal(missing.found, false);
  assert.deepEqual(missing.answers, {});

  // The endpoint itself never widens the database and never hands back
  // internal identity columns or review metadata.
  assert.match(seenUrl, /^https:\/\/supabase\.example\.test\/rest\/v1\/academy_applications\?/);
  assert.doesNotMatch(res.body, /auth_user_id|contact_id|acquisition_visitor_id/);
  assert.doesNotMatch(res.body, new RegExp(ADMIN_TOKEN_SECRET));
  // No technical field may appear anywhere in the payload.
  for (const banned of ["source", "tracking_token", "created_at", "reviewed_at", "admin_notes", "LAUNCH01"]) {
    assert.equal(res.body.includes(`"${banned}"`), false, `payload must not carry ${banned}`);
  }
  assert.equal(res.body.includes("details"), false);

  const maria = payload.applications.find(a => a.id === MARIA_ROW.id);
  assert.deepEqual(maria.answers.why_remote_work, ["Social media", "Admin support"]);
  assert.equal(maria.answers.weekly_commitment, true);
  assert.deepEqual(maria.answers.remote_work_interest, { first_choice: "Admin", second_choice: "Bookkeeping" });
  assert.equal(maria.answers.what_tried, "");

  global.fetch = before;
});

test("a column added to the database later is never returned", async () => {
  // A new column is not an applicant answer. It must not be described, must not
  // be returned, and must not reach the Admin.
  adminEnv();
  const handler = require("./admin-application-answers");
  const before = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          ...EDWARD_ROW,
          laptop_access: "Yes",
          new_question_added_later: "42",
          internal_score: 99,
          partner_referral_id: "ref-1234",
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  const res = apiResponse();
  await handler(apiRequest({ authorization: `Bearer ${adminToken()}`, body: { ids: [EDWARD_ROW.id] } }), res);
  const payload = JSON.parse(res.body);
  assert.deepEqual(Object.keys(payload.applications[0].answers), APPLICATION_FIELDS_BY_NAME);
  assert.doesNotMatch(res.body, /laptop_access|new_question_added_later|internal_score|partner_referral_id/);
  global.fetch = before;
});

/* ------------------------------------------------------------------ *
 * 2. Admin page behaviour                                             *
 * ------------------------------------------------------------------ */

function startAdmin(overrides = {}) {
  const document = buildDocument();
  const calls = [];
  const token = adminToken();
  const store = new Map();
  const sandbox = {
    document,
    console,
    Element,
    Date,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    Boolean,
    RegExp,
    Error,
    Promise,
    setTimeout,
    clearTimeout,
    sessionStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key),
    },
    location: { href: "", replace() {} },
    alert() {},
    confirm: () => true,
    fetch: async (url, init = {}) => {
      const target = String(url);
      const body = typeof init.body === "string" ? JSON.parse(init.body || "{}") : init.body || {};
      calls.push({ url: target, body, headers: init.headers || {} });
      if (target.endsWith("/functions/v1/admin-api")) {
        return new Response(JSON.stringify({ ok: true, token }), { status: 200 });
      }
      if (target.endsWith("/functions/v1/admin-applications")) {
        return new Response(
          JSON.stringify({
            ok: true,
            applications: [EDWARD_ROW, MARIA_ROW, JOHN_ROW],
            signups: [],
            b2b: [],
          }),
          { status: 200 },
        );
      }
      if (target.endsWith("/functions/v1/admin-accounts")) {
        return new Response(JSON.stringify({ ok: true, accounts: [] }), { status: 200 });
      }
      if (target.endsWith("/functions/v1/admin-acquisition")) {
        return new Response(JSON.stringify({ ok: true, links: [] }), { status: 200 });
      }
      if (target.endsWith("/functions/v1/admin-b2b-calls")) {
        return new Response(JSON.stringify({ ok: true, calls: [] }), { status: 200 });
      }
      if (target.includes("/api/admin-application-answers")) {
        assert.equal((init.headers || {}).Authorization, `Bearer ${token}`, "answers must be sent with the Admin session token");
        assert.equal((init.headers || {})["Content-Type"], "application/json");
        const rows = body.ids.map(id => [EDWARD_ROW, MARIA_ROW, JOHN_ROW].find(row => row.id === id)).filter(Boolean);
        return new Response(
          JSON.stringify({
            ok: true,
            fields: APPLICATION_FIELDS,
            applications: body.ids.map(id => {
              const row = rows.find(r => r.id === id);
              if (!row) return { id, answers: {}, found: false };
              const answers = {};
              for (const field of APPLICATION_FIELDS_BY_NAME) answers[field] = row[field] ?? null;
              Object.assign(answers, (overrides.answers && overrides.answers[row.id]) || {});
              return { id, answers, found: true };
            }),
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: "unexpected" }), { status: 404 });
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  const code = /<script>([\s\S]*?)<\/script>/.exec(ADMIN_HTML)[1];
  vm.runInContext(code, context, { filename: "admin.html#inline" });
  return { context, document, calls };
}

async function login(context, document) {
  const username = document.getElementById("username");
  const password = document.getElementById("password");
  username.value = "admin";
  password.value = "correct horse";
  await document.getElementById("loginBtn").onclick();
  await new Promise(resolve => setTimeout(resolve, 0));
}

test("Admin renders applications and keeps every existing control", async () => {
  const { context, document } = startAdmin();
  await login(context, document);

  assert.equal(document.getElementById("login").style.display, "none");
  assert.equal(document.getElementById("dash").style.display, "block");
  assert.equal(document.getElementById("logout").style.display, "block");
  assert.equal(document.getElementById("testPortal").style.display, "block");

  const cards = document.getElementById("cards").querySelectorAll(".card");
  assert.equal(cards.length, 3, "all three applications must be listed");
  const edward = document.getElementById(`app-${EDWARD_ROW.id}`);
  assert.ok(edward, "Edward's application must still be present");
  assert.match(edward.innerHTML, /Edward Apolito/);
  assert.match(edward.innerHTML, /apolitoedward08@gmail\.com/);

  // Existing actions are untouched.
  assert.match(edward.innerHTML, /decision\('.*','accepted'\)/);
  assert.match(edward.innerHTML, /Accept \+ email/);
  assert.match(edward.innerHTML, /Decline \+ email/);
  assert.match(edward.innerHTML, /Delete application/);

  // Counters still work.
  const stats = document.getElementById("stats").textContent;
  assert.match(stats, /Active applications/);
  assert.match(stats, /3/);

  // Every card is independently expandable and starts collapsed.
  for (const row of [EDWARD_ROW, MARIA_ROW, JOHN_ROW]) {
    const card = document.getElementById(`app-${row.id}`);
    assert.ok(card.querySelector("[data-toggle-answers]"), `missing expand control for ${row.name}`);
    assert.equal(card.classList.contains("open"), false);
    assert.equal(card.querySelector(".answersPanel").innerHTML, "", "no answers are rendered before expanding");
  }
});

test("expanding a card reveals that applicant's real answers and collapses again", async () => {
  const { context, document, calls } = startAdmin();
  await login(context, document);
  const edward = document.getElementById(`app-${EDWARD_ROW.id}`);
  const trigger = edward.querySelector("[data-toggle-answers]");

  trigger.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  const panel = document.getElementById(`answers-${EDWARD_ROW.id}`);
  const html = panel.innerHTML;
  assert.match(html, /Application answers/);
  assert.equal(edward.classList.contains("open"), true);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.match(trigger.textContent, /Hide answers/);

  // Every real question, with the real submitted answer.
  assert.match(html, /What best describes your current situation\?/);
  assert.match(html, /Currently unemployed \/ between jobs/);
  assert.match(html, /Why do you want to start working remotely\?/);
  assert.match(html, /I want to work remotely and build a stable income for my family\./);
  assert.match(html, /What have you already tried to get a remote job or client\?/);
  assert.match(html, /Online courses, cold DMs, and two Upwork profiles\./);
  assert.match(html, /What is your biggest obstacle right now\?/);
  assert.match(html, /No income while I learn/);
  assert.match(html, /What type of remote work interests you most\?/);
  assert.match(html, /Virtual assistant/);
  assert.match(html, /Can you commit consistent time every week to complete the Academy and take action\?/);
  assert.match(html, /If selected, would you be ready to join at ₱6,900\?/);

  // The questions read as the completed form, in the form's own order.
  const questions = panel.querySelectorAll(".answerQ").map(node => node.textContent);
  assert.deepEqual(questions, APPLICATION_FIELDS.map(field => field.label));

  // The payment choice is shown as the sentence the applicant saw, never as the
  // stored token.
  assert.match(html, /Yes, I\u2019m willing to invest in myself\./);
  assert.equal(html.includes("Willing to invest in myself</p>"), false);

  // Review metadata and technical fields are not part of the answers.
  for (const forbidden of [
    "Application submitted",
    "Application details",
    "Application source",
    "Tracking",
    "Reviewed at",
    "Application notes",
    "Admin notes",
    "website_academy_application",
    "LAUNCH01",
    EDWARD_ROW.id,
    EDWARD_ROW.contact_id,
    EDWARD_ROW.acquisition_visit_id,
  ]) {
    assert.equal(html.includes(forbidden), false, `panel must not show ${forbidden}`);
  }

  // No raw column names, and no unrendered JS values anywhere on the page.
  const whole = document.getElementById("cards").innerHTML;
  for (const forbidden of ["undefined", "null", "[object Object]", "current_situation", "why_remote_work", "weekly_commitment", "payment_readiness"]) {
    assert.equal(whole.includes(forbidden), false, `page must not show ${forbidden}`);
  }
  // The ampersand is escaped for display, not dropped.
  assert.match(html, /&amp; I would like to help my parents\./);

  // Collapse.
  trigger.click();
  assert.equal(edward.classList.contains("open"), false);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.match(trigger.textContent, /View answers/);

  // The answers are fetched once per application, not once per toggle, and the
  // panel is hidden again because the card no longer carries the open class.
  const answerCalls = calls.filter(call => call.url.includes("/api/admin-application-answers"));
  assert.equal(answerCalls.length, 1);
  assert.deepEqual(answerCalls[0].body, { action: "list", ids: [EDWARD_ROW.id] });
  trigger.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(
    calls.filter(call => call.url.includes("/api/admin-application-answers")).length,
    1,
    "a cached application must not be refetched",
  );
  assert.match(document.getElementById(`answers-${EDWARD_ROW.id}`).innerHTML, /Online courses, cold DMs/);
});

test("each card expands independently", async () => {
  const { context, document } = startAdmin();
  await login(context, document);
  const open = id => document.getElementById(`app-${id}`).querySelector("[data-toggle-answers]");
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  open(EDWARD_ROW.id).click();
  await settle();
  open(MARIA_ROW.id).click();
  await settle();

  assert.equal(document.getElementById(`app-${EDWARD_ROW.id}`).classList.contains("open"), true);
  assert.equal(document.getElementById(`app-${MARIA_ROW.id}`).classList.contains("open"), true);
  assert.equal(document.getElementById(`app-${JOHN_ROW.id}`).classList.contains("open"), false);

  // Maria's card shows Maria's answers, not Edward's.
  const mariaHtml = document.getElementById(`answers-${MARIA_ROW.id}`).innerHTML;
  assert.match(mariaHtml, /Social media/);
  assert.doesNotMatch(mariaHtml, /apolitoedward08/);
  assert.doesNotMatch(mariaHtml, /Edward/);

  // Collapsing Edward leaves Maria open.
  open(EDWARD_ROW.id).click();
  assert.equal(document.getElementById(`app-${EDWARD_ROW.id}`).classList.contains("open"), false);
  assert.equal(document.getElementById(`app-${MARIA_ROW.id}`).classList.contains("open"), true);
});

test("empty, array, boolean and object answers render cleanly", async () => {
  const { context, document } = startAdmin();
  await login(context, document);
  document.getElementById(`app-${MARIA_ROW.id}`).querySelector("[data-toggle-answers]").click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const html = document.getElementById(`answers-${MARIA_ROW.id}`).innerHTML;

  // Legitimately unanswered questions say so.
  assert.match(html, /What best describes your current situation\?<\/p><p class="answerA empty">Not answered/);
  assert.match(html, /What have you already tried to get a remote job or client\?<\/p><p class="answerA empty">Not answered/);
  // Arrays are joined, booleans and objects are humanised.
  assert.match(html, /Social media • Admin support/);
  assert.match(html, />Yes<\/p>/);
  assert.match(html, />No<\/p>/);
  assert.match(html, /First choice: Admin/);
  assert.match(html, /Second choice: Bookkeeping/);
  // No raw booleans or machine values leak through.
  assert.doesNotMatch(html, />true<|>false</);
  assert.doesNotMatch(html, /Referred by a past client\./);
  assert.doesNotMatch(html, /undefined|null|\[\]|\{\}/);
});

test("a stored answer that is not a listed question is never shown", async () => {
  // Even if the payload somehow carried a column the allowlist does not name,
  // the panel renders only the canonical questions.
  const { context, document } = startAdmin({
    answers: { [EDWARD_ROW.id]: { laptop_access: "Yes, a laptop", referral_code: "REF-9" } },
  });
  await login(context, document);
  document.getElementById(`app-${EDWARD_ROW.id}`).querySelector("[data-toggle-answers]").click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const panel = document.getElementById(`answers-${EDWARD_ROW.id}`);

  assert.deepEqual(
    panel.querySelectorAll(".answerQ").map(node => node.textContent),
    APPLICATION_FIELDS.map(field => field.label),
  );
  assert.equal(panel.textContent.includes("laptop"), false);
  assert.equal(panel.textContent.includes("REF-9"), false);
  assert.doesNotMatch(panel.innerHTML, /Laptop access|Referral code/);
});

test("every current question is shown for an application with gaps", async () => {
  const { context, document } = startAdmin();
  await login(context, document);
  document.getElementById(`app-${JOHN_ROW.id}`).querySelector("[data-toggle-answers]").click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const panel = document.getElementById(`answers-${JOHN_ROW.id}`);
  const html = panel.innerHTML;

  // All seven questions, in form order, whatever the applicant answered.
  assert.equal(panel.querySelectorAll(".answerItem").length, 7);
  assert.deepEqual(
    panel.querySelectorAll(".answerQ").map(node => node.textContent),
    APPLICATION_FIELDS.map(field => field.label),
  );
  // The other payment option is shown as the sentence from the form.
  assert.match(html, /I\u2019m ready to join, but I would need a payment plan\./);
  assert.equal(html.includes("Need payment plan</p>"), false);
  // Technical metadata is absent even when the row has some.
  assert.doesNotMatch(html, /Reviewed at|Application notes|Admin notes|Tracking \/ referral code|Application source/);
  assert.doesNotMatch(html, /1970/);
  assert.match(html, /Student \/ recent graduate/);
});

test("long answers wrap on a full width row and short answers stay compact", async () => {
  const { context, document } = startAdmin();
  await login(context, document);
  document.getElementById(`app-${EDWARD_ROW.id}`).querySelector("[data-toggle-answers]").click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const panel = document.getElementById(`answers-${EDWARD_ROW.id}`);
  const wide = panel.querySelectorAll(".answerItem.wide").map(node => node.textContent);
  assert.ok(wide.some(text => text.startsWith("Why do you want to start working remotely?")), "long free text must use a full width row");
  assert.ok(!wide.some(text => text.startsWith("What type of remote work interests you most?")), "short answers must stay in the grid");
  assert.match(panel.innerHTML, /class="answerA"[^>]*>I want to work remotely/);
});

test("search, tab switching and reload keep working with expanded cards", async () => {
  const { context, document } = startAdmin();
  await login(context, document);
  const search = document.getElementById("search");
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  search.value = "maria";
  search.oninput();
  await settle();
  const cards = document.getElementById("cards").querySelectorAll(".card");
  assert.equal(cards.length, 1);
  assert.match(cards[0].innerHTML, /Maria Santos/);

  search.value = "";
  search.oninput();
  await settle();
  assert.equal(document.getElementById("cards").querySelectorAll(".card").length, 3);

  // Open state survives a re-render (typing in search) and repaints instantly.
  document.getElementById(`app-${EDWARD_ROW.id}`).querySelector("[data-toggle-answers]").click();
  await settle();
  search.value = "j";
  search.oninput();
  search.value = "";
  search.oninput();
  await settle();
  const edward = document.getElementById(`app-${EDWARD_ROW.id}`);
  assert.equal(edward.classList.contains("open"), true, "open state must survive a re-render");
  assert.match(edward.querySelector(".answersPanel").innerHTML, /Online courses, cold DMs/);

  // Other tabs still render.
  const tabs = document.querySelectorAll(".nav button[data-tab]");
  assert.deepEqual(tabs.map(t => t.getAttribute("data-tab")), ["applicants", "students", "webinar", "b2b"]);
  const expected = {
    students: /Students/,
    webinar: /Registered/,
    b2b: /Discovery calls/,
    applicants: /Active applications/,
  };
  for (const tabButton of tabs) {
    tabButton.onclick();
    await settle();
    const name = tabButton.getAttribute("data-tab");
    assert.match(document.getElementById("stats").textContent, expected[name], `${name} tab stopped rendering`);
  }
  const applicantsTab = tabs[0];
  applicantsTab.onclick();
  await settle();
  assert.equal(document.getElementById(`app-${EDWARD_ROW.id}`).classList.contains("open"), true);
});

test("answer data never reaches the browser from an unauthenticated path", () => {
  // The answers endpoint is a Vercel Function, not a static asset, and it is
  // not reachable through any public route.
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const nodeBuilds = (config.builds || []).filter(build => build.use === "@vercel/node").map(build => build.src);
  assert.ok(nodeBuilds.includes("api/admin-application-answers.js"), "the answers function must be a deployed function");
  const build = (config.builds || []).find(entry => entry.src === "api/admin-application-answers.js");
  assert.ok(build.config.includeFiles.includes("api/_academy-security.js"));
  assert.ok(build.config.includeFiles.includes("api/_academy-application-fields.js"));
  const published = (config.builds || []).filter(entry => entry.use === "@vercel/static").map(entry => entry.src);
  assert.equal(published.includes("api/admin-application-answers.js"), false);
  assert.ok(
    (config.routes || []).some(route => route.src === "/api/admin-application-answers" && route.dest.endsWith("admin-application-answers.js")),
    "the answers route must point at the function, not a static file",
  );
  // No Supabase key or service credential may appear in the Admin page.
  for (const secret of ["SUPABASE_SERVICE_ROLE", "service_role", "eyJ", "sb_secret"]) {
    assert.equal(ADMIN_HTML.includes(secret), false, `admin.html must not contain ${secret}`);
  }
  // The Admin still uses the existing session-token architecture.
  assert.match(ADMIN_HTML, /assistara_admin_token/);
  assert.match(ADMIN_HTML, /Authorization: "Bearer " \+ token/);
});

test("the shared gate helpers used by the answers endpoint behave as documented", () => {
  assert.ok(security.adminTokenClaims(adminToken(), ADMIN_TOKEN_SECRET));
  assert.equal(security.adminTokenClaims(adminToken({ u: "admin", exp: Date.now() - 1 }), ADMIN_TOKEN_SECRET), null);
  assert.equal(security.allowedOrigin("https://getassistara.com"), true);
  assert.equal(security.allowedOrigin("https://attacker.example"), false);
  assert.equal(security.allowedOrigin(null), false);
});
