import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Forbidden begging words that violate the "appreciation, never begging" rule
const FORBIDDEN_WORDS = [
  /\bdonate\b/i,
  /\bdonation\b/i,
  /\bdonations\b/i,
  /\bdonating\b/i,
  /\bplease\s+help\b/i,
  /\bhelp\s+me\b/i,
  /\bcharity\b/i,
  /\bfundraiser\b/i,
  /\bbeg\b/i,
  /\bbegging\b/i,
  /\bامدادی\b/u,
  /\bبھیک\b/u,
  /\bچندہ\b/u,
  /\bخیرات\b/u,
];

test('Tip Jar Copy Lint — Prohibits Begging and Donation Terminology', async (t) => {
  const copyFilePath = path.join(process.cwd(), 'src/lib/copy/tips.ts');
  const copyContent = fs.readFileSync(copyFilePath, 'utf8');

  await t.test('src/lib/copy/tips.ts contains zero forbidden begging words', () => {
    // Strip explanatory comments from copy file before testing
    const codeOnly = copyContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    for (const pattern of FORBIDDEN_WORDS) {
      const match = codeOnly.match(pattern);
      assert.equal(
        match,
        null,
        `Forbidden word detected in src/lib/copy/tips.ts: "${match?.[0]}". Tips must feel like appreciation, never begging.`
      );
    }
  });

  await t.test('Includes mandatory honest disclosure line', () => {
    assert.match(
      copyContent,
      /Optional\. The whole amount goes directly to the author; UNB Premium takes no share\./,
      'Mandatory English disclosure line missing from tips copy'
    );
    assert.match(
      copyContent,
      /اختیاری ہے۔ پوری رقم براہِ راست مصنف کو جاتی ہے؛ یو این بی پریمیم کوئی حصہ نہیں لیتا۔/,
      'Mandatory Urdu disclosure line missing from tips copy'
    );
  });

  await t.test('Includes Chai, Mithai, Eidi preset names', () => {
    assert.match(copyContent, /Chai/);
    assert.match(copyContent, /Mithai/);
    assert.match(copyContent, /Eidi/);
  });
});
