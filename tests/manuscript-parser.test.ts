import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { splitManuscriptIntoChapters } from '../src/lib/text/manuscript-parser.ts';

describe('Manuscript Chapter Splitter', () => {
  test('splits text on Urdu chapter headings', () => {
    const raw = `
باب اول: شروعات
یہ پہلے باب کا متن ہے۔ زندگی کا سفر شروع ہوا۔

باب دوم: امتحان
یہ دوسرے باب کی کہانی ہے۔ مشکلات نے راستہ روک لیا۔
`;

    const chapters = splitManuscriptIntoChapters(raw);
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].chapter_number, 1);
    assert.ok(chapters[0].title_urdu.includes('باب اول'));
    assert.ok(chapters[0].content_urdu.includes('زندگی کا سفر'));
    assert.equal(chapters[1].chapter_number, 2);
    assert.ok(chapters[1].title_urdu.includes('باب دوم'));
  });

  test('splits text on Markdown headings', () => {
    const raw = `
# باب 1
پہلا حصہ

## باب 2
دوسرا حصہ
`;

    const chapters = splitManuscriptIntoChapters(raw);
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].chapter_number, 1);
    assert.equal(chapters[0].title_urdu, 'باب 1');
    assert.equal(chapters[1].chapter_number, 2);
    assert.equal(chapters[1].title_urdu, 'باب 2');
  });

  test('falls back to single chapter if no headings present', () => {
    const raw = 'یہ ایک مختصر کہانی ہے جس میں کوئی ابواب نہیں ہیں۔';
    const chapters = splitManuscriptIntoChapters(raw);
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0].chapter_number, 1);
    assert.equal(chapters[0].title_urdu, 'باب ۱');
    assert.equal(chapters[0].content_urdu, raw);
  });

  test('validates 120,000 character limit flag', () => {
    const shortText = 'مختصر متن';
    const chapters = splitManuscriptIntoChapters(shortText);
    assert.equal(chapters[0].is_valid_length, true);

    const longText = 'ا'.repeat(120005);
    const longChapters = splitManuscriptIntoChapters(longText);
    assert.equal(longChapters[0].is_valid_length, false);
  });
});
