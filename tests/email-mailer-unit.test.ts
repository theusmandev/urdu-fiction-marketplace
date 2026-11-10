import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail, sanitizeErrorMessage } from '../src/lib/email/mailer.ts';
import { checkRateLimitAsync, resetRateLimitAsync } from '../src/lib/writer/rate-limit.ts';

describe('HTTP Email Mailer (Resend & Brevo REST API)', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  test('safely falls back to mock dry-run when no email provider is configured', async () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.BREVO_API_KEY;

    const result = await sendEmail('reader@example.com', {
      template: 'order_confirmed',
      subject: 'Your novel purchase has been verified',
      bodyText: 'Thank you for your order.',
    });

    assert.equal(result.success, true);
    assert.equal(result.isMocked, true);
    assert.ok(result.messageId?.startsWith('mock-'));
  });

  test('safely falls back to mock dry-run when RESEND_API_KEY is missing for resend provider', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail('reader@example.com', {
      template: 'order_confirmed',
      subject: 'Test Subject',
      bodyText: 'Test Body',
    });

    assert.equal(result.success, true);
    assert.equal(result.isMocked, true);
    assert.ok(result.messageId?.startsWith('mock-resend-'));
  });

  test('safely falls back to mock dry-run when BREVO_API_KEY is missing for brevo provider', async () => {
    process.env.EMAIL_PROVIDER = 'brevo';
    delete process.env.BREVO_API_KEY;

    const result = await sendEmail('reader@example.com', {
      template: 'order_confirmed',
      subject: 'Test Subject',
      bodyText: 'Test Body',
    });

    assert.equal(result.success, true);
    assert.equal(result.isMocked, true);
    assert.ok(result.messageId?.startsWith('mock-brevo-'));
  });

  test('sanitizeErrorMessage strips email addresses, API tokens, and auth secrets', () => {
    const raw = 'Failed delivering to user@example.com with key re_1234567890abcdef and token Bearer eyJhbGciOi.';
    const sanitized = sanitizeErrorMessage(raw);

    assert.ok(!sanitized.includes('user@example.com'));
    assert.ok(sanitized.includes('[REDACTED_EMAIL]'));
    assert.ok(!sanitized.includes('re_1234567890abcdef'));
    assert.ok(sanitized.includes('[REDACTED_KEY]'));
    assert.ok(!sanitized.includes('Bearer eyJhbGciOi'));
    assert.ok(sanitized.includes('[REDACTED_AUTH]'));
  });

  test('Resend: handles HTTP 200 success and includes reply_to', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_live_key';
    process.env.EMAIL_REPLY_TO = 'support-desk@urdunovelbanks.com';

    let capturedPayload: any = null;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ id: 'resend-msg-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const result = await sendEmail('reader@example.com', {
      template: 'payment_verified',
      subject: 'Novel Unlocked',
      bodyText: 'Your novel is ready.',
    });

    assert.equal(result.success, true);
    assert.equal(result.messageId, 'resend-msg-123');
    assert.ok(capturedPayload.reply_to.includes('support-desk@urdunovelbanks.com'));
  });

  test('Resend: classifies HTTP 429 as rate_limited and parses retry-after header', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_live_key';

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Too many requests. Rate limit exceeded.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'retry-after': '45',
        },
      });
    }) as any;

    const result = await sendEmail('reader@example.com', {
      template: 'payment_verified',
      subject: 'Novel Unlocked',
      bodyText: 'Your novel is ready.',
    });

    assert.equal(result.success, false);
    assert.equal(result.errorCategory, 'rate_limited');
    assert.equal(result.retryAfterSeconds, 45);
  });

  test('Resend: classifies HTTP 429 with daily quota as daily_quota', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_live_key';

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Daily email quota limit reached for free plan.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const result = await sendEmail('reader@example.com', {
      template: 'payment_verified',
      subject: 'Novel Unlocked',
      bodyText: 'Your novel is ready.',
    });

    assert.equal(result.success, false);
    assert.equal(result.errorCategory, 'daily_quota');
    assert.equal(result.retryAfterSeconds, 21600); // 6 hours
  });

  test('Resend: classifies HTTP 422 as permanent validation failure', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_live_key';

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Invalid recipient email address format' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const result = await sendEmail('bad-address', {
      template: 'payment_verified',
      subject: 'Novel Unlocked',
      bodyText: 'Your novel is ready.',
    });

    assert.equal(result.success, false);
    assert.equal(result.errorCategory, 'permanent');
  });

  test('Resend: classifies HTTP 500 / 503 as temporary failure', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_live_key';

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Internal server error' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const result = await sendEmail('reader@example.com', {
      template: 'payment_verified',
      subject: 'Novel Unlocked',
      bodyText: 'Your novel is ready.',
    });

    assert.equal(result.success, false);
    assert.equal(result.errorCategory, 'temporary');
  });

  test('Resend: classifies network timeout as temporary failure', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_live_key';

    globalThis.fetch = (async () => {
      throw new Error('Connect timeout after 5000ms');
    }) as any;

    const result = await sendEmail('reader@example.com', {
      template: 'payment_verified',
      subject: 'Novel Unlocked',
      bodyText: 'Your novel is ready.',
    });

    assert.equal(result.success, false);
    assert.equal(result.errorCategory, 'temporary');
    assert.ok(result.error?.includes('Connect timeout'));
  });

  test('Brevo: handles HTTP 200 success and includes replyTo object', async () => {
    process.env.EMAIL_PROVIDER = 'brevo';
    process.env.BREVO_API_KEY = 'xkeysib-test-key';
    process.env.EMAIL_REPLY_TO = 'UNB Desk <desk@urdunovelbanks.com>';

    let capturedPayload: any = null;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ messageId: 'brevo-msg-456' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const result = await sendEmail('reader@example.com', {
      template: 'payment_verified',
      subject: 'Novel Unlocked',
      bodyText: 'Your novel is ready.',
    });

    assert.equal(result.success, true);
    assert.equal(result.messageId, 'brevo-msg-456');
    assert.equal(capturedPayload.replyTo.email, 'desk@urdunovelbanks.com');
    assert.equal(capturedPayload.replyTo.name, 'UNB Desk');
  });

  test('Brevo: classifies credits exhausted as daily_quota', async () => {
    process.env.EMAIL_PROVIDER = 'brevo';
    process.env.BREVO_API_KEY = 'xkeysib-test-key';

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ code: 'not_enough_credits', message: 'Not enough credits' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const result = await sendEmail('reader@example.com', {
      template: 'payment_verified',
      subject: 'Novel Unlocked',
      bodyText: 'Your novel is ready.',
    });

    assert.equal(result.success, false);
    assert.equal(result.errorCategory, 'daily_quota');
    assert.equal(result.retryAfterSeconds, 21600);
  });
});

describe('Database-Backed Rate Limiting Fallback & Isolation', () => {
  const testId = 'test-async-rl-user';

  test('checkRateLimitAsync functions seamlessly in fallback mode without active DB connection', async () => {
    await resetRateLimitAsync(testId);

    const res1 = await checkRateLimitAsync(testId, 3, 60000);
    assert.equal(res1.allowed, true);
    assert.equal(res1.remaining, 2);

    const res2 = await checkRateLimitAsync(testId, 3, 60000);
    assert.equal(res2.allowed, true);
    assert.equal(res2.remaining, 1);

    const res3 = await checkRateLimitAsync(testId, 3, 60000);
    assert.equal(res3.allowed, true);
    assert.equal(res3.remaining, 0);

    const res4 = await checkRateLimitAsync(testId, 3, 60000);
    assert.equal(res4.allowed, false);
    assert.equal(res4.remaining, 0);

    await resetRateLimitAsync(testId);
    const resAfterReset = await checkRateLimitAsync(testId, 3, 60000);
    assert.equal(resAfterReset.allowed, true);
    assert.equal(resAfterReset.remaining, 2);
  });
});

