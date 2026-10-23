import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanUrduText,
  countUrduWords,
  toUrduDigits,
  normalizeArabicLetterForms,
  hasArabicLetterForms,
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

  test('collapses multiple spaces, tabs, and excess blank lines', () => {
    const messy = '   پہلا   جملہ۔ \t\t  \n\n\n\n\nدوسرا جملہ۔   \n\n';
    const cleaned = cleanUrduText(messy);
    assert.equal(cleaned, 'پہلا جملہ۔\n\nدوسرا جملہ۔');
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
