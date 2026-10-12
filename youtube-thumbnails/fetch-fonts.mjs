// Downloads Manrope woff2 files from Google Fonts for local, self-contained rendering.
import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";

const OUT = new URL("./assets/fonts/", import.meta.url);
await mkdir(OUT, { recursive: true });

const css = await (await fetch(
  "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap",
  { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" } }
)).text();

// Parse unicode-range latin subsets only (we render plain latin text).
const blocks = css.split("@font-face").slice(1);
const seen = new Set();
for (const b of blocks) {
  const weight = /font-weight:\s*(\d+)/.exec(b)?.[1];
  const url = /url\((https:[^)]+\.woff2)\)/.exec(b)?.[1];
  const range = /unicode-range:\s*([^;]+);/.exec(b)?.[1] ?? "";
  if (!weight || !url) continue;
  // Keep the "latin" subset (U+0000-00FF...), skip latin-ext and others.
  if (!range.includes("U+0000-00FF")) continue;
  const name = `manrope-${weight}.woff2`;
  if (seen.has(name)) continue;
  seen.add(name);
  const data = await (await fetch(url)).arrayBuffer();
  await writeFile(new URL(name, OUT), Buffer.from(data));
  console.log("saved", name, data.byteLength, "bytes");
}
console.log("done", seen.size, "files");
