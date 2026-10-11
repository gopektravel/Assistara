const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const chatClient = read("assistara-local-v9/assistara-chat-client.js");

test("user_left case is removed from handleServerMessage", () => {
  assert.doesNotMatch(chatClient, /case\s*"user_left"/);
  assert.doesNotMatch(chatClient, /Someone left/);
});

test("user_joined case still shows join notification with name", () => {
  assert.match(chatClient, /case\s*"user_joined"/);
  assert.match(chatClient, /`\$\{msg\.name\} joined`/);
});

test("isLeaveNotification helper exists and matches leave patterns", () => {
  assert.match(chatClient, /isLeaveNotification\(content\)/);
  assert.match(chatClient, /endsWith\(" left"\)/);
  assert.match(chatClient, /endsWith\(" disconnected"\)/);
});

test("addMessage filters out leave notifications", () => {
  const addMsgMatch = chatClient.match(/addMessage\(message\)\s*\{[^}]*isLeaveNotification/s);
  assert.ok(addMsgMatch, "addMessage should filter leave notifications");
});

test("welcome handler filters leave notifications from history", () => {
  const welcomeMatch = chatClient.match(/case\s*"welcome"[^]*?filter\(/);
  assert.ok(welcomeMatch, "welcome handler should filter messages");
});

test("history handler filters leave notifications from history", () => {
  const historyMatch = chatClient.match(/case\s*"history"[^]*?filter\(/);
  assert.ok(historyMatch, "history handler should filter messages");
});

test("hasAnnouncedJoin flag prevents duplicate join on reconnect", () => {
  assert.match(chatClient, /hasAnnouncedJoin\s*=\s*false/);
  assert.match(chatClient, /if\s*\(\s*!this\.hasAnnouncedJoin\s*\)\s*\{/);
  assert.match(chatClient, /hasAnnouncedJoin\s*=\s*true/);
});

test("handleNameSubmit sets hasAnnouncedJoin after sending join", () => {
  const nameSubmitMatch = chatClient.match(/handleNameSubmit[\s\S]*?hasAnnouncedJoin\s*=\s*true/);
  assert.ok(nameSubmitMatch, "handleNameSubmit should set hasAnnouncedJoin");
});
