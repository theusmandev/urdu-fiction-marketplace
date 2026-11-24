import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRedirectPath } from '../src/lib/auth/safe-redirect.ts';

describe('Google OAuth Button & Redirect Construction', () => {
  const originalFlag = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
  });

  afterEach(() => {
    if (originalFlag !== undefined) {
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = originalFlag;
    } else {
      delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
    }
  });

  describe('Feature Flag Invariant', () => {
    test('flag is disabled by default when unset', () => {
      assert.notEqual(process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED, 'true');
    });

    test('flag remains disabled when explicitly set to false or other strings', () => {
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = 'false';
      assert.notEqual(process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED, 'true');

      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = '0';
      assert.notEqual(process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED, 'true');
    });

    test('flag enables only when strictly true', () => {
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
      assert.equal(process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED, 'true');
    });
  });

  describe('Redirect URL Construction', () => {
    function constructRedirectUrl(origin: string, nextParam?: string | null): string {
      let redirectTo = `${origin}/auth/callback`;
      if (nextParam && typeof nextParam === 'string') {
        const trimmed = nextParam.trim();
        if (
          trimmed.startsWith('/') &&
          !trimmed.startsWith('//') &&
          !trimmed.startsWith('/\\') &&
          !trimmed.startsWith('\\')
        ) {
          const safeNext = sanitizeRedirectPath(trimmed, '');
          if (safeNext) {
            const callbackUrl = new URL(redirectTo);
            callbackUrl.searchParams.set('next', safeNext);
            redirectTo = callbackUrl.toString();
          }
        }
      }
      return redirectTo;
    }

    test('constructs clean base redirect URL when nextParam is null or undefined', () => {
      const url = constructRedirectUrl('https://premium.urdunovelbanks.com', null);
      assert.equal(url, 'https://premium.urdunovelbanks.com/auth/callback');

      const url2 = constructRedirectUrl('https://premium.urdunovelbanks.com', undefined);
      assert.equal(url2, 'https://premium.urdunovelbanks.com/auth/callback');
    });

    test('appends sanitized relative next parameter for safe internal destinations', () => {
      const url1 = constructRedirectUrl('https://premium.urdunovelbanks.com', '/account');
      assert.equal(url1, 'https://premium.urdunovelbanks.com/auth/callback?next=%2Faccount');

      const url2 = constructRedirectUrl('https://premium.urdunovelbanks.com', '/novels/umer-jahan');
      assert.equal(url2, 'https://premium.urdunovelbanks.com/auth/callback?next=%2Fnovels%2Fumer-jahan');

      const url3 = constructRedirectUrl('https://premium.urdunovelbanks.com', '/checkout/umer-jahan');
      assert.equal(url3, 'https://premium.urdunovelbanks.com/auth/callback?next=%2Fcheckout%2Fumer-jahan');
    });

    test('strictly strips open redirect attempts and protocol-relative bypasses', () => {
      const url1 = constructRedirectUrl('https://premium.urdunovelbanks.com', '//evil.com');
      assert.equal(url1, 'https://premium.urdunovelbanks.com/auth/callback');

      const url2 = constructRedirectUrl('https://premium.urdunovelbanks.com', 'https://evil.com');
      assert.equal(url2, 'https://premium.urdunovelbanks.com/auth/callback');

      const url3 = constructRedirectUrl('https://premium.urdunovelbanks.com', '/\\evil.com');
      assert.equal(url3, 'https://premium.urdunovelbanks.com/auth/callback');

      const url4 = constructRedirectUrl('https://premium.urdunovelbanks.com', 'javascript:alert(1)');
      assert.equal(url4, 'https://premium.urdunovelbanks.com/auth/callback');
    });
  });
});
