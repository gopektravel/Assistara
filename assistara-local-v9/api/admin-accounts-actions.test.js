"use strict";

// admin-accounts-actions.test.js — REGRESSION for the broken Admin account
// controls.
//
// The Admin UI renders "Suspend account" / "Reactivate" and "Password reset"
// buttons. Both called the default API (admin-applications), whose handler
// answers 503 "temporarily unavailable", so the buttons could never work and
// suspension — a security control the entitlement predicate already enforces —
// had no server implementation. The fix implements both actions in
// admin-accounts (the account-management function the Delete button already
// uses) and points the UI at it.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const admin = fs.readFileSync(path.join(root, "assistara-local-v9", "admin.html"), "utf8");
const accounts = fs.readFileSync(path.join(root, "supabase", "functions", "admin-accounts", "index.ts"), "utf8");

test("admin UI sends account actions to admin-accounts", () => {
  assert.match(admin, /req\("suspend_account", \{ id, suspended \}, ACC\)/,
    "Suspend/Reactivate must call admin-accounts");
  assert.match(admin, /req\("send_password_reset", \{ id \}, ACC\)/,
    "Password reset must call admin-accounts");
  assert.doesNotMatch(admin, /req\("suspend_account", \{ id, suspended \}\)/,
    "the old admin-applications call must be gone");
});

test("admin-accounts implements suspend and reactivate via suspended_at", () => {
  assert.match(accounts, /action==='suspend_account'/);
  assert.match(accounts, /suspended_at:suspended\?now:null/,
    "suspend must set suspended_at and reactivate must clear it");
  assert.match(accounts, /academy_applications/);
});

test("admin-accounts implements admin password reset through Supabase Auth", () => {
  assert.match(accounts, /action==='send_password_reset'/);
  assert.match(accounts, /resetPasswordForEmail/, "must use the project's auth recovery flow");
});

test("suspension actually revokes Academy entitlement", () => {
  // The predicate that gates the Academy already requires suspended_at is null.
  const migration = fs.readFileSync(
    path.join(root, "supabase", "migrations", "202609270001_academy_access_and_exam_write_lockdown.sql"),
    "utf8",
  );
  assert.match(migration, /a\.suspended_at IS NULL/,
    "academy_has_access must deny suspended students");
});
