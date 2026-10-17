"use strict";

// academy-hero.test.js guards the part of the Academy page the quiz work
// touched twice: the opening hero, and the compact quiz banner that now sits
// above it.
//
// The hero is the Academy's own sales pitch and must stay byte-for-byte the
// version that ran before the quiz was introduced. The quiz gets a banner, not
// the hero. These assertions make a future redesign have to say so out loud.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const academy = fs.readFileSync(path.join(root, "assistara-local-v9", "academy.html"), "utf8");

function slice(startMarker, endMarker) {
  const a = academy.indexOf(startMarker);
  assert.ok(a >= 0, "missing marker: " + startMarker);
  const b = academy.indexOf(endMarker, a + startMarker.length);
  assert.ok(b >= 0, "missing end marker: " + endMarker + " after " + startMarker);
  return academy.slice(a, b);
}

test("the Academy page opens with the original hero, not a quiz hook", () => {
  assert.match(academy, /<section class="hero shell">\r?\n<div>\r?\n<div class="eyebrow">ASSISTARA ACADEMY<\/div>/);
  assert.match(academy, /<h1>Learn the skill that gives you<br>\r?\n<span>freedom\.<\/span>/);
  assert.match(academy, /Learn remote work skills businesses already need, build proof that you can deliver, and learn how to find your own clients\./);
  assert.match(academy, /<a class="btn btn-yellow" href="#academy">Explore the Academy/);
  assert.match(academy, /<a class="small-link" href="#why">See what this can unlock/);
});

test("the quiz hero the redesign introduced is gone", () => {
  assert.doesNotMatch(academy, /Discover Your Remote/);
  assert.doesNotMatch(academy, /YOUR REMOTE CAREER STARTS HERE/);
  assert.doesNotMatch(academy, /Explore Assistara Academy/);
  assert.doesNotMatch(academy, /hero-quiz-note/);
  assert.doesNotMatch(academy, /hero-program-note/);
  assert.doesNotMatch(academy, /hero-benefits/);
  assert.doesNotMatch(academy, /academyQuizHero/);
});

test("the quiz banner is the first thing in main, above the hero", () => {
  const main = academy.indexOf("<main>");
  const banner = academy.indexOf('<section class="quiz-banner"');
  const hero = academy.indexOf('<section class="hero shell">');
  assert.ok(main >= 0, "missing <main>");
  assert.ok(banner > main, "banner must be the first block inside main");
  assert.ok(hero > banner, "banner must sit above the hero");
  const beforeHero = academy.slice(main, hero);
  assert.match(beforeHero, /quiz-banner-title/);
  assert.doesNotMatch(beforeHero, /<section class="masterclass"/);
});

test("the banner carries the agreed copy and links to the quiz", () => {
  const banner = slice('<section class="quiz-banner"', "</section>");
  assert.match(banner, /Curious how much you could earn working from home\?/);
  assert.match(banner, /Take our free 4-minute quiz and discover your remote career match\./);
  assert.match(banner, /href="\/academy\/quiz"/);
  assert.match(banner, /Take the Free Quiz/);
  // Copy rule: no em dashes anywhere in the banner.
  assert.doesNotMatch(banner, /\u2014/);
});

test("the banner is Assistara yellow with black text, inherits Manrope, and collapses on mobile", () => {
  const css = slice('<style id="academyQuizBanner">', "</style>");
  assert.match(css, /background:var\(--yellow/);
  assert.match(css, /color:var\(--ink/);
  assert.match(css, /@media\(max-width:760px\)/);
  // Manrope-only rule: the banner must not introduce a font of its own.
  assert.doesNotMatch(css, /font-family/);
  assert.doesNotMatch(css, /\u2014/);
});
