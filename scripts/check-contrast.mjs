#!/usr/bin/env node

/**
 * scripts/check-contrast.mjs
 *
 * Verifies WCAG AA contrast compliance across all three light palette presets:
 *   - Palette A: Ivory & Ink (Default)
 *   - Palette B: Paper & Teal
 *   - Palette C: Cream & Maroon
 *
 * Checks mandatory pairings against WCAG AA standards:
 *   - Normal text: >= 4.5:1
 *   - Large text / UI components: >= 3.0:1
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKENS_PATH = path.resolve(__dirname, '../src/styles/tokens.css');

/**
 * Calculate relative luminance according to WCAG 2.1 specs
 */
function getRelativeLuminance(hex) {
  const sanitized = hex.trim().replace(/^#/, '');
  const r = parseInt(sanitized.slice(0, 2), 16) / 255;
  const g = parseInt(sanitized.slice(2, 4), 16) / 255;
  const b = parseInt(sanitized.slice(4, 6), 16) / 255;

  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calculate contrast ratio between two hex colors (X:1)
 */
function getContrastRatio(hex1, hex2) {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const brighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (brighter + 0.05) / (darker + 0.05);
}

/**
 * Extract CSS custom properties from a CSS rule block
 */
function extractTokensFromBlock(cssContent, selectorRegex) {
  const match = cssContent.match(selectorRegex);
  if (!match) return {};
  const block = match[1];
  const tokens = {};
  const varRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = varRegex.exec(block)) !== null) {
    const name = m[1].trim();
    const value = m[2].trim().split('/*')[0].trim();
    if (value.startsWith('#')) {
      tokens[name] = value;
    }
  }
  return tokens;
}

function run() {
  if (!fs.existsSync(TOKENS_PATH)) {
    console.error(`❌ tokens.css not found at: ${TOKENS_PATH}`);
    process.exit(1);
  }

  const css = fs.readFileSync(TOKENS_PATH, 'utf8');

  // Extract variables for each palette block
  const paletteABlock = css.match(/(?::root[\s\S]*?)(?=html\[data-palette="B"\])/);
  const paletteBBlock = css.match(/html\[data-palette="B"\]\s*\{([\s\S]*?)\}/);
  const paletteCBlock = css.match(/html\[data-palette="C"\]\s*\{([\s\S]*?)\}/);

  const tokensA = extractTokensFromBlock(paletteABlock ? paletteABlock[0] : '', /\{([\s\S]*?)\}/);
  const tokensB = extractTokensFromBlock(paletteBBlock ? paletteBBlock[0] : '', /\{([\s\S]*?)\}/);
  const tokensC = extractTokensFromBlock(paletteCBlock ? paletteCBlock[0] : '', /\{([\s\S]*?)\}/);

  const palettes = [
    { id: 'A', name: 'Ivory & Ink (Default)', tokens: tokensA },
    { id: 'B', name: 'Paper & Teal', tokens: tokensB },
    { id: 'C', name: 'Cream & Maroon', tokens: tokensC },
  ];

  const checks = [
    {
      name: 'text on bg',
      fgToken: '--color-text',
      bgToken: '--color-bg',
      min: 4.5,
    },
    {
      name: 'text on surface',
      fgToken: '--color-text',
      bgToken: '--color-surface',
      min: 4.5,
    },
    {
      name: 'text-muted on bg',
      fgToken: '--color-text-muted',
      bgToken: '--color-bg',
      min: 4.5,
    },
    {
      name: 'primary-contrast on primary',
      fgToken: '--color-primary-contrast',
      bgToken: '--color-primary',
      min: 4.5,
    },
    {
      name: 'accent-strong on bg',
      fgToken: '--color-accent-strong',
      bgToken: '--color-bg',
      min: 4.5,
    },
    {
      name: 'accent-strong on surface',
      fgToken: '--color-accent-strong',
      bgToken: '--color-surface',
      min: 4.5,
    },
    {
      name: 'status success strong on soft tint',
      fgToken: '--color-success-text',
      bgToken: '--color-success-soft',
      min: 4.5,
    },
    {
      name: 'status warning strong on soft tint',
      fgToken: '--color-warning-text',
      bgToken: '--color-warning-soft',
      min: 4.5,
    },
    {
      name: 'status danger strong on soft tint',
      fgToken: '--color-danger-text',
      bgToken: '--color-danger-soft',
      min: 4.5,
    },
    {
      name: 'status info strong on soft tint',
      fgToken: '--color-info-text',
      bgToken: '--color-info-soft',
      min: 4.5,
    },
    {
      name: 'link (accent-strong) on surface',
      fgToken: '--color-accent-strong',
      bgToken: '--color-surface',
      min: 4.5,
    },
    {
      name: 'placeholder (text-muted) on input (surface)',
      fgToken: '--color-text-muted',
      bgToken: '--color-surface',
      min: 4.5,
    },
  ];

  let hasFailure = false;
  console.log('\n================================================================================');
  console.log('                 UNB PREMIUM COLOR CONTRAST VERIFICATION (WCAG AA)');
  console.log('================================================================================\n');

  for (const palette of palettes) {
    console.log(`\n🎨 Palette ${palette.id}: "${palette.name}"`);
    console.log('--------------------------------------------------------------------------------');
    console.log(
      'Pairing Description'.padEnd(42) +
      'Foreground'.padEnd(12) +
      'Background'.padEnd(12) +
      'Ratio'.padEnd(10) +
      'Status'
    );
    console.log('--------------------------------------------------------------------------------');

    for (const check of checks) {
      const fg = palette.tokens[check.fgToken];
      const bg = palette.tokens[check.bgToken];

      if (!fg || !bg) {
        console.error(
          `❌ Missing token: ${check.fgToken} (${fg}) or ${check.bgToken} (${bg})`
        );
        hasFailure = true;
        continue;
      }

      const ratio = getContrastRatio(fg, bg);
      const passed = ratio >= check.min;
      const statusStr = passed ? '✅ PASS' : `❌ FAIL (< ${check.min}:1)`;

      if (!passed) hasFailure = true;

      console.log(
        check.name.padEnd(42) +
        fg.padEnd(12) +
        bg.padEnd(12) +
        `${ratio.toFixed(2)}:1`.padEnd(10) +
        statusStr
      );
    }
  }

  console.log('\n================================================================================');
  if (hasFailure) {
    console.error('❌ FAILED: One or more color pairings failed to meet WCAG AA standards.\n');
    process.exit(1);
  } else {
    console.log('✅ ALL PALETTES PASSED: All tested token pairings meet or exceed WCAG AA.\n');
  }
}

run();

