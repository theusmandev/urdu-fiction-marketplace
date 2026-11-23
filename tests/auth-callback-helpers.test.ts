import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapOAuthCallbackError,
  resolveSafePostAuthRedirect,
} from '../src/lib/auth/callback-helpers.ts';

describe('OAuth Callback Helpers', () => {
  describe('mapOAuthCallbackError', () => {
    test('returns null when no error parameters are present', () => {
      assert.equal(mapOAuthCallbackError(null, null), null);
      assert.equal(mapOAuthCallbackError(undefined, undefined), null);
      assert.equal(mapOAuthCallbackError('', ''), null);
    });

    test('maps Google consent cancellation (access_denied / 403) to oauth_cancelled', () => {
      const res1 = mapOAuthCallbackError('access_denied', '403');
      assert.deepEqual(res1, {
        errorCode: 'oauth_cancelled',
        redirectPath: '/login?error=oauth_cancelled',
      });

      const res2 = mapOAuthCallbackError('access_denied', null);
      assert.deepEqual(res2, {
        errorCode: 'oauth_cancelled',
        redirectPath: '/login?error=oauth_cancelled',
      });

      const res3 = mapOAuthCallbackError(null, '403');
      assert.deepEqual(res3, {
        errorCode: 'oauth_cancelled',
        redirectPath: '/login?error=oauth_cancelled',
      });

      const res4 = mapOAuthCallbackError('user_cancelled', null);
      assert.deepEqual(res4, {
        errorCode: 'oauth_cancelled',
        redirectPath: '/login?error=oauth_cancelled',
      });
    });

    test('maps unexpected or server provider errors to oauth_failed', () => {
      const res1 = mapOAuthCallbackError('server_error', '500');
      assert.deepEqual(res1, {
        errorCode: 'oauth_failed',
        redirectPath: '/login?error=oauth_failed',
      });

      const res2 = mapOAuthCallbackError('temporarily_unavailable', null);
      assert.deepEqual(res2, {
        errorCode: 'oauth_failed',
        redirectPath: '/login?error=oauth_failed',
      });

      const res3 = mapOAuthCallbackError('invalid_request', '400');
      assert.deepEqual(res3, {
        errorCode: 'oauth_failed',
        redirectPath: '/login?error=oauth_failed',
      });
    });
  });

  describe('resolveSafePostAuthRedirect', () => {
    test('allows safe whitelisted application paths', () => {
      assert.equal(resolveSafePostAuthRedirect('/account'), '/account');
      assert.equal(resolveSafePostAuthRedirect('/novels/umer-jahan'), '/novels/umer-jahan');
      assert.equal(resolveSafePostAuthRedirect('/read/umer-jahan/1'), '/read/umer-jahan/1');
      assert.equal(resolveSafePostAuthRedirect('/checkout/umer-jahan'), '/checkout/umer-jahan');
      assert.equal(resolveSafePostAuthRedirect('/library'), '/library');
    });

    test('safely rejects external, protocol-relative, and dangerous paths', () => {
      assert.equal(resolveSafePostAuthRedirect('//evil.com'), '/account');
      assert.equal(resolveSafePostAuthRedirect('https://evil.com'), '/account');
      assert.equal(resolveSafePostAuthRedirect('http://evil.com/account'), '/account');
      assert.equal(resolveSafePostAuthRedirect('/\\evil.com'), '/account');
      assert.equal(resolveSafePostAuthRedirect('javascript:alert(1)'), '/account');
      assert.equal(resolveSafePostAuthRedirect(null), '/account');
      assert.equal(resolveSafePostAuthRedirect(undefined), '/account');
      assert.equal(resolveSafePostAuthRedirect(''), '/account');
    });

    test('honors custom fallback when provided', () => {
      assert.equal(resolveSafePostAuthRedirect(null, '/reset-password'), '/reset-password');
      assert.equal(resolveSafePostAuthRedirect('//evil.com', '/reset-password'), '/reset-password');
      assert.equal(resolveSafePostAuthRedirect('/reset-password', '/account'), '/reset-password');
    });
  });
});
