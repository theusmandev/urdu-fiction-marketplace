import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanUrduText,
  countUrduWords,
  toUrduDigits,
  normalizeArabicLetterForms,
  hasArabicLetterForms,
  isSceneBreakLine,
  joinBrokenLines,
  countLinesAndParagraphs,
} from '../src/lib/text/clean-urdu.ts';

describe('Urdu Text Cleaner & Normalizer — Safe Default vs Opt-in', () => {
  test('normalizes Unicode NFC', () => {
    const decomposed = 'ا\u0653'; // Alef + Maddah combining
    const cleaned = cleanUrduText(decomposed);
    assert.equal(cleaned, 'آ'); // Precomposed
  });

  test('removes bidi and zero-width control characters while strictly preserving ZWNJ & ZWJ', () => {
    // \u200E (LRM), \u200F (RLM), \uFEFF (BOM), \u200B (Zero-width space)
    // \u200C (ZWNJ) and \u200D (ZWJ) must be preserved for Urdu shaping
    const dirty = '\uFEFF\u200Eاردو\u200F \u200Bزبان\u200Cدانی\u200D';
    const cleaned = cleanUrduText(dirty);
    assert.equal(cleaned, 'اردو زبان\u200Cدانی\u200D');
  });

  test('preserves Quranic ayahs with full tashkeel, Arabic letter orthography, and Arabic-Indic verse digits', () => {
    // Surah Al-Kawthar with Arabic Kaf (ك), Alef Maksura (ى), Tashkeel, and verse numbers (١, ٢)
    const quranicAyah = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nإِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ ﴿١﴾ فَصَلِّ لِرَبِّكَ وَانْحَرْ ﴿٢﴾';
    const cleaned = cleanUrduText(quranicAyah);

    // Default clean MUST leave Arabic letters (ك), tashkeel (fatha, shadda, kasra, dagger alef),
    // and verse digits (١, ٢) intact!
    assert.equal(cleaned, quranicAyah);
    assert.ok(cleaned.includes('أَعْطَيْنَاكَ')); // Arabic Kaf preserved
    assert.ok(cleaned.includes('الْكَوْثَرَ')); // Arabic Kaf preserved
    assert.ok(cleaned.includes('﴿١﴾')); // Arabic digit preserved in tashkeel run
    assert.ok(cleaned.includes('﴿٢﴾')); // Arabic digit preserved in tashkeel run
  });

  test('safe default does NOT convert Arabic letters in standard Urdu sentences', () => {
    // Urdu sentence typed with Arabic Yeh (\u064A) and Arabic Kaf (\u0643)
    const arabicYehWord = 'ب\u064Aان'; // Arabic Yeh (ي \u064A)
    const arabicKafWord = '\u0643تاب'; // Arabic Kaf (ك \u0643)
    const urduWithArabicLetters = `یہ ایک ${arabicKafWord} ھے جس میں زندگی کے راستے ${arabicYehWord} کئے گئے ہیں۔`;

    // Default clean should NOT alter letters
    const safeCleaned = cleanUrduText(urduWithArabicLetters);
    assert.equal(safeCleaned, urduWithArabicLetters);
    assert.ok(safeCleaned.includes(arabicYehWord)); // Arabic Yeh with two dots preserved
    assert.ok(safeCleaned.includes(arabicKafWord)); // Arabic Kaf preserved
  });

  test('explicit opt-in ({ normalizeArabicLetters: true }) normalizes Arabic letters to Urdu forms', () => {
    const arabicYehWord = 'ب\u064Aان';
    const arabicKafWord = '\u0643تاب';
    const urduWithArabicLetters = `یہ ایک ${arabicKafWord} ھے جس میں زندگی کے راستے ${arabicYehWord} کئے گئے ہیں۔`;

    const normalized = cleanUrduText(urduWithArabicLetters, { normalizeArabicLetters: true });
    assert.ok(normalized.includes('بیان')); // Converted to Urdu Farsi Yeh (\u06CC)
    assert.ok(normalized.includes('کتاب')); // Converted to Urdu Keheh (\u06A9)
    assert.ok(!normalized.includes(arabicYehWord));
    assert.ok(!normalized.includes(arabicKafWord));
  });

  test('explicit opt-in normalizes Arabic Teh Marbuta (ة) to Urdu Goal Heh (ہ)', () => {
    const textWithTehMarbuta = 'خاصة اور قدرتة';

    // Safe default preserves it
    assert.equal(cleanUrduText(textWithTehMarbuta), 'خاصة اور قدرتة');

    // Opt-in normalizes it
    const normalized = cleanUrduText(textWithTehMarbuta, { normalizeArabicLetters: true });
    assert.equal(normalized, 'خاصہ اور قدرتہ');
  });

  test('converts Arabic-Indic digits (٠-٩) to Urdu-Persian digits (۰-۹) only outside Arabic tashkeel runs', () => {
    // Pure Urdu text without tashkeel -> digits converted
    const urduText = 'باب ٤ اور قسط ٥٦٧ سن ٢٠٢٤ میں';
    const cleanedUrdu = cleanUrduText(urduText);
    assert.equal(cleanedUrdu, 'باب ۴ اور قسط ۵۶۷ سن ۲۰۲۴ میں');

    // Quranic verse with tashkeel -> Arabic digits preserved
    const quranText = 'قُلْ هُوَ اللَّهُ أَحَدٌ ﴿١﴾';
    const cleanedQuran = cleanUrduText(quranText);
    assert.equal(cleanedQuran, 'قُلْ هُوَ اللَّهُ أَحَدٌ ﴿١﴾');
  });

  test('collapses multiple spaces, tabs, and clamps excess blank lines to max 2 blank lines', () => {
    // 5 consecutive newlines = 4 blank lines; clamped to 2 blank lines (\n\n\n)
    const messy = '   پہلا   جملہ۔ \t\t  \n\n\n\n\nدوسرا جملہ۔   \n\n';
    const cleaned = cleanUrduText(messy);
    assert.equal(cleaned, 'پہلا جملہ۔\n\n\nدوسرا جملہ۔');
  });

  test('handles null, undefined, and empty string safely', () => {
    assert.equal(cleanUrduText(null), '');
    assert.equal(cleanUrduText(undefined), '');
    assert.equal(cleanUrduText('   '), '');
  });

  test('hasArabicLetterForms correctly identifies Arabic glyphs', () => {
    assert.equal(hasArabicLetterForms('اردو کتاب'), false);
    assert.equal(hasArabicLetterForms('كتاب'), true); // Arabic Kaf
    assert.equal(hasArabicLetterForms('زندگي'), true); // Arabic Yeh
    assert.equal(hasArabicLetterForms('خاصة'), true); // Arabic Teh Marbuta
  });

  test('normalizeArabicLetterForms direct utility works as expected', () => {
    const text = 'كتابة و قراءة';
    const converted = normalizeArabicLetterForms(text);
    assert.equal(converted, 'کتابہ و قراءہ');
  });
});

