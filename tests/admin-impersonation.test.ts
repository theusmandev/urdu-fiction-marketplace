import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { impersonateWriterSchema } from '../src/lib/admin/schemas.ts';

describe('Admin Writer Impersonation Validation & URL Construction', () => {
  const validWriterId = '12345678-1234-1234-1234-123456789abc';

  describe('impersonateWriterSchema', () => {
    it('accepts valid writer UUID and reason >= 5 characters', () => {
      const valid = {
        writerId: validWriterId,
        reason: 'Debugging chapter publication issue reported by author',
      };
      const result = impersonateWriterSchema.safeParse(valid);
      assert.equal(result.success, true);
    });

    it('rejects invalid writer UUID', () => {
      const invalid = {
        writerId: 'not-a-valid-uuid',
        reason: 'Debugging issue',
      };
      const result = impersonateWriterSchema.safeParse(invalid);
      assert.equal(result.success, false);
      assert.match(result.error?.issues[0]?.message || '', /Invalid UUID format/i);
    });

    it('rejects reasons shorter than 5 characters', () => {
      const tooShort = {
        writerId: validWriterId,
        reason: 'test',
      };
      const result = impersonateWriterSchema.safeParse(tooShort);
      assert.equal(result.success, false);
      assert.match(
        result.error?.issues[0]?.message || '',
        /A support justification reason of at least 5 characters is required/i
      );
    });

    it('rejects whitespace-only reasons', () => {
      const whitespace = {
        writerId: validWriterId,
        reason: '     ',
      };
      const result = impersonateWriterSchema.safeParse(whitespace);
      assert.equal(result.success, false);
    });
  });

  describe('Impersonation Callback URL Construction', () => {
    it('constructs a valid direct callback URL without PKCE verifiers', () => {
      const siteUrl = 'https://premium.urdunovelbanks.com';
      const mockHashedToken = 'test_hashed_otp_token_xyz123==';

      const baseUrl = siteUrl.replace(/\/+$/, '');
      const impersonationUrl = `${baseUrl}/auth/callback?token_hash=${encodeURIComponent(
        mockHashedToken
      )}&type=magiclink&next=%2Fwriter`;

      const parsed = new URL(impersonationUrl);
      assert.equal(parsed.origin, 'https://premium.urdunovelbanks.com');
      assert.equal(parsed.pathname, '/auth/callback');
      assert.equal(parsed.searchParams.get('token_hash'), mockHashedToken);
      assert.equal(parsed.searchParams.get('type'), 'magiclink');
      assert.equal(parsed.searchParams.get('next'), '/writer');
    });

    it('strips redundant trailing slashes from base URL gracefully', () => {
      const rawBase = 'http://localhost:3000///';
      const baseUrl = rawBase.replace(/\/+$/, '');
      const impersonationUrl = `${baseUrl}/auth/callback?token_hash=token123&type=magiclink&next=%2Fwriter`;

      const parsed = new URL(impersonationUrl);
      assert.equal(parsed.origin, 'http://localhost:3000');
      assert.equal(parsed.pathname, '/auth/callback');
    });
  });
});

