"use strict";

// Generates supabase/functions/_shared/manrope-fonts.ts from the Manrope
// TTF files that ship in assistara-local-v9/masterclass-assets/. The payment
// receipt PDF embeds these weights (400 / 600 / 800) so the document renders
// with Manrope everywhere, including the peso sign (U+20B1).
//
// Run from the repo root:  node scripts/generate-receipt-fonts.mjs
//
// Editing the TTF files requires re-running this generator; the output file
// is generated and should not be edited by hand.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "..");
const FONT_DIR = path.join(ROOT, "assistara-local-v9", "masterclass-assets");
const OUT = path.join(ROOT, "supabase", "functions", "_shared", "manrope-fonts.ts");

const WEIGHTS = [
  { exportName: "MANROPE_REGULAR_B64", file: "Manrope-Regular.ttf", weight: 400 },
  { exportName: "MANROPE_SEMIBOLD_B64", file: "Manrope-SemiBold.ttf", weight: 600 },
  { exportName: "MANROPE_EXTRABOLD_B64", file: "Manrope-ExtraBold.ttf", weight: 800 },
];

const parts = [
  "// GENERATED FILE - do not edit by hand.",
  "// Produced by scripts/generate-receipt-fonts.mjs from the Manrope TTFs in",
  "// assistara-local-v9/masterclass-assets/ (Manrope, SIL Open Font License 1.1).",
  "// Each constant is the base64 of one weight, embedded into the payment",
  "// receipt PDF so the typeface (and the peso sign) renders identically in",
  "// every Supabase Edge Runtime instance without a network fetch.",
  "",
];

for (const { exportName, file, weight } of WEIGHTS) {
  const bytes = fs.readFileSync(path.join(FONT_DIR, file));
  if (bytes.length < 50000 || bytes.length > 500000) {
    throw new Error(`${file} looks wrong: ${bytes.length} bytes`);
  }
  parts.push(`// ${file} (${weight}) - ${bytes.length} bytes`);
  parts.push(`export const ${exportName} = "${bytes.toString("base64")}";`);
  parts.push("");
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, parts.join("\n"), "utf8");
console.log(`wrote ${path.relative(ROOT, OUT)} (${fs.statSync(OUT).size} bytes)`);
