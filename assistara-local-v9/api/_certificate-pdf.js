"use strict";

// Dependency-free, server-side PDF builder for the Assistara Academy
// Certificate of Completion. Callers must already have verified graduation:
// this module only renders bytes. The layout is a single US Letter page with
// the Assistara wordmark, a double rule, a certificate paragraph and a date.
// Only the built-in Helvetica fonts are used (no embedding), and any character
// outside plain ASCII is dropped so the file is always renderable.

const PAGE_W = 612;
const PAGE_H = 792;

// Helvetica width table (per 1000 units) for the ASCII printable range, from
// the standard AFM metrics; used to centre lines of text.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

function charWidth(ch) {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return WIDTHS[code - 32];
  return 556; // fallback for any non-ASCII should never happen (sanitised out)
}

function textWidth(text, size) {
  let units = 0;
  for (const ch of text) units += charWidth(ch);
  return (units / 1000) * size;
}

function sanitiseAscii(value) {
  // Strip all non-ASCII, collapse whitespace runs, and trim. Keeps the PDF
  // renderable with the built-in font and blocks control characters.
  return String(value || "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value) {
  return sanitiseAscii(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// Every line is centred by measuring the text; `isBold` picks the matching
// built-in font resource. Coordinates are PDF space (origin bottom-left).
function layout(learnerName, courseTitle, grantDate) {
  const ops = [];
  const line = (text, y, size, bold, color) => {
    const safe = sanitiseAscii(text);
    if (!safe) return;
    const x = Math.round((PAGE_W - textWidth(safe, size)) / 2);
    const font = bold ? "/F2" : "/F1";
    ops.push(`BT ${font} ${size} Tf ${color} 0 RG ${x} ${y} Td (${escapePdfText(safe)}) Tj ET`);
  };

  // Background panel and double rule.
  ops.push("0.96 0.95 0.91 rg");
  ops.push("36 36 540 720 re f");
  ops.push("1 1 1 rg");
  ops.push("42 42 528 708 re f");
  ops.push("0.85 0.82 0.75 RG 1 w");
  ops.push("46 48 520 1 re s");
  ops.push("46 743 520 1 re s");
  ops.push("48 50 516 692 re S");

  // Wordmark.
  line("ASSISTARA", 690, 16, true, "0.17 0.17 0.17");
  line("A C A D E M Y", 668, 10, false, "0.42 0.39 0.33");

  // Top rule under the wordmark.
  ops.push("0.85 0.82 0.75 RG 0.8 w");
  ops.push("200 640 212 1 re s");

  // Title block.
  line("Certificate of Completion", 596, 30, true, "0.13 0.13 0.13");
  line("This certifies that", 540, 13, false, "0.30 0.28 0.24");

  // Learner name (large, gold-brown).
  line(learnerName, 496, 28, true, "0.62 0.47 0.16");

  // Body paragraph.
  line("has successfully completed the", 442, 13, false, "0.30 0.28 0.24");
  line(courseTitle, 408, 18, true, "0.17 0.17 0.17");
  line("demonstrating competency in remote administration, client operations", 372, 12, false, "0.30 0.28 0.24");
  line("and business support systems taught at Assistara Academy.", 354, 12, false, "0.30 0.28 0.24");

  // Small rule above the date.
  ops.push("0.85 0.82 0.75 RG 0.8 w");
  ops.push("230 300 152 1 re s");

  // Date line.
  line("Awarded " + grantDate, 268, 12, false, "0.42 0.39 0.33");

  // Footer.
  line("Assistara Academy - assistara.com", 92, 9, false, "0.55 0.52 0.46");
  line("This certificate confirms completion of the Assistara Academy virtual assistant program.", 76, 8, false, "0.60 0.57 0.51");

  return ops.join("\n") + "\n";
}

function buildCertificatePdf({ learnerName, courseTitle, grantDate }) {
  const name = sanitiseAscii(learnerName) || "Assistara Academy Graduate";
  const title = sanitiseAscii(courseTitle) || "Virtual Assistant Program";
  const date = sanitiseAscii(grantDate) || new Date().toISOString().slice(0, 10);

  const content = layout(name, title, date);

  const objects = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
    + "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  objects.push("<< /Length " + Buffer.byteLength(content, "ascii") + " >>\nstream\n" + content + "endstream");

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;

  const trailerSize = objects.length + 1;
  pdf += `trailer\n<< /Size ${trailerSize} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, "ascii");
}

module.exports = { buildCertificatePdf, sanitiseAscii };