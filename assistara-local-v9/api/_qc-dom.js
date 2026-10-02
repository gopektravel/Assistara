"use strict";

// _qc-dom.js — a very small, dependency-free DOM used ONLY by the Quick Check
// client test. It exists because the repository has no node_modules and no jsdom.
//
// It is NOT shipped to the browser and is NOT part of the Academy runtime. It
// implements exactly the surface the inline dashboard script touches (see the
// selector/DOM scan in the change notes): getElementById, querySelector(All) over
// a tag/.class/#id/[attr]/[attr="v"]/[attr^="v"] selector subset, innerHTML
// set/get, classList, dataset, appendChild/insertBefore/remove, firstChild,
// contains, closest, and onclick dispatch.
//
// Its purpose is to let the test execute the REAL, unmodified client code from
// academy-dashboard.html against a real (if minimal) document tree, so the
// assertions are about shipped behaviour rather than a re-implementation.

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’",
  lsquo: "‘", ldquo: "“", rdquo: "”", middot: "·",
  arrowright: "→", check: "✓", times: "×", bull: "•",
  larr: "←", rarr: "→", uarr: "↑", darr: "↓",
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : whole;
  });
}

function camel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

class TextNode {
  constructor(data) {
    this.nodeType = 3;
    this.data = data;
    this.parentNode = null;
  }
  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); }
  toHTML() { return this.data; }
}

class Element {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.onclick = null;
    this.style = {};
  }

  // ---- attributes -------------------------------------------------------
  hasAttribute(name) { return this.attributes.has(String(name).toLowerCase()); }
  getAttribute(name) {
    const v = this.attributes.get(String(name).toLowerCase());
    return v === undefined ? null : v;
  }
  setAttribute(name, value) { this.attributes.set(String(name).toLowerCase(), String(value)); }
  removeAttribute(name) { this.attributes.delete(String(name).toLowerCase()); }

  get id() { return this.getAttribute("id") || ""; }
  set id(value) { this.setAttribute("id", value); }

  get className() { return this.getAttribute("class") || ""; }
  set className(value) { this.setAttribute("class", value); }

  get classList() {
    const owner = this;
    const list = () => (owner.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    const write = (next) => owner.setAttribute("class", [...new Set(next)].join(" "));
    return {
      add(...names) { write(list().concat(names)); },
      remove(...names) { write(list().filter(n => !names.includes(n))); },
      contains(name) { return list().includes(name); },
      toggle(name, force) {
        const has = list().includes(name);
        const on = force === undefined ? !has : !!force;
        if (on) write(list().concat(name));
        else write(list().filter(n => n !== name));
        return on;
      },
    };
  }

  get dataset() {
    const owner = this;
    return new Proxy({}, {
      get(_t, prop) {
        if (typeof prop !== "string") return undefined;
        return owner.getAttribute("data-" + prop.replace(/[A-Z]/g, c => "-" + c.toLowerCase())) ?? undefined;
      },
      set(_t, prop, value) {
        owner.setAttribute("data-" + String(prop).replace(/[A-Z]/g, c => "-" + c.toLowerCase()), value);
        return true;
      },
      has(_t, prop) {
        return owner.hasAttribute("data-" + String(prop).replace(/[A-Z]/g, c => "-" + c.toLowerCase()));
      },
    });
  }

  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(value) { if (value) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); }
  get type() { return this.getAttribute("type") || ""; }
  set type(value) { this.setAttribute("type", value); }
  get value() { return this.getAttribute("value") || ""; }
  set value(v) { this.setAttribute("value", v); }

  // ---- tree -------------------------------------------------------------
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    queueMutationRecords(this);
    return node;
  }
  insertBefore(node, reference) {
    if (!reference) return this.appendChild(node);
    const at = this.childNodes.indexOf(reference);
    if (at < 0) return this.appendChild(node);
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.splice(at, 0, node);
    queueMutationRecords(this);
    return node;
  }
  removeChild(node) {
    const at = this.childNodes.indexOf(node);
    if (at >= 0) this.childNodes.splice(at, 1);
    node.parentNode = null;
    queueMutationRecords(this);
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  // ---- content ----------------------------------------------------------
  get textContent() {
    return this.childNodes.map(n => (n.nodeType === 3 ? n.data : n.textContent)).join("");
  }
  set textContent(value) {
    this.childNodes.forEach(n => { n.parentNode = null; });
    this.childNodes = [];
    if (value !== "" && value !== null && value !== undefined) {
      this.appendChild(new TextNode(String(value)));
    }
  }

  get innerHTML() { return this.childNodes.map(n => n.toHTML()).join(""); }
  set innerHTML(html) {
    this.childNodes.forEach(n => { n.parentNode = null; });
    this.childNodes = [];
    parseInto(this, String(html));
    queueMutationRecords(this);
  }

  toHTML() {
    const tag = this.tagName.toLowerCase();
    const attrs = [...this.attributes].map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, "&quot;")}"`)).join("");
    if (VOID_ELEMENTS.has(tag)) return `<${tag}${attrs}>`;
    return `<${tag}${attrs}>${this.innerHTML}</${tag}>`;
  }

  // ---- selectors --------------------------------------------------------
  matches(selector) {
    return parseSelectorList(selector).some(seq => matchesSequence(this, seq));
  }
  closest(selector) {
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) {
      if (n.matches(selector)) return n;
    }
    return null;
  }
  querySelectorAll(selector) {
    const out = [];
    const sequences = parseSelectorList(selector);
    walk(this, node => {
      if (node !== this && sequences.some(seq => matchesSequence(node, seq))) out.push(node);
    });
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  // ---- events -----------------------------------------------------------
  addEventListener(type, fn, options) { addListener(this, type, fn, options); }
  removeEventListener(type, fn) { removeListener(this, type, fn); }
  dispatchEvent(event) { return dispatchEvent(this, event); }
  click() {
    // A disabled control does not dispatch click in a real browser, and neither
    // does a programmatic .click() on one.
    if (this.disabled) return false;
    const event = new SyntheticEvent("click", { button: 0, detail: 1 });
    dispatchEvent(this, event);
    return !event.propagationStopped;
  }
  dispatch(type, extra) {
    const event = new SyntheticEvent(type, extra || {});
    dispatchEvent(this, event);
    return !event.propagationStopped;
  }
  focus() {}
  blur() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  scrollIntoView() {}
}

