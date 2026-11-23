import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeManuscript,
  derivePatternFromExample,
  splitBySize,
  splitAtMarkers,
  formatPartTitle,
  buildParts,
  normalizeForPreservation,
  HARD_MAX_CHAPTER_CHARACTERS,
} from '../src/lib/text/split-chapters.ts';
import { countUrduWords } from '../src/lib/text/clean-urdu.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readFixture(filename: string): string {
  const filePath = path.join(__dirname, 'fixtures', 'manuscripts', filename);
  return fs.readFileSync(filePath, 'utf-8');
}

describe('Writer-Controlled Chapter Splitter Pure Engine', () => {
  // ---------------------------------------------------------------------------
  // 1. Fixture 1: Header and End-Note Isolation (Real Failure Test)
  // ---------------------------------------------------------------------------
  it('identifies front-matter header and end-note footer so they never become chapters', () => {
    const text = readFixture('one-episode-with-header-footer.txt');
    const analysis = analyzeManuscript(text);

    // Front matter check
    assert.ok(analysis.frontMatter !== null, 'Front matter should be detected');
    assert.match(analysis.frontMatter!.text, /از\s*قلم/);
    assert.match(analysis.frontMatter!.text, /عروبہ\s*خان/);

    // End note check
    assert.ok(analysis.endNote !== null, 'End note should be detected');
    assert.match(analysis.endNote!.text, /اختتام\s*پذیر/);
    assert.match(analysis.endNote!.text, /شکریہ/);

    // Scene breaks check
    assert.ok(analysis.sceneBreaks.length >= 2, 'Should identify *** scene breaks');

    // Heading candidate check: 'باب نمبر پانچ' should be a candidate, while header/footer are NOT
    const headingTexts = analysis.headingCandidates.map((h) => h.text);
    assert.ok(
      headingTexts.some((t) => t.includes('باب نمبر پانچ')),
      'باب نمبر پانچ must be suggested as a heading candidate'
    );
    assert.ok(
      !headingTexts.some((t) => t.includes('از قلم')),
      'Header line must not be suggested as heading candidate'
    );
    assert.ok(
      !headingTexts.some((t) => t.includes('اختتام پذیر')),
      'End note must not be suggested as heading candidate'
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Pattern Derivation from Example Line
  // ---------------------------------------------------------------------------
  it('derives exact heading pattern from example line clicked by writer without regex injection', () => {
    const text = readFixture('several-chapters-headings.txt');
    const analysis = analyzeManuscript(text);

    // Writer clicks "باب ۱"
    const patternResult = derivePatternFromExample('باب ۱', analysis.allLines);

    assert.ok(patternResult.patternDescription.includes('باب'));
    // Should match exactly 3 lines: "باب ۱", "باب ۲", "باب ۳"
    assert.strictEqual(patternResult.matchingLineNumbers.length, 3);

    // Test with qist headings
    const qistText = readFixture('qist-headings-only.txt');
    const qistAnalysis = analyzeManuscript(qistText);
    const qistPattern = derivePatternFromExample('قسط ۱', qistAnalysis.allLines);
    assert.strictEqual(qistPattern.matchingLineNumbers.length, 3);

    // Safe handling: injection attempt with regex symbols
    const maliciousExample = 'باب [0-9]+ (.*)?';
    const safeResult = derivePatternFromExample(maliciousExample, analysis.allLines);
    assert.doesNotThrow(() => {
      // Must not throw syntax error or execute regex injection
      assert.ok(Array.isArray(safeResult.matchingLineNumbers));
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Lossless Text Preservation Invariant
  // ---------------------------------------------------------------------------
  it('guarantees 100% exact text preservation (reconstruction check)', () => {
    const text = readFixture('one-episode-with-header-footer.txt');
    const analysis = analyzeManuscript(text);

    // Verify detected front-matter and end-note
    const fm = analysis.frontMatter?.text || '';
    const en = analysis.endNote?.text || '';
    assert.ok(fm.length > 0, 'Front matter should be non-empty');
    assert.ok(en.length > 0, 'End note should be non-empty');

    // Split remaining middle text by scene breaks
    const rawParts = splitBySize(text, { targetWords: 100, minWords: 20 });

    const result = buildParts({
      rawParts: rawParts.map((content) => ({ content })),
      baseTitle: 'تلاشِ سحر',
      originalText: text,
      frontMatterRemoved: '', // When not removed, parts contain it
      endNoteRemoved: '',
    });

    assert.ok(result.textPreserved, 'Reconstructed text must match original after whitespace normalization');
    assert.strictEqual(result.parts.length >= 2, true);
  });

  // ---------------------------------------------------------------------------
  // 4. Quranic Text and Orthography Preservation
  // ---------------------------------------------------------------------------
  it('strictly preserves Arabic Quranic tashkeel and Urdu digits without alteration', () => {
    const quranic = readFixture('quranic-with-tashkeel.txt');
    const parts = splitBySize(quranic, { targetWords: 500, minWords: 10 });

    assert.strictEqual(parts.length, 1);
    const resultPart = parts[0];

    // Verify all tashkeel marks remain completely intact
    assert.ok(resultPart.includes('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'));
    assert.ok(resultPart.includes('قُلْ هُوَ اللَّهُ أَحَدٌ ﴿۱﴾'));
    assert.ok(resultPart.includes('اللَّهُ الصَّمَدُ ﴿۲﴾'));
    // Verify Urdu digits ۱, ۲, ۳, ۴ remain unchanged
    assert.ok(resultPart.includes('۱') && resultPart.includes('۴'));

    // Reconstruct and verify preservation
    const buildResult = buildParts({
      rawParts: [{ content: resultPart }],
      baseTitle: 'سورۃ الاخلاص',
      originalText: quranic,
    });
    assert.ok(buildResult.textPreserved);
  });

  // ---------------------------------------------------------------------------
  // 5. Handling 220k+ Characters and 120k Hard Limit Guard
  // ---------------------------------------------------------------------------
  it('splits 220k+ character massive manuscript so NO part exceeds 120,000 chars', () => {
    const hugeText = readFixture('huge-mixed-220k-block.txt');
    assert.ok(hugeText.length > 220000, 'Fixture must exceed 220,000 characters');

    // Split with target 6,000 words
    const parts = splitBySize(hugeText, { targetWords: 6000, hardMaxChars: HARD_MAX_CHAPTER_CHARACTERS });

    assert.ok(parts.length >= 4, `Expected at least 4 parts for 220k chars, got ${parts.length}`);

    // Verify hard limit strictly honored for every part
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      assert.ok(
        part.length <= HARD_MAX_CHAPTER_CHARACTERS,
        `Part #${i + 1} exceeds 120,000 characters: ${part.length}`
      );
      const wCount = countUrduWords(part);
      assert.ok(wCount >= 300, `Part #${i + 1} is under 300 words: ${wCount}`);
    }

    // Verify text preservation holds across all parts
    const normOrig = normalizeForPreservation(hugeText);
    const normParts = normalizeForPreservation(parts.join('\n\n'));
    assert.strictEqual(normOrig.length, normParts.length);
    assert.strictEqual(normOrig, normParts);
  });

  // ---------------------------------------------------------------------------
  // 6. 45,000-Word Episode Splitting Yields 6-9 Parts
  // ---------------------------------------------------------------------------
  it('splits a ~45,000-word episode with target 6,000 words into 6-9 parts', () => {
    // Generate synthetic 45,000-word text from repetitive paragraphs
    const seed = 'شام کے سائے پھیل رہے تھے اور دریا کا بہاؤ تیز ہو رہا تھا۔ مسافروں نے کنارے پر خیمے نصب کر لیے تاکہ رات گزاری جا سکے۔ پرانے زمانوں میں اس راستے پر قافلے چلا کرتے تھے جن کی کہانیاں آج بھی دادی اماں بچوں کو سناتی ہیں۔ ہر رات ستاروں کی روشنی میں نئی امید کا دیا جلتا ہے۔ ';
    const seedWords = countUrduWords(seed);
    const repeatCount = Math.ceil(45000 / seedWords);
    const text45k = Array(repeatCount).fill(seed).join('\n\n');

    const totalWords = countUrduWords(text45k);
    assert.ok(totalWords >= 44000 && totalWords <= 47000);

    const parts = splitBySize(text45k, { targetWords: 6000, minWords: 300 });

    assert.ok(
      parts.length >= 6 && parts.length <= 9,
      `45,000 words with 6,000 target must yield 6-9 parts, got ${parts.length}`
    );

    // Verify average size is around 5,000 - 8,000 words
    for (const part of parts) {
      const w = countUrduWords(part);
      assert.ok(w >= 300 && w <= 8500, `Part size ${w} out of expected bounds`);
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Manual Splitting at Selected Markers
  // ---------------------------------------------------------------------------
  it('splits at manual line markers chosen by writer with high fidelity', () => {
    const text = 'لائن ایک\nلائن دو\nلائن تین\nلائن چار\nلائن پانچ';
    // Split at line 3 and line 5
    const parts = splitAtMarkers(text, [3, 5]);

    assert.strictEqual(parts.length, 3);
    assert.strictEqual(parts[0], 'لائن ایک\nلائن دو');
    assert.strictEqual(parts[1], 'لائن تین\nلائن چار');
    assert.strictEqual(parts[2], 'لائن پانچ');
  });

  // ---------------------------------------------------------------------------
  // 8. Continuous Text Without Blank Lines
  // ---------------------------------------------------------------------------
  it('handles continuous text without blank lines by splitting at sentence endings (۔ ؟ !)', () => {
    const continuous = readFixture('no-blank-lines.txt');
    // Target very small to force sentence-level chunking
    const parts = splitBySize(continuous, { targetWords: 35, minWords: 15 });

    assert.ok(parts.length >= 2, 'Should split continuous text into multiple sentences');
    for (const p of parts) {
      assert.ok(p.trim().length > 0);
    }

    // Verify preservation
    const normOrig = normalizeForPreservation(continuous);
    const normParts = normalizeForPreservation(parts.join(' '));
    assert.strictEqual(normOrig, normParts);
  });

  // ---------------------------------------------------------------------------
  // 9. Urdu Novel Title in Auto-Generated Chapter Titles & Part Numbering
  // ---------------------------------------------------------------------------
  it('formats auto-generated chapter titles with novel Urdu title and correct part numbering', () => {
    // 1. Base Urdu title with firstNumber = 1
    assert.strictEqual(
      formatPartTitle(0, 'آئینہ ذات', 'urdu', 1),
      'آئینہ ذات - حصہ ۱'
    );

    // 2. Base Urdu title with offset startChapterNumber = 7
    assert.strictEqual(
      formatPartTitle(0, 'آئینہ ذات', 'urdu', 7),
      'آئینہ ذات - حصہ ۷'
    );
    assert.strictEqual(
      formatPartTitle(1, 'آئینہ ذات', 'urdu', 7),
      'آئینہ ذات - حصہ ۸'
    );

    // 3. Empty or whitespace-only base title falls back to bare suffix
    assert.strictEqual(formatPartTitle(0, '', 'urdu', 1), 'حصہ ۱');
    assert.strictEqual(formatPartTitle(0, '   ', 'urdu', 1), 'حصہ ۱');
    assert.strictEqual(formatPartTitle(2, '', 'urdu', 5), 'حصہ ۷');

    // 4. Base 'باب' case
    assert.strictEqual(formatPartTitle(0, 'باب', 'urdu', 7), 'باب - حصہ ۷');

    // 5. Existing suffix cleaning (hyphen, en-dash, em-dash) without duplication
    assert.strictEqual(
      formatPartTitle(0, 'آئینہ ذات — حصہ ۳', 'urdu', 1),
      'آئینہ ذات - حصہ ۱'
    );
    assert.strictEqual(
      formatPartTitle(0, 'آئینہ ذات - حصہ ۳', 'urdu', 1),
      'آئینہ ذات - حصہ ۱'
    );
    assert.strictEqual(
      formatPartTitle(0, 'آئینہ ذات – حصہ ۵', 'urdu', 1),
      'آئینہ ذات - حصہ ۱'
    );
    assert.strictEqual(
      formatPartTitle(1, 'آئینہ ذات - حصہ ۳', 'urdu', 7),
      'آئینہ ذات - حصہ ۸'
    );

    // 6. English style
    assert.strictEqual(
      formatPartTitle(0, 'Mirror of Self', 'english', 1),
      'Mirror of Self - (Part 1)'
    );
    assert.strictEqual(
      formatPartTitle(0, 'Mirror of Self', 'english', 7),
      'Mirror of Self - (Part 7)'
    );
    assert.strictEqual(formatPartTitle(0, '', 'english', 1), '(Part 1)');
  });

  it('aligns buildParts part numbers with title numbering and preserves detected headings', () => {
    const rawParts = [
      { content: 'یہ پہلے باب کا متن ہے جو تفصیل سے لکھا گیا ہے۔' },
      { content: 'یہ دوسرے باب کا متن ہے جس میں کہانی آگے بڑھتی ہے۔', title: 'خاص منظر' },
      { content: 'یہ تیسرے باب کا متن ہے جو اختتام کی طرف جاتا ہے۔' },
    ];
    const originalText = rawParts.map((p) => p.content).join('\n\n');

    const result = buildParts({
      rawParts,
      baseTitle: 'آئینہ ذات',
      titleStyle: 'urdu',
      startChapterNumber: 7,
      originalText,
      frontMatterRemoved: '',
      endNoteRemoved: '',
    });

    assert.strictEqual(result.parts.length, 3);

    // Part 0: number is 7, title is auto-generated with حصہ ۷
    assert.strictEqual(result.parts[0].number, 7);
    assert.strictEqual(result.parts[0].title, 'آئینہ ذات - حصہ ۷');

    // Part 1: number is 8, but has explicit/detected title 'خاص منظر' which must be preserved
    assert.strictEqual(result.parts[1].number, 8);
    assert.strictEqual(result.parts[1].title, 'خاص منظر');

    // Part 2: number is 9, title is auto-generated with حصہ ۹
    assert.strictEqual(result.parts[2].number, 9);
    assert.strictEqual(result.parts[2].title, 'آئینہ ذات - حصہ ۹');

    // Text preservation must hold 100%
    assert.ok(result.textPreserved, 'Reconstructed text must match original');
  });
});
