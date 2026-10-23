import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  readerPreferencesSchema,
  DEFAULT_READER_PREFERENCES,
  getShortReaderHash,
  buildWatermarkPattern,
  calculateLibraryProgress,
  mapReaderError,
} from '../src/lib/reader/schemas.ts';

describe('Reader Domain Helpers & Schemas', () => {
  describe('readerPreferencesSchema', () => {
    it('validates default preferences when empty object passed', () => {
      const parsed = readerPreferencesSchema.parse({});
      assert.deepEqual(parsed, DEFAULT_READER_PREFERENCES);
    });

    it('accepts valid custom preferences', () => {
      const input = {
        theme: 'sepia',
        fontSize: '2xl',
        lineHeight: 'loose',
      };
      const parsed = readerPreferencesSchema.parse(input);
      assert.equal(parsed.theme, 'sepia');
      assert.equal(parsed.fontSize, '2xl');
      assert.equal(parsed.lineHeight, 'loose');
    });

    it('rejects invalid theme value', () => {
      const res = readerPreferencesSchema.safeParse({ theme: 'neon' });
      assert.equal(res.success, false);
    });
  });

  describe('getShortReaderHash & buildWatermarkPattern', () => {
    it('generates consistent 6-char short reader hash from UUID', () => {
      const uuid = '33333333-cccc-dddd-eeee-444444444444';
      const hash1 = getShortReaderHash(uuid);
      const hash2 = getShortReaderHash(uuid);
      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 6);
      assert.equal(hash1, '333444');
    });

    it('returns ANON for empty or missing reader ID', () => {
      assert.equal(getShortReaderHash(null), 'ANON');
      assert.equal(getShortReaderHash(''), 'ANON');
    });

    it('builds composite watermark pattern combining order code and reader hash', () => {
      const pattern = buildWatermarkPattern('ORD-20261023-XYZ', '33333333-cccc-dddd-eeee-444444444444');
      assert.equal(pattern, 'ORD-20261023-XYZ • #333444');
    });

    it('returns null if watermark code is missing or empty', () => {
      assert.equal(buildWatermarkPattern(null, 'uuid'), null);
      assert.equal(buildWatermarkPattern('', 'uuid'), null);
      assert.equal(buildWatermarkPattern('   ', 'uuid'), null);
    });
  });

  describe('calculateLibraryProgress', () => {
    it('handles 0 total chapters safely', () => {
      const prog = calculateLibraryProgress(0, 0);
      assert.equal(prog.percent, 0);
      assert.equal(prog.isCompleted, false);
      assert.equal(prog.label, '0 chapters published');
    });

    it('reports not started when current chapter is 0 or null', () => {
      const progNull = calculateLibraryProgress(null, 15);
      const progZero = calculateLibraryProgress(0, 15);
      assert.equal(progNull.percent, 0);
      assert.equal(progNull.label, 'Not started');
      assert.equal(progZero.percent, 0);
      assert.equal(progZero.label, 'Not started');
    });

    it('calculates mid-novel reading progress accurately', () => {
      const prog = calculateLibraryProgress(5, 20);
      assert.equal(prog.percent, 25);
      assert.equal(prog.label, 'Chapter 5 of 20');
      assert.equal(prog.isCompleted, false);
    });

    it('handles completed novel state when current reaches or exceeds total', () => {
      const progExact = calculateLibraryProgress(20, 20);
      assert.equal(progExact.percent, 100);
      assert.equal(progExact.isCompleted, true);
      assert.equal(progExact.label, 'Completed (20/20)');

      const progBeyond = calculateLibraryProgress(25, 20);
      assert.equal(progBeyond.percent, 100);
      assert.equal(progBeyond.isCompleted, true);
    });
  });

  describe('mapReaderError', () => {
    it('identifies sliding-window rate limit errors and flags waitSuggested', () => {
      const mapped = mapReaderError('Too many chapters opened, please slow down');
      assert.equal(mapped.type, 'rate_limited');
      assert.equal(mapped.waitSuggested, true);
      assert.ok(mapped.message.includes('slow down'));
    });

    it('identifies generic not found errors', () => {
      const mapped = mapReaderError('Chapter not found');
      assert.equal(mapped.type, 'not_found');
      assert.equal(mapped.waitSuggested, false);
      assert.ok(mapped.message.includes('not published or requires purchase verification'));
    });

    it('identifies unauthenticated access attempt', () => {
      const mapped = mapReaderError('Authentication required.');
      assert.equal(mapped.type, 'unauthenticated');
      assert.equal(mapped.waitSuggested, false);
      assert.ok(mapped.message.includes('sign in'));
    });

    it('falls back to generic error message cleanly', () => {
      const mapped = mapReaderError('Database connection pool timeout');
      assert.equal(mapped.type, 'generic');
      assert.equal(mapped.waitSuggested, false);
      assert.equal(mapped.message, 'Database connection pool timeout');
    });
  });
});