// ---------------------------------------------------------------------------
// Event dispatch — capture / target / bubble, with stopPropagation support.
//
// The dashboard relies on this: a document-level capture listener records the
// active class when an option button is clicked, and a document-level bubble
// listener then re-mounts the Quick Check after the lesson re-render. Without a
// real three-phase dispatch the harness silently skips that re-mount and the
// check button would appear "unwired" for reasons that do not exist in a
// browser.
// ---------------------------------------------------------------------------
class SyntheticEvent {
  constructor(type, init) {
    this.type = String(type);
    this.target = null;
    this.currentTarget = null;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    this.immediateStopped = false;
    Object.assign(this, init || {});
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
  stopImmediatePropagation() { this.propagationStopped = true; this.immediateStopped = true; }
}

function listenerStore(node) {
  if (!node.__qcListeners) {
    Object.defineProperty(node, "__qcListeners", { value: [], enumerable: false, writable: true });
  }
  return node.__qcListeners;
}

function addListener(node, type, fn, options) {
  if (typeof fn !== "function") return;
  const capture = options === true || !!(options && options.capture);
  listenerStore(node).push({ type: String(type), fn, capture });
}

function removeListener(node, type, fn) {
  const list = node.__qcListeners;
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].type === String(type) && list[i].fn === fn) list.splice(i, 1);
  }
}

