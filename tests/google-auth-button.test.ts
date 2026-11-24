import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isGoogleAuthEnabled } from '../src/lib/auth/google-auth-flag.ts';
import { sanitizeRedirectPath } from '../src/lib/auth/safe-redirect.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Google OAuth Server Flag & Button Hydration Parity', () => {
  const originalNextPublicFlag = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
  const originalGoogleAuthFlag = process.env.GOOGLE_AUTH_ENABLED;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
    delete process.env.GOOGLE_AUTH_ENABLED;
  });

  afterEach(() => {
    if (originalNextPublicFlag !== undefined) {
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = originalNextPublicFlag;
    } else {
      delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
    }

    if (originalGoogleAuthFlag !== undefined) {
      process.env.GOOGLE_AUTH_ENABLED = originalGoogleAuthFlag;
    } else {
      delete process.env.GOOGLE_AUTH_ENABLED;
    }
  });

  describe('isGoogleAuthEnabled Server Helper', () => {
    test('returns false when both environment variables are unset', () => {
      assert.equal(isGoogleAuthEnabled(), false);
    });

    test('returns true when NEXT_PUBLIC_GOOGLE_AUTH_ENABLED is "true"', () => {
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
      assert.equal(isGoogleAuthEnabled(), true);
    });

    test('returns true when GOOGLE_AUTH_ENABLED is "true"', () => {
      process.env.GOOGLE_AUTH_ENABLED = 'true';
      assert.equal(isGoogleAuthEnabled(), true);
    });

    test('returns true when both flags are "true"', () => {
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
      process.env.GOOGLE_AUTH_ENABLED = 'true';
      assert.equal(isGoogleAuthEnabled(), true);
    });

    test('returns false when flags are set to "false", "0", or arbitrary text', () => {
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = 'false';
      assert.equal(isGoogleAuthEnabled(), false);

      process.env.GOOGLE_AUTH_ENABLED = '0';
      assert.equal(isGoogleAuthEnabled(), false);

      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = 'TRUE'; // case sensitive check
      assert.equal(isGoogleAuthEnabled(), false);
    });
  });

  describe('Hydration Parity & Component Architecture Verification', () => {
    const buttonPath = path.join(rootDir, 'src', 'components', 'auth', 'GoogleSignInButton.tsx');
    const loginPagePath = path.join(rootDir, 'src', 'app', '(marketplace)', 'login', 'page.tsx');
    const registerPagePath = path.join(rootDir, 'src', 'app', '(marketplace)', 'register', 'page.tsx');
    const loginFormPath = path.join(rootDir, 'src', 'app', '(marketplace)', 'login', 'login-form.tsx');
    const registerFormPath = path.join(rootDir, 'src', 'app', '(marketplace)', 'register', 'register-form.tsx');

    test('GoogleSignInButton.tsx accepts enabled boolean prop and does not read process.env on client', () => {
      const content = fs.readFileSync(buttonPath, 'utf8');
      assert.match(content, /enabled:\s*boolean/);
      assert.match(content, /if\s*\(!enabled\)\s*\{\s*return\s+null;\s*\}/);
      // Ensures client component does not read process.env directly (preventing hydration mismatch)
      assert.doesNotMatch(content, /process\.env\.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED/);
    });

    test('login/page.tsx enforces force-dynamic and passes isGoogleAuthEnabled() to LoginForm', () => {
      const content = fs.readFileSync(loginPagePath, 'utf8');
      assert.match(content, /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
      assert.match(content, /isGoogleAuthEnabled\(\)/);
      assert.match(content, /googleAuthEnabled=\{googleAuthEnabled\}/);
    });

    test('register/page.tsx enforces force-dynamic and passes isGoogleAuthEnabled() to RegisterForm', () => {
      const content = fs.readFileSync(registerPagePath, 'utf8');
      assert.match(content, /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
      assert.match(content, /isGoogleAuthEnabled\(\)/);
      assert.match(content, /googleAuthEnabled=\{googleAuthEnabled\}/);
    });

    test('LoginForm forwards googleAuthEnabled to GoogleSignInButton', () => {
      const content = fs.readFileSync(loginFormPath, 'utf8');
      assert.match(content, /googleAuthEnabled\?: boolean/);
      assert.match(content, /<GoogleSignInButton\s+enabled=\{googleAuthEnabled\}/);
    });

    test('RegisterForm forwards googleAuthEnabled to GoogleSignInButton', () => {
      const content = fs.readFileSync(registerFormPath, 'utf8');
      assert.match(content, /googleAuthEnabled\?: boolean/);
      assert.match(content, /<GoogleSignInButton\s+enabled=\{googleAuthEnabled\}/);
    });

    test('GoogleSignInButton renders crisp single-line layout, horizontal divider, and semantic tokens', () => {
      const content = fs.readFileSync(buttonPath, 'utf8');

      // Single-line English label with whitespace-nowrap
      assert.match(content, /Continue with Google/);
      assert.match(content, /Connecting to Google\.\.\./);
      assert.match(content, /whitespace-nowrap/);

      // Ensures no side-by-side Urdu or slash is crammed inside the button
      assert.doesNotMatch(content, /گوگل کے ساتھ جاری رکھیں/);
      assert.doesNotMatch(content, /Continue with Google\s*\/\s*گوگل/);

      // Brand-compliant Google "G" SVG icon with fixed dimensions
      assert.match(content, /<GoogleIcon className="w-5 h-5 shrink-0"/);

      // Crisp horizontal flexbox divider flanking the "or" label
      assert.match(content, /<div className="my-5 flex items-center gap-3"/);
      assert.match(content, /<div className="h-px flex-1 bg-border" \/>/);
      assert.match(content, /<span className="text-xs font-medium uppercase tracking-wider text-text-muted">or<\/span>/);

      // Primary button proportions and semantic tokens
      assert.match(content, /rounded-xl/);
      assert.match(content, /min-h-\[44px\]/);
      assert.match(content, /bg-surface/);
      assert.match(content, /border-border/);
      assert.match(content, /text-navy/);
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
