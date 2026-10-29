#!/usr/bin/env node

/**
 * scripts/check-colors.mjs
 *
 * Verifies that all UI components in src/ use semantic tokens rather than
 * hard-coded hex colors or arbitrary Tailwind color classes.
 *
 * Allow-list:
 *  - src/lib/email/* (email clients require inline safe colors)
 *  - src/styles/tokens.css (token definition source)
 *  - src/app/globals.css (theme mapping)
 *  - src/app/read/* (reading engine theme preferences: light, sepia, dark)
 *  - src/components/catalog/FreePreviewReaderClient.tsx (in-app preview reader)
 *  - src/app/(marketplace)/dev/fonts/* (typography & reading theme test lab)
 *  - Reader theme tokens (defined in reader engine)
 *  - Novel book cover placeholder gradients
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');

// Paths completely excluded from strict color checks (email clients, reader themes, token definitions)
const ALLOWED_PATH_PATTERNS = [
  /[\\/]src[\\/]lib[\\/]email[\\/]/,
  /[\\/]src[\\/]styles[\\/]tokens\.css$/,
  /[\\/]src[\\/]app[\\/]globals\.css$/,
  /[\\/]src[\\/]app[\\/]read[\\/]/,
  /[\\/]src[\\/]components[\\/]catalog[\\/]FreePreviewReaderClient\.tsx$/,
  /[\\/]src[\\/]app[\\/]\(marketplace\)[\\/]dev[\\/]fonts[\\/]/,
];

// Regex for disallowed Tailwind hard-coded color utility classes:
// e.g. bg-slate-50, text-gray-500, border-stone-200, bg-zinc-900, etc.
const DISALLOWED_TW_COLOR_REGEX = /\b(?:bg|text|border|ring|divide|fill|stroke)-(?:slate|gray|zinc|stone|neutral|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g;

// Regex for arbitrary hex color classes in Tailwind: bg-[#...] or text-[#...]
const ARBITRARY_HEX_REGEX = /\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g;

// Allow-list for line content (e.g. reader theme tokens, cover gradients, comments)
function isAllowedLine(line, filePath) {
  // Comments
  if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return true;
  
  // Reader theme allowed tokens (#FBF8F2, #2A2520, #F4ECD8, #3B3226, #141416, #E5E5E5)
  if (line.includes('reader') || line.includes('ReaderTheme') || filePath.includes('read') || filePath.includes('FreePreview')) {
    if (line.includes('#FBF8F2') || line.includes('#2A2520') || line.includes('#F4ECD8') || line.includes('#3B3226') || line.includes('#141416') || line.includes('#E5E5E5') || line.includes('#4A3B2C') || line.includes('#E2D5BA')) {
      return true;
    }
  }

  // Cover placeholder gradient definitions
  if (line.includes('cover') && (line.includes('gradient') || line.includes('from-') || line.includes('to-'))) {
    return true;
  }

  return false;
}

function scanDirectory(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (entry.isFile() && /\.(tsx?|jsx?|css)$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function run() {
  const allFiles = scanDirectory(SRC_DIR);
  const violations = [];

  for (const filePath of allFiles) {
    const normalized = filePath.replace(/\\/g, '/');
    if (ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (isAllowedLine(line, normalized)) return;

      const twMatches = line.match(DISALLOWED_TW_COLOR_REGEX);
      if (twMatches) {
        for (const match of twMatches) {
          violations.push({
            file: path.relative(path.resolve(__dirname, '..'), filePath),
            line: index + 1,
            match,
            type: 'Disallowed Tailwind color class (use semantic tokens: bg-surface, text-text, text-muted, etc.)',
          });
        }
      }

      const hexMatches = line.match(ARBITRARY_HEX_REGEX);
      if (hexMatches) {
        for (const match of hexMatches) {
          violations.push({
            file: path.relative(path.resolve(__dirname, '..'), filePath),
            line: index + 1,
            match,
            type: 'Arbitrary hex color class (use semantic tokens)',
          });
        }
      }
    });
  }

  console.log('\n================================================================================');
  console.log('                 UNB PREMIUM SEMANTIC COLOR AUDIT (CHECK:COLORS)');
  console.log('================================================================================\n');

  if (violations.length > 0) {
    console.error(`❌ Found ${violations.length} non-token color usage(s) across src/:\n`);
    for (const v of violations.slice(0, 50)) {
      console.error(`  ${v.file}:${v.line} -> "${v.match}" [${v.type}]`);
    }
    if (violations.length > 50) {
      console.error(`  ... and ${violations.length - 50} more.`);
    }
    console.error('\nReplace hard-coded colors with semantic design tokens.\n');
    process.exit(1);
  } else {
    console.log('✅ PASS: All scanned files strictly adhere to semantic design tokens.\n');
  }
}

run();
