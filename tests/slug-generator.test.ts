import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateNovelSlug } from '../src/lib/text/slug-generator.ts';

describe('Novel Slug Generator', () => {
  test('transliterates English titles to lowercase kebab-case', () => {
    assert.equal(generateNovelSlug('Shadows of Lahore: Part 1!'), 'shadows-of-lahore-part-1');
    assert.equal(generateNovelSlug('  The   Silent River  '), 'the-silent-river');
  });

  test('falls back to novel-id prefix for Urdu-only titles', () => {
    const slug = generateNovelSlug('محبت کا سفر', 'seed1234');
    assert.equal(slug, 'novel-seed1234');
  });

  test('falls back safely when title is null or empty', () => {
    const slug1 = generateNovelSlug('', 'abc12345');
    assert.equal(slug1, 'novel-abc12345');

    const slug2 = generateNovelSlug(null, 'xyz99999');
    assert.equal(slug2, 'novel-xyz99999');
  });

  test('truncates extremely long titles to max 80 characters cleanly', () => {
    const longTitle = 'A'.repeat(100);
    const slug = generateNovelSlug(longTitle);
    assert.ok(slug.length <= 80);
  });
});