function invoke(node, event, capturePhase) {
  const list = node.__qcListeners;
  if (!list || !list.length) return;
  // Copy: a handler may add or remove listeners while the event is in flight.
  for (const entry of list.slice()) {
    if (entry.type !== event.type) continue;
    if (entry.capture !== capturePhase) continue;
    if (event.propagationStopped) return;
    event.currentTarget = node;
    entry.fn.call(node, event);
  }
}

function dispatchEvent(target, event) {
  event.target = target;
  // Ancestor chain, target first, root last.
  const path = [];
  for (let node = target; node; node = node.parentNode) path.push(node);

  // Capture: root -> parent of target.
  for (let i = path.length - 1; i > 0; i--) {
    if (event.propagationStopped) break;
    invoke(path[i], event, true);
  }
  // Target phase: capture and bubble listeners, then the on<type> property.
  if (!event.propagationStopped) invoke(target, event, true);
  if (!event.immediateStopped) {
    const handler = target["on" + event.type];
    if (typeof handler === "function") {
      event.currentTarget = target;
      handler.call(target, event);
    }
  }
  if (!event.immediateStopped) invoke(target, event, false);
  // Bubble: parent of target -> root.
  for (let i = 1; i < path.length; i++) {
    if (event.propagationStopped) break;
    invoke(path[i], event, false);
  }
  event.currentTarget = null;
  return !event.defaultPrevented;
}

function walk(root, visit) {
  for (const child of root.childNodes || []) {
    if (child.nodeType === 1) { visit(child); walk(child, visit); }
  }
}

// ---------------------------------------------------------------------------
// HTML parser — enough for the markup the renderers emit.
// ---------------------------------------------------------------------------
const TAG_RE = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s/>=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'`=<>]+))?)*)\s*(\/)?>|<!--[\s\S]*?-->/g;
const ATTR_RE = /([^\s/>=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

function parseInto(root, html) {
  const stack = [root];
  let cursor = 0;
  let match;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(html)) !== null) {
    const text = html.slice(cursor, match.index);
    if (text) stack[stack.length - 1].appendChild(new TextNode(decodeEntities(text)));
    cursor = TAG_RE.lastIndex;

    if (match[0].startsWith("<!--")) continue;

    const closing = !!match[1];
    const tag = match[2].toLowerCase();
    const rawAttrs = match[3] || "";
    const selfClosing = !!match[4];

    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName.toLowerCase() === tag) { stack.length = i; break; }
      }
      continue;
    }

    const element = new Element(tag);
    ATTR_RE.lastIndex = 0;
    let attr;
    while ((attr = ATTR_RE.exec(rawAttrs)) !== null) {
      const name = attr[1].toLowerCase();
      const value = attr[2] !== undefined ? attr[2] : attr[3] !== undefined ? attr[3] : attr[4] !== undefined ? attr[4] : "";
      element.setAttribute(name, decodeEntities(value));
    }
    stack[stack.length - 1].appendChild(element);

    if (RAW_TEXT_ELEMENTS.has(tag)) {
      const close = html.toLowerCase().indexOf("</" + tag, cursor);
      const end = close < 0 ? html.length : close;
      if (end > cursor) element.appendChild(new TextNode(html.slice(cursor, end)));
      cursor = end;
      TAG_RE.lastIndex = end;
      continue;
    }
    if (!selfClosing && !VOID_ELEMENTS.has(tag)) stack.push(element);
  }
  const tail = html.slice(cursor);
  if (tail) stack[stack.length - 1].appendChild(new TextNode(decodeEntities(tail)));
}

// ---------------------------------------------------------------------------
// Selector engine: comma groups of descendant sequences of compound selectors.
// Compound parts: tag, .class, #id, [attr], [attr="v"], [attr^="v"], [attr*="v"]
// ---------------------------------------------------------------------------
function parseCompound(text) {
  const part = { tag: null, classes: [], id: null, attrs: [] };
  const re = /(^[a-zA-Z][a-zA-Z0-9-]*)|\.([A-Za-z0-9_-]+)|#([A-Za-z0-9_-]+)|\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) part.tag = m[1].toUpperCase();
    else if (m[2]) part.classes.push(m[2]);
    else if (m[3]) part.id = m[3];
    else if (m[4]) {
      const am = /^\s*([^\s~^$*|=\]]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\s*$/.exec(m[4]);
      if (!am) continue;
      const op = am[2] || null;
      const value = am[3] !== undefined ? am[3] : am[4] !== undefined ? am[4] : am[5] !== undefined ? am[5] : null;
      part.attrs.push({ name: am[1].toLowerCase(), op, value: value === null ? null : decodeEntities(value) });
    }
  }
  return part;
}

