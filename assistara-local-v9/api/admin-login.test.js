const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const adminPath = path.join(root, "assistara-local-v9", "admin.html");
const apiPath = path.join(root, "supabase", "functions", "admin-api", "index.ts");

test("admin page JavaScript parses and the login form is wired", () => {
  const html = fs.readFileSync(adminPath, "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(scripts.length, "expected an inline admin script");
  for (const source of scripts) assert.doesNotThrow(() => new Function(source));
  assert.match(html, /<form id="login" class="login">/);
  assert.match(html, /<button id="loginBtn" class="main" type="submit">/);
  assert.match(html, /\$\("login"\)\.onsubmit = async \(event\)/);
  assert.match(html, /btn\.disabled = true/);
  assert.match(html, /errorEl\.textContent = e\.message/);
});

test("admin credentials are secret-backed and recovery is not exposed", () => {
  const source = fs.readFileSync(apiPath, "utf8");
  assert.match(source, /Deno\.env\.get\("ADMIN_PASSWORD_SALT"\)/);
  assert.match(source, /Deno\.env\.get\("ADMIN_PASSWORD_HASH"\)/);
  assert.match(source, /PBKDF2/);
  assert.match(source, /310_000/);
  assert.doesNotMatch(source, /reset-password|recoveryPassword|temporary password/i);
  assert.doesNotMatch(source, /const PASSWORD_(?:SALT|HASH)="[a-f0-9]+"/i);
});

test("all admin bearer-token consumers enforce the revocation version", () => {
  const names = [
    "admin-api",
    "admin-applications",
    "admin-accounts",
    "admin-gcash-payment",
    "admin-delete-application",
    "admin-send-onboarding",
    "admin-b2b-calls",
    "admin-acquisition",
    "admin-academy-capacity",
    "admin-finance",
  ];
  for (const name of names) {
    const source = fs.readFileSync(path.join(root, "supabase", "functions", name, "index.ts"), "utf8");
    assert.match(source, /ADMIN_TOKEN_VERSION/, `${name} must enforce ADMIN_TOKEN_VERSION`);
  }
});
