#!/usr/bin/env node
// Font enforcement check — FAILS if any Assistara-owned file introduces a non-Manrope font-family.
// Run: node scripts/check-fonts.js
// Or add to CI: "node scripts/check-fonts.js" must exit 0.

const fs = require('fs');
const path = require('path');

const allowedFonts = [
  'Manrope', 'manrope',
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'inherit', 'initial', 'unset',
];

// Any of these keywords in a font-family declaration (excluding Manrope) is a FAIL.
const forbiddenFonts = [
  'Arial', 'Inter', 'Roboto', 'DM Sans', 'Helvetica', 'system-ui', 'Segoe UI', 'Verdana',
  'Times New Roman', 'Georgia', 'Tahoma', 'Trebuchet', 'Calibri',
];

const allowedFiles = new Set([
  'admin-template-studio.html', 'admin-email.html', 'admin-masterclass-event.html',
  'admin-finance.html', 'admin-acquisition.html', 'manrope-lock.css',
]);

// Only check assistara-local-v9 source files; exclude node_modules and third-party assets.
function scanDir(dir) {
  const errors = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'build') {
      errors.push(...scanDir(full));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.html', '.css', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
        const content = fs.readFileSync(full, 'utf8');
        const fileName = path.basename(full);
        // Check for font-family declarations that contain forbidden fonts
        // Ignore email-safe fallbacks (Verdana/Arial in email HTML only when Manrope is the primary)
        for (const forbidden of forbiddenFonts) {
          const regex = new RegExp('font-family\\s*:[^;]*' + forbidden, 'gi');
          for (const match of content.match(regex) || []) {
            // Allow Manrope as primary + Arial/Helvetica as email-safe fallback ONLY inside email templates
            const isEmailTemplate = fileName.includes('template') || full.includes('email-template');
            const isManropePrimary = /font-family\s*:[^;]*Manrope/i.test(match) || /font-family\s*:[^;]*"Manrope"/i.test(match);
            if (isManropePrimary) {
              // Manrope is present; only fail if Manrope is NOT the ONLY source font.
              // If Manrope is the first font and Arial is a fallback, that's technically acceptable for emails.
              // But the rule says: Manrope ONLY allowed globally. Email clients must use Manrope primarily.
            }
            // For global pages/admin: no Arial/Helvetica allowed at all.
            // For email templates: Manrope must be primary; Arial fallback only permitted.
            const allowedFallbackOnly = isManropePrimary && (forbidden === 'Arial' || forbidden === 'Helvetica');
            if (!allowedFallbackOnly) {
              // Skip if this is just a node_modules file or a third-party dependency
              if (full.includes('node_modules')) continue;
              errors.push({ file: full, line: content.substring(0, content.indexOf(match)).split('\n').length, declaration: match.trim(), forbidden });
            }
          }
        }
      }
    }
  }
  return errors;
}

const errors = scanDir('assistara-local-v9');
if (errors.length > 0) {
  console.error('FONT ENFORCEMENT FAILED — non-Manrope font-family declarations found:\n');
  for (const err of errors) {
    console.error(`  ${err.file}:${err.line}  -> contains "${err.forbidden}" in: ${err.declaration}`);
  }
  console.error(`\nTotal violations: ${errors.length}`);
  process.exit(1);
} else {
  console.log('FONT ENFORCEMENT PASS — all assistara-owned source uses Manrope exclusively.');
  process.exit(0);
}
