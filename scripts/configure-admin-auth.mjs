import { pbkdf2Sync, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_REF = "jhmmwleejgidrxavzdlq";
const ITERATIONS = 310_000;

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("Run this command in an interactive terminal.");
  process.exit(1);
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (char) => {
      if (char === "\u0003") {
        process.stdin.setRawMode(false);
        reject(new Error("Cancelled"));
        return;
      }
      if (char === "\r" || char === "\n") return finish();
      if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };
    process.stdin.on("data", onData);
  });
}

let password = await readHidden("Choose the admin password: ");
let confirmation = await readHidden("Confirm the admin password: ");

if (password !== confirmation) {
  console.error("Passwords do not match.");
  process.exit(1);
}
if (password.length < 14) {
  console.error("Use at least 14 characters.");
  process.exit(1);
}

const salt = randomBytes(32).toString("hex");
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256").toString("hex");
const tokenVersion = randomBytes(32).toString("hex");
password = "";
confirmation = "";

const tempDir = join(process.env.LOCALAPPDATA || process.cwd(), "Temp", "opencode");
mkdirSync(tempDir, { recursive: true });
const envPath = join(tempDir, `assistara-admin-auth-${process.pid}.env`);
writeFileSync(
  envPath,
  [
    "ADMIN_USERNAME=admin",
    `ADMIN_PASSWORD_SALT=${salt}`,
    `ADMIN_PASSWORD_HASH=${hash}`,
    `ADMIN_TOKEN_VERSION=${tokenVersion}`,
    "",
  ].join("\n"),
  { encoding: "utf8", mode: 0o600 },
);

try {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    command,
    ["supabase", "secrets", "set", "--env-file", envPath, "--project-ref", PROJECT_REF],
    { stdio: "inherit", shell: false },
  );
  if (result.status !== 0) process.exit(result.status || 1);
  console.log("Admin authentication secrets updated. Existing admin sessions are revoked.");
} finally {
  rmSync(envPath, { force: true });
}