describe('Line Breaks & Whitespace Preservation Invariants', () => {
  test('preserves \\n, blank lines, \\r\\n, U+2028, U+2029, runs of 5 blank lines, trailing spaces, ****, Quranic tashkeel, and Urdu digits without line joining', () => {
    // Construct rich manuscript input containing:
    // - Unix \n and blank lines
    // - Windows \r\n
    // - Unicode line separator U+2028 and paragraph separator U+2029
    // - Run of 5 blank lines (6 newlines)
    // - Trailing spaces at line ends
    // - Standalone scene-break line ****
    // - Quranic verse with tashkeel
    // - Urdu digits
    const input = [
      'پہلی سطر ہے یہاں۔    ',
      'دوسری سطر بغیر وقفے کے۔',
      '',
      'تیسری سطر ایک خالی سطر کے بعد۔\r\nچوتھی سطر ونڈوز لائن بریک کے ساتھ۔',
      'پانچویں سطر یونیکوڈ بریک\u2028چھٹی سطر پیراگراف بریک کے ساتھ۔\u2029ساتویں سطر۔',
      '',
      '',
      '',
      '',
      '',
      '****',
      '',
      'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾',
      'باب نمبر ۵ اور صفحہ ۱۲۳۔   ',
    ].join('\n');

    const cleaned = cleanUrduText(input);

    // 1. Verify no newline is converted to a space
    assert.ok(!cleaned.includes('پہلی سطر ہے یہاں۔ دوسری سطر'));
    assert.ok(!cleaned.includes('چھٹی سطر پیراگراف بریک کے ساتھ۔ ساتویں سطر۔'));

    // 2. Count non-empty lines in input vs output
    const getNonEmptyLines = (t: string) =>
      t
        .replace(/\r\n/g, '\n')
        .replace(/[\r\u2028\u2029]/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    const inputNonEmpty = getNonEmptyLines(input);
    const cleanedNonEmpty = getNonEmptyLines(cleaned);

    // Number of non-empty lines MUST be 100% identical!
    assert.equal(cleanedNonEmpty.length, inputNonEmpty.length);
    assert.deepEqual(cleanedNonEmpty, inputNonEmpty);

    // 3. Standalone scene-break line **** survives untouched
    assert.ok(cleaned.includes('\n****\n'));

    // 4. Quranic tashkeel survives
    assert.ok(cleaned.includes('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾'));

    // 5. Clamps run of 5 blank lines to 2 blank lines (\n\n\n)
    assert.ok(cleaned.includes('\n\n\n****'));

    // 6. Trailing spaces stripped
    assert.ok(!cleaned.includes('یہاں۔    \n'));
    assert.ok(cleaned.includes('یہاں۔\n'));
  });
});

describe('Scene Break Detection (isSceneBreakLine)', () => {
  test('identifies standalone scene-break lines correctly', () => {
    assert.equal(isSceneBreakLine('***'), true);
    assert.equal(isSceneBreakLine('****'), true);
    assert.equal(isSceneBreakLine('* * *'), true);
    assert.equal(isSceneBreakLine('---'), true);
    assert.equal(isSceneBreakLine('___'), true);
    assert.equal(isSceneBreakLine('•••'), true);
    assert.equal(isSceneBreakLine('~~~'), true);
    assert.equal(isSceneBreakLine('❖'), true);
    assert.equal(isSceneBreakLine('✦'), true);
    assert.equal(isSceneBreakLine('  * * *  '), true);
  });

  test('does not classify inline symbols or sentences as scene breaks', () => {
    assert.equal(isSceneBreakLine('وہاں سے چلی گئی۔ **** ہال میں روشنیوں کی چمک'), false);
    assert.equal(isSceneBreakLine('اس نے کہا: *** سنو'), false);
    assert.equal(isSceneBreakLine('یہ ایک عام سطر ہے۔'), false);
    assert.equal(isSceneBreakLine('.'), false);
    assert.equal(isSceneBreakLine(''), false);
    assert.equal(isSceneBreakLine('   '), false);
  });
});

describe('Broken Line Joining Tool (joinBrokenLines)', () => {
  test('joins hard-wrapped lines mid-sentence while respecting sentence punctuation', () => {
    const wrapped = `وہ تیز رفتاری سے
گھر کی طرف روانہ ہوا کیونکہ شام
کا وقت ہو چکا تھا۔
اس نے دروازہ کھٹکھٹایا
لیکن کسی نے جواب نہ دیا!
اگلی صبح وہ دوبارہ آیا۔`;

    const joined = joinBrokenLines(wrapped);

    // The first 3 lines should join into 1 sentence because lines 1 and 2 don't end in punctuation
    // Lines 4 and 5 join into 1 sentence ending with !
    // Line 6 stays separate
    const lines = joined.split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], 'وہ تیز رفتاری سے گھر کی طرف روانہ ہوا کیونکہ شام کا وقت ہو چکا تھا۔');
    assert.equal(lines[1], 'اس نے دروازہ کھٹکھٹایا لیکن کسی نے جواب نہ دیا!');
    assert.equal(lines[2], 'اگلی صبح وہ دوبارہ آیا۔');
  });

  test('never joins across scene breaks or chapter headings', () => {
    const textWithBreaks = `پہلی سطر جو مکمل نہیں ہوئی
****
باب اول
دوسری سطر کا آغاز`;

    const joined = joinBrokenLines(textWithBreaks);
    const lines = joined.split('\n');
    assert.equal(lines.length, 4);
    assert.equal(lines[0], 'پہلی سطر جو مکمل نہیں ہوئی');
    assert.equal(lines[1], '****');
    assert.equal(lines[2], 'باب اول');
    assert.equal(lines[3], 'دوسری سطر کا آغاز');
  });

  test('preserves blank line paragraph spacing', () => {
    const textWithBlankLines = `پیراگراف ۱ کا پہلا حصہ
پیراگراف ۱ کا دوسرا حصہ۔

پیراگراف ۲۔`;

    const joined = joinBrokenLines(textWithBlankLines);
    assert.ok(joined.includes('پیراگراف ۱ کا پہلا حصہ پیراگراف ۱ کا دوسرا حصہ۔\n\nپیراگراف ۲۔'));
  });
});

