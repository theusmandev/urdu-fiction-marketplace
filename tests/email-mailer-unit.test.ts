import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail } from '../src/lib/email/mailer.ts';
import { checkRateLimitAsync, resetRateLimitAsync } from '../src/lib/writer/rate-limit.ts';

describe('HTTP Email Mailer (Resend & Brevo REST API)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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

