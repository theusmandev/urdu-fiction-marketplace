import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeEmailContent,
  renderEmailTemplate,
} from '../src/lib/email/templates.ts';
import { verifyCronAuth, type CronRequestLike } from '../src/lib/cron/auth.ts';
import {
  getDisputeStatusMeta,
  getRefundStatusMeta,
  getSupportStatusMeta,
  calculateDisputeWaitStatus,
  mapDisputeErrorMessage,
} from '../src/lib/disputes/status-meta.ts';

function createMockRequest(headers: Record<string, string>): CronRequestLike {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    normalized[k.toLowerCase()] = v;
  }
  return {
    headers: {
      get(name: string) {
        return normalized[name.toLowerCase()] ?? null;
      },
    },
  };
}

describe('Disputes, Refunds, and Email Domain Helpers', () => {
  describe('Email Content Sanitization (Non-Sensitive Invariant)', () => {
    it('masks Pakistani IBAN numbers strictly', () => {
      const raw = 'Please note payment was sent to PK36SCBL0000001123456701 for novel purchase.';
      const sanitized = sanitizeEmailContent(raw);
      assert.ok(!sanitized.includes('PK36SCBL0000001123456701'));
      assert.ok(sanitized.includes('[REDACTED_ACCOUNT]'));
    });

    it('masks raw numeric account numbers and long TIDs (>= 9 digits)', () => {
      const raw = 'Reader TID is 987654321098 and phone account 0300123456789.';
      const sanitized = sanitizeEmailContent(raw);
      assert.ok(!sanitized.includes('987654321098'));
      assert.ok(!sanitized.includes('0300123456789'));
      assert.ok(sanitized.includes('[REDACTED_NUMERIC_ID]'));
    });

    it('strips private payment-proof storage links', () => {
      const raw = 'Proof uploaded at https://xyz.supabase.co/storage/v1/object/sign/payment-proofs/abc/proof.jpg?token=secret123';
      const sanitized = sanitizeEmailContent(raw);
      assert.ok(!sanitized.includes('payment-proofs/abc/proof.jpg'));
      assert.ok(sanitized.includes('[SECURE_PORTAL_PROOF_LINK]'));
    });

    it('preserves order numbers, amounts in PKR, and safe operational text', () => {
      const raw = 'Your order #ORD-2026-1024 for PKR 750 has been received. Please review your account.';
      const sanitized = sanitizeEmailContent(raw);
      assert.ok(sanitized.includes('#ORD-2026-1024'));
      assert.ok(sanitized.includes('PKR 750'));
    });
  });

  describe('Email Template Rendering', () => {
    it('renders branded HTML and text with notification preferences link', () => {
      const rendered = renderEmailTemplate({
        template: 'dispute_opened',
        subject: 'Dispute opened on Order #ORD-100',
        bodyText: 'A dispute has been raised. Visit the portal to inspect.',
        recipientEmail: 'reader@example.com',
      });

      assert.ok(rendered.text.includes('UNB Premium'));
      assert.ok(rendered.text.includes('/account/notifications'));
      assert.ok(rendered.html.includes('UNB PREMIUM'));
      assert.ok(rendered.html.includes('/account/notifications'));
      // No tracking pixels
      assert.ok(!rendered.html.includes('<img src='));
    });
  });

  describe('Constant-Time Cron Authentication Helper', () => {
    const originalEnv = process.env.CRON_SECRET;

    it('rejects requests when CRON_SECRET is not configured on server', () => {
      delete process.env.CRON_SECRET;
      const req = createMockRequest({ authorization: 'Bearer some_secret' });
      const result = verifyCronAuth(req);
      assert.strictEqual(result.authorized, false);
      assert.ok(result.reason?.includes('not configured'));
    });

    it('rejects requests missing Authorization header or malformed scheme', () => {
      process.env.CRON_SECRET = 'super-secret-cron-token-12345';

      const noHeaderReq = createMockRequest({});
      assert.strictEqual(verifyCronAuth(noHeaderReq).authorized, false);

      const basicReq = createMockRequest({ authorization: 'Basic dXNlcjpwYXNz' });
      assert.strictEqual(verifyCronAuth(basicReq).authorized, false);
    });

    it('rejects invalid secrets and accepts correct secret in constant time', () => {
      process.env.CRON_SECRET = 'valid-production-secret-998877';

      const wrongReq = createMockRequest({ authorization: 'Bearer wrong-secret-token' });
      assert.strictEqual(verifyCronAuth(wrongReq).authorized, false);

      const validReq = createMockRequest({ authorization: 'Bearer valid-production-secret-998877' });
      assert.strictEqual(verifyCronAuth(validReq).authorized, true);

      // Restore env
      if (originalEnv) {
        process.env.CRON_SECRET = originalEnv;
      } else {
        delete process.env.CRON_SECRET;
      }
    });
  });

  describe('Dispute Wait Period Calculation', () => {
    it('correctly reports canDispute=false and calculates remaining hours when within wait period', () => {
      const now = Date.now();
      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
      const waitHours = 24;

      const result = calculateDisputeWaitStatus(twoHoursAgo, waitHours);
      assert.strictEqual(result.canDispute, false);
      assert.strictEqual(result.remainingHours, 21); // 24 - 2 = 22 minus fraction
      assert.ok(result.remainingMinutes > 0);
    });

    it('allows dispute when wait period has elapsed', () => {
      const now = Date.now();
      const twentyFiveHoursAgo = new Date(now - 25 * 60 * 60 * 1000).toISOString();
      const waitHours = 24;

      const result = calculateDisputeWaitStatus(twentyFiveHoursAgo, waitHours);
      assert.strictEqual(result.canDispute, true);
      assert.strictEqual(result.remainingHours, 0);
      assert.strictEqual(result.remainingMinutes, 0);
    });
  });

  describe('Error Message Mapping', () => {
    it('maps database rate limit and validation errors to friendly text', () => {
      assert.strictEqual(
        mapDisputeErrorMessage('Rate limit exceeded: You cannot send more than 20 messages per hour.'),
        'Rate limit reached: You can send at most 20 messages per hour on this thread.'
      );

      assert.strictEqual(
        mapDisputeErrorMessage('Rate limit exceeded: You cannot submit more than 5 support requests per day.'),
        'Rate limit reached: You cannot submit more than 5 support requests in a 24-hour period.'
      );

      assert.strictEqual(
        mapDisputeErrorMessage('Dispute wait period has not elapsed (must wait at least 24 hours).'),
        'You must wait before opening a dispute to give the writer time to verify your bank deposit.'
      );

      assert.strictEqual(
        mapDisputeErrorMessage('A pending refund request already exists for this order.'),
        'A pending refund request is already being reviewed by administrators for this order.'
      );
    });
  });

  describe('Status Metadata Dictionaries', () => {
    it('returns appropriate variants and Urdu translations for dispute statuses', () => {
      const openMeta = getDisputeStatusMeta('open');
      assert.strictEqual(openMeta.variant, 'warning');
      assert.strictEqual(openMeta.urduLabel, 'زیرِ تنازع');

      const resolvedReader = getDisputeStatusMeta('resolved_for_reader');
      assert.strictEqual(resolvedReader.variant, 'success');

      const refundPending = getRefundStatusMeta('pending');
      assert.strictEqual(refundPending.variant, 'warning');

      const supportAnswered = getSupportStatusMeta('answered');
      assert.strictEqual(supportAnswered.variant, 'success');
    });
  });
});