describe('Line and Paragraph Counter', () => {
  test('counts lines and non-empty paragraphs correctly', () => {
    const sample = `پہلا پیراگراف۔

دوسرا پیراگراف
جس میں دو سطریں ہیں۔

****

تیسرا پیراگراف۔`;

    const stats = countLinesAndParagraphs(sample);
    assert.equal(stats.lines, 8);
    // 4 text paragraphs (each non-empty line becomes a paragraph element, excluding scene breaks)
    assert.equal(stats.paragraphs, 4);
  });

  test('handles empty text', () => {
    assert.deepEqual(countLinesAndParagraphs(''), { lines: 0, paragraphs: 0 });
    assert.deepEqual(countLinesAndParagraphs('   \n  \n'), { lines: 0, paragraphs: 0 });
  });
});

describe('Urdu Word Counter & Digits Conversion', () => {
  test('counts words accurately', () => {
    assert.equal(countUrduWords('یہ ایک بہترین ناول ہے'), 5);
    assert.equal(countUrduWords('   تین   الفاظ   یہاں   '), 3);
    assert.equal(countUrduWords(''), 0);
    assert.equal(countUrduWords(null), 0);
  });

  test('converts Western numbers to Urdu digits', () => {
    assert.equal(toUrduDigits(12345), '۱۲۳۴۵');
    assert.equal(toUrduDigits('Chapter 42'), 'Chapter ۴۲');
  });
});