function parseSelectorList(selector) {
  return String(selector).split(",").map(group => group.trim()).filter(Boolean)
    .map(group => group.split(/\s+/).map(parseCompound));
}

const selectorCache = new Map();
function cachedSelectorList(selector) {
  if (!selectorCache.has(selector)) selectorCache.set(selector, parseSelectorList(selector));
  return selectorCache.get(selector);
}

function matchesCompound(element, compound) {
  if (!element || element.nodeType !== 1) return false;
  if (compound.tag && element.tagName !== compound.tag) return false;
  if (compound.id !== null && element.getAttribute("id") !== compound.id) return false;
  if (compound.classes.length) {
    const own = (element.getAttribute("class") || "").split(/\s+/);
    for (const c of compound.classes) if (!own.includes(c)) return false;
  }
  for (const attr of compound.attrs) {
    if (!element.hasAttribute(attr.name)) return false;
    if (attr.op === null) continue;
    const actual = element.getAttribute(attr.name);
    if (attr.op === "=" && actual !== attr.value) return false;
    if (attr.op === "^=" && !actual.startsWith(attr.value)) return false;
    if (attr.op === "$=" && !actual.endsWith(attr.value)) return false;
    if (attr.op === "*=" && !actual.includes(attr.value)) return false;
  }
  return true;
}

// Right-to-left descendant matching.
function matchesSequence(element, sequence) {
  if (!matchesCompound(element, sequence[sequence.length - 1])) return false;
  let index = sequence.length - 2;
  let node = element.parentNode;
  while (index >= 0) {
    let advanced = false;
    for (let n = node; n && n.nodeType === 1; n = n.parentNode) {
      if (matchesCompound(n, sequence[index])) { advanced = true; node = n; break; }
    }
    if (!advanced) return false;
    index -= 1;
  }
  return true;
}

// Replace querySelector(All) on Element.prototype with the cached version.
Element.prototype.querySelectorAll = function querySelectorAll(selector) {
  const out = [];
  const sequences = cachedSelectorList(selector);
  walk(this, node => {
    if (node !== this && sequences.some(seq => matchesSequence(node, seq))) out.push(node);
  });
  return out;
};
Element.prototype.querySelector = function querySelector(selector) {
  return this.querySelectorAll(selector)[0] || null;
};
Element.prototype.matches = function matches(selector) {
  return cachedSelectorList(selector).some(seq => matchesSequence(this, seq));
};

// ---------------------------------------------------------------------------
// Document / window
// ---------------------------------------------------------------------------
class StubDocument {
  constructor() {
    this.nodeType = 9;
    this.documentElement = new Element("html");
    this.body = new Element("body");
    this.documentElement.appendChild(this.body);
    // The document is the root of the event propagation path, so it must be
    // linked into the parent chain: capture and bubble listeners registered
    // with document.addEventListener only run if it is on that path.
    this.documentElement.parentNode = this;
    this.byId = new Map();
    this.readyState = "complete";
    this.visibilityState = "visible";
  }
  // Unknown ids resolve to a registered detached stub so unrelated rendering
  // code can write to them without a null dereference. Assertions only ever
  // read from #courseView and the recorded network log.
  getElementById(id) {
    const key = String(id);
    if (!this.byId.has(key)) {
      const el = new Element("div");
      el.setAttribute("id", key);
      this.byId.set(key, el);
    }
    const stub = this.byId.get(key);
    if (stub.parentNode) return stub;
    const found = Array.from(this.body.querySelectorAll("[id]")).find(el => el.getAttribute("id") === key);
    return found || stub;
  }
  createElement(tag) { return new Element(tag); }
  createTextNode(data) { return new TextNode(data); }
  querySelector(selector) { return this.body.querySelector(selector); }
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
  addEventListener(type, fn, options) { addListener(this, type, fn, options); }
  removeEventListener(type, fn) { removeListener(this, type, fn); }
  dispatchEvent(event) {
    if (typeof event === "string") event = new SyntheticEvent(event);
    return dispatchEvent(this, event);
  }
  fire(type, extra) { return this.dispatchEvent(new SyntheticEvent(type, extra)); }
  onkeydown = null;
}

class StubStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(String(k)) ? this.map.get(String(k)) : null; }
  setItem(k, v) { this.map.set(String(k), String(v)); }
  removeItem(k) { this.map.delete(String(k)); }
  clear() { this.map.clear(); }
}

// The shipped script relies on a MutationObserver to put the approved
// "QUICK CHECK REVIEW" panel back on a completed Module 6 lesson
// (keepCompletedModule6TestsVisible). A stub that never fires hides that whole
// code path from the suite, so the observers are real: any childList mutation
// under an observed root delivers a record on the next microtask, exactly as a
// browser batches them.
const mutationObservers = [];
let mutationFlushQueued = false;

function queueMutationRecords(target) {
  if (!mutationObservers.length) return;
  if (mutationFlushQueued) return;
  mutationFlushQueued = true;
  queueMicrotask(() => {
    mutationFlushQueued = false;
    const record = { type: "childList", target, addedNodes: [], removedNodes: [], previousSibling: null, nextSibling: null };
    for (const observer of mutationObservers.slice()) {
      if (observer.target !== target && !observer.target.contains(target)) continue;
      observer.callback([record], observer);
    }
  });
}

class StubMutationObserver {
  constructor(callback) { this.callback = callback; this.records = []; this.target = null; }
  observe(target) { this.target = target; mutationObservers.push(this); }
  disconnect() {
    const at = mutationObservers.indexOf(this);
    if (at >= 0) mutationObservers.splice(at, 1);
  }
  takeRecords() { const r = this.records; this.records = []; return r; }
}

function createWindow(options) {
  const opts = options || {};
  const document = new StubDocument();
  const window = {
    document,
    location: {
      pathname: opts.pathname || "/academy/dashboard",
      href: "https://www.getassistara.com" + (opts.pathname || "/academy/dashboard"),
      search: "",
      hash: "",
      origin: "https://www.getassistara.com",
      assign() {}, replace() {}, reload() {},
    },
    history: { pushState() {}, replaceState() {}, back() {}, length: 1 },
    localStorage: new StubStorage(),
    sessionStorage: new StubStorage(),
    scrollY: 0,
    scrollX: 0,
    scrollTo() { this.scrollY = 0; },
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 0); },
    cancelAnimationFrame(handle) { clearTimeout(handle); },
    MutationObserver: StubMutationObserver,
    matchMedia() { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; },
    getComputedStyle() { return { getPropertyValue() { return ""; } }; },
    navigator: { userAgent: "qc-client-test", language: "en", clipboard: { writeText() { return Promise.resolve(); } } },
    innerWidth: 1280,
    innerHeight: 900,
    devicePixelRatio: 1,
    alert() {},
    confirm() { return false; },
    open() { return null; },
    close() {},
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    setInterval: (...a) => setInterval(...a),
    clearInterval: (...a) => clearInterval(...a),
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    btoa: s => Buffer.from(String(s), "binary").toString("base64"),
    atob: s => Buffer.from(String(s), "base64").toString("binary"),
  };
  window.window = window;
  window.self = window;
  window.globalThis = window;
  window.top = window;
  return window;
}

module.exports = { createWindow, Element, TextNode, StubDocument, StubStorage, SyntheticEvent, decodeEntities, parseInto };
