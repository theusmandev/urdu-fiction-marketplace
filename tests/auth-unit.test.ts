import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeRedirectPath, isSafeRedirectPath } from '../src/lib/auth/safe-redirect.ts';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  profileEditSchema,
  writerApplicationSchema,
} from '../src/lib/auth/schemas.ts';

describe('Safe Redirect Security Helper', () => {
  test('allows safe relative paths', () => {
    assert.equal(sanitizeRedirectPath('/account'), '/account');
    assert.equal(sanitizeRedirectPath('/library'), '/library');
    assert.equal(sanitizeRedirectPath('/orders'), '/orders');
    assert.equal(sanitizeRedirectPath('/writer'), '/writer');
    assert.equal(sanitizeRedirectPath('/admin'), '/admin');
    assert.equal(sanitizeRedirectPath('/writer/orders'), '/writer/orders');
    assert.equal(sanitizeRedirectPath('/novels/ishq-e-atish'), '/novels/ishq-e-atish');
  });

  test('rejects absolute external URLs and falls back to /', () => {
    assert.equal(sanitizeRedirectPath('https://evil.com'), '/');
    assert.equal(sanitizeRedirectPath('http://attacker.org/steal'), '/');
    assert.equal(isSafeRedirectPath('https://google.com'), false);
  });

  test('rejects protocol-relative open redirect attacks', () => {
    assert.equal(sanitizeRedirectPath('//evil.com'), '/');
    assert.equal(sanitizeRedirectPath('///evil.com'), '/');
    assert.equal(isSafeRedirectPath('//evil.com'), false);
  });

  test('rejects backslash bypass attempts', () => {
    assert.equal(sanitizeRedirectPath('\\evil.com'), '/');
    assert.equal(sanitizeRedirectPath('/\\evil.com'), '/');
    assert.equal(sanitizeRedirectPath('\\/evil.com'), '/');
    assert.equal(isSafeRedirectPath('\\evil.com'), false);
  });

  test('rejects javascript: and data: pseudo-protocols', () => {
    assert.equal(sanitizeRedirectPath('javascript:alert(1)'), '/');
    assert.equal(sanitizeRedirectPath('data:text/html,<script>alert(1)</script>'), '/');
    assert.equal(isSafeRedirectPath('javascript:void(0)'), false);
  });

  test('respects custom fallback path', () => {
    assert.equal(sanitizeRedirectPath('https://evil.com', '/library'), '/library');
    assert.equal(sanitizeRedirectPath(undefined, '/account'), '/account');
  });
});

describe('Auth Validation Schemas (Zod)', () => {
  describe('Registration Schema', () => {
    test('validates correct registration inputs', () => {
      const valid = {
        fullName: 'Ahmed Khan',
        username: 'ahmed_khan',
        email: 'ahmed@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      };
      const result = registerSchema.safeParse(valid);
      assert.equal(result.success, true);
    });

    test('rejects username with invalid characters or spaces', () => {
      const invalid = {
        fullName: 'Ahmed Khan',
        username: 'ahmed khan', // space not allowed
        email: 'ahmed@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      };
      const result = registerSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    test('rejects weak passwords missing uppercase/lowercase/number/symbol', () => {
      const weakCases = [
        'short1!',           // < 8 chars
        'alllowercase123!',  // no uppercase
        'ALLUPPERCASE123!',  // no lowercase
        'NoNumbersHere!!',   // no digit
        'NoSpecialChar123',  // no symbol
      ];

      for (const pwd of weakCases) {
        const result = registerSchema.safeParse({
          fullName: 'Test User',
          username: 'valid_user',
          email: 'test@example.com',
          password: pwd,
          confirmPassword: pwd,
        });
        assert.equal(result.success, false, `Expected password "${pwd}" to be rejected`);
      }
    });

    test('rejects mismatched password confirmation', () => {
      const mismatched = {
        fullName: 'Test User',
        username: 'test_user',
        email: 'test@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'DifferentPassword123!',
      };
      const result = registerSchema.safeParse(mismatched);
      assert.equal(result.success, false);
      if (!result.success) {
        const confirmErr = result.error.issues.find(i => i.path.includes('confirmPassword'));
        assert.ok(confirmErr, 'Should flag confirmPassword issue');
      }
    });
  });

  describe('Login Schema', () => {
    test('validates valid credentials format', () => {
      const result = loginSchema.safeParse({
        email: 'reader@example.com',
        password: 'AnyPassword123',
      });
      assert.equal(result.success, true);
    });

    test('rejects invalid email formats', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'Password123',
      });
      assert.equal(result.success, false);
    });
  });

  describe('Password Reset Schemas', () => {
    test('validates email in forgotPasswordSchema', () => {
      assert.equal(forgotPasswordSchema.safeParse({ email: 'user@unb.pk' }).success, true);
      assert.equal(forgotPasswordSchema.safeParse({ email: '' }).success, false);
    });

    test('enforces password rules in resetPasswordSchema', () => {
      const valid = resetPasswordSchema.safeParse({
        password: 'NewStrongPassword123!',
        confirmPassword: 'NewStrongPassword123!',
      });
      assert.equal(valid.success, true);

      const weak = resetPasswordSchema.safeParse({
        password: 'weak',
        confirmPassword: 'weak',
      });
      assert.equal(weak.success, false);
    });
  });

  describe('Writer Application Schema', () => {
    test('accepts complete writer application', () => {
      const valid = {
        penNameEnglish: 'Tariq Ismail Sagar',
        penNameUrdu: 'طارق اسماعیل ساگر',
        bioEnglish: 'Renowned Urdu spy and suspense novelist.',
        bioUrdu: 'معروف جاسوسی و سسپنس ناول نگار',
        acceptAgreement: true,
      };
      const result = writerApplicationSchema.safeParse(valid);
      assert.equal(result.success, true);
    });

    test('strictly rejects unaccepted writer agreement', () => {
      const invalid = {
        penNameEnglish: 'Author Name',
        penNameUrdu: 'مصنف',
        acceptAgreement: false,
      };
      const result = writerApplicationSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    test('rejects blank pen names', () => {
      const invalid = {
        penNameEnglish: '',
        penNameUrdu: 'مصنف',
        acceptAgreement: true,
      };
      const result = writerApplicationSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });
  });

  describe('Profile Edit Schema', () => {
    test('accepts valid full name and username', () => {
      const result = profileEditSchema.safeParse({
        fullName: 'Nimra Ahmed',
        username: 'nimra_ahmed',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
      assert.equal(result.success, true);
    });

    test('accepts empty avatarUrl', () => {
      const result = profileEditSchema.safeParse({
        fullName: 'Nimra Ahmed',
        username: 'nimra_ahmed',
        avatarUrl: '',
      });
      assert.equal(result.success, true);
    });

    test('rejects invalid avatar URL', () => {
      const result = profileEditSchema.safeParse({
        fullName: 'Nimra Ahmed',
        username: 'nimra_ahmed',
        avatarUrl: 'not-a-valid-url',
      });
      assert.equal(result.success, false);
    });
  });
});
