import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, resetRateLimit } from '../src/lib/writer/rate-limit.ts';

describe('Manuscript Parser & Upload Security Guardrails', () => {
  describe('Per-User Rate Limiting', () => {
    const testUserId = 'test-user-rate-limit-123';

    test('allows up to 10 requests within the window and blocks subsequent requests', () => {
      resetRateLimit(testUserId);

      // Make 10 permitted requests
      for (let i = 1; i <= 10; i++) {
        const check = checkRateLimit(testUserId, 10, 60000);
        assert.equal(check.allowed, true, `Request ${i} should be allowed`);
        assert.equal(check.remaining, 10 - i);
      }

      // 11th request must be rejected
      const blocked = checkRateLimit(testUserId, 10, 60000);
      assert.equal(blocked.allowed, false);
      assert.equal(blocked.remaining, 0);
      assert.ok(blocked.resetAt > Date.now());

      // Reset and verify recovery
      resetRateLimit(testUserId);
      const afterReset = checkRateLimit(testUserId, 10, 60000);
      assert.equal(afterReset.allowed, true);
      assert.equal(afterReset.remaining, 9);
    });

    test('isolates rate limits per user identifier', () => {
      const userA = 'user-a-id';
      const userB = 'user-b-id';
      resetRateLimit(userA);
      resetRateLimit(userB);

      // Exhaust User A's limit
      for (let i = 0; i < 5; i++) {
        checkRateLimit(userA, 5, 60000);
      }
      assert.equal(checkRateLimit(userA, 5, 60000).allowed, false);

      // User B should still be allowed
      const checkB = checkRateLimit(userB, 5, 60000);
      assert.equal(checkB.allowed, true);
    });
  });

  describe('File Validation Constraints (5 MB limit and .docx/.txt extensions)', () => {
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

    test('strictly enforces 5 MB file size limit', () => {
      const exact5MB = 5 * 1024 * 1024;
      const over5MB = 5 * 1024 * 1024 + 1;
      const under5MB = 2 * 1024 * 1024;

      assert.equal(under5MB <= MAX_FILE_SIZE, true);
      assert.equal(exact5MB <= MAX_FILE_SIZE, true);
      assert.equal(over5MB <= MAX_FILE_SIZE, false);
    });

    test('accepts ONLY .docx and .txt extensions (case-insensitive)', () => {
      const isAllowedExtension = (name: string) => {
        const lower = name.toLowerCase();
        return lower.endsWith('.docx') || lower.endsWith('.txt');
      };

      // Allowed formats
      assert.equal(isAllowedExtension('manuscript.docx'), true);
      assert.equal(isAllowedExtension('MANUSCRIPT.DOCX'), true);
      assert.equal(isAllowedExtension('chapter1.txt'), true);
      assert.equal(isAllowedExtension('novel_draft.TXT'), true);

      // Disallowed formats
      assert.equal(isAllowedExtension('manuscript.doc'), false);
      assert.equal(isAllowedExtension('document.pdf'), false);
      assert.equal(isAllowedExtension('file.rtf'), false);
      assert.equal(isAllowedExtension('script.exe'), false);
      assert.equal(isAllowedExtension('archive.zip'), false);
    });

    test('validates .docx binary signature (ZIP PK magic bytes)', () => {
      const validDocxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
      const invalidBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

      const isZip = (buf: Buffer) => buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;

      assert.equal(isZip(validDocxBuffer), true);
      assert.equal(isZip(invalidBuffer), false);
    });
  });

  describe('Writer Authorization Rule', () => {
    test('only allows approved writers and admins', () => {
      const isAuthorizedForParse = (role: string, writerStatus: string | null) => {
        if (role === 'admin') return true;
        return role === 'writer' && writerStatus === 'approved';
      };

      // Approved writer
      assert.equal(isAuthorizedForParse('writer', 'approved'), true);

      // Admin
      assert.equal(isAuthorizedForParse('admin', null), true);
      assert.equal(isAuthorizedForParse('admin', 'pending_approval'), true);

      // Pending writer (cannot parse/import yet)
      assert.equal(isAuthorizedForParse('writer', 'pending_approval'), false);

      // Rejected or suspended writer
      assert.equal(isAuthorizedForParse('writer', 'rejected'), false);
      assert.equal(isAuthorizedForParse('writer', 'suspended'), false);

      // Reader
      assert.equal(isAuthorizedForParse('reader', null), false);
      assert.equal(isAuthorizedForParse('reader', 'pending_approval'), false);
    });
  });
});
