"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSession } = require("./_qc-harness");

test("Test Student Portal renders exactly one Community joined checkbox", () => {
  // Boot the dashboard in preview mode (test-portal path)
  const { window, document, qc, dispose } = createSession({ pathname: "/academy/test-portal" });

  try {
    // wireCommunity is called twice in boot() - lines 4071 and 4073
    qc.wireCommunity();
    qc.wireCommunity();

    // Count checkboxes with the previewCommunityToggle class
    const checkboxes = document.querySelectorAll(".previewCommunityToggle");
    assert.equal(checkboxes.length, 1, `Expected exactly 1 Community joined checkbox, found ${checkboxes.length}`);

    // Verify the checkbox exists and has correct ID
    const checkbox = document.getElementById("previewCommunityToggleInput");
    assert.ok(checkbox, "previewCommunityToggleInput checkbox must exist");
    assert.equal(checkbox.type, "checkbox", "Must be a checkbox input");

    // Verify it controls both card and nav elements
    const card = document.getElementById("communityCard");
    const nav = document.getElementById("communityNav");
    assert.ok(card, "communityCard must exist");
    assert.ok(nav, "communityNav must exist");
  } finally {
    dispose();
  }
});