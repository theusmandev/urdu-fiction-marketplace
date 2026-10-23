import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTid,
  validateClaimedAmount,
  buildScreenshotStoragePath,
  paymentSubmissionFormSchema,
  createOrderFormSchema,
  formatOrderStatusTimeline,
} from '../src/lib/checkout/schemas.ts';

describe('Checkout & Payment Submission Schemas', () => {
  describe('validateTid & TID Schema', () => {
    it('accepts valid alphanumeric, hyphenated, and underscored TIDs (6 to 40 chars)', () => {
      const validTids = [
        'JC123456',
        'EP-987654321',
        'RAAST_PK_998877',
        'TID-1234-5678-ABCD',
        'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0', // 40 chars
      ];

      for (const tid of validTids) {
        const check = validateTid(tid);
        assert.equal(check.isValid, true, `Expected valid TID: ${tid}`);
      }
    });

    it('rejects TIDs shorter than 6 characters', () => {
      const check = validateTid('12345');
      assert.equal(check.isValid, false);
      assert.match(check.error || '', /at least 6 characters/i);
    });

    it('rejects TIDs longer than 40 characters', () => {
      const longTid = 'A'.repeat(41);
      const check = validateTid(longTid);
      assert.equal(check.isValid, false);
      assert.match(check.error || '', /cannot exceed 40 characters/i);
    });

    it('rejects TIDs containing special characters or spaces', () => {
      const invalidTids = [
        'TID 123456',
        'TID#123456',
        'TID@EP!',
        'TID.123456',
        '<script>alert(1)</script>',
      ];

      for (const tid of invalidTids) {
        const check = validateTid(tid);
        assert.equal(check.isValid, false, `Expected invalid TID: ${tid}`);
      }
    });
  });

  describe('validateClaimedAmount', () => {
    it('accepts exact amount and flags no mismatch', () => {
      const res = validateClaimedAmount(500, 500);
      assert.equal(res.isValid, true);
      assert.equal(res.isMismatch, false);
    });

    it('accepts mismatched amount but flags isMismatch = true', () => {
      const res = validateClaimedAmount(500, 450);
      assert.equal(res.isValid, true);
      assert.equal(res.isMismatch, true);
    });

    it('rejects zero or negative amounts', () => {
      const zero = validateClaimedAmount(500, 0);
      assert.equal(zero.isValid, false);

      const negative = validateClaimedAmount(500, -100);
      assert.equal(negative.isValid, false);
    });

    it('rejects amounts exceeding 10x the order amount', () => {
      const tooHigh = validateClaimedAmount(500, 5001);
      assert.equal(tooHigh.isValid, false);
      assert.match(tooHigh.error || '', /cannot exceed 10x/i);
    });
  });

  describe('buildScreenshotStoragePath & Path Validation', () => {
    it('builds canonical order-scoped screenshot paths', () => {
      const orderId = '11111111-2222-3333-4444-555555555555';
      const path = buildScreenshotStoragePath(orderId, 'webp');
      assert.match(path, /^11111111-2222-3333-4444-555555555555\/[a-zA-Z0-9-]+\.webp$/);
    });

    it('rejects path traversal attempts in paymentSubmissionFormSchema', () => {
      const orderId = '11111111-2222-3333-4444-555555555555';
      const invalid = paymentSubmissionFormSchema.safeParse({
        orderId,
        tid: 'JC-12345678',
        claimedAmount: 500,
        screenshotPath: `${orderId}/../malicious.webp`,
      });
      assert.equal(invalid.success, false);
    });

    it('rejects screenshot paths with wrong folder scoping', () => {
      const orderId = '11111111-2222-3333-4444-555555555555';
      const invalid = paymentSubmissionFormSchema.safeParse({
        orderId,
        tid: 'JC-12345678',
        claimedAmount: 500,
        screenshotPath: 'other-folder/proof.webp',
      });
      assert.equal(invalid.success, false);
    });
  });

  describe('createOrderFormSchema', () => {
    it('accepts valid inputs with terms accepted', () => {
      const valid = createOrderFormSchema.safeParse({
        novelId: '11111111-1111-1111-1111-111111111111',
        paymentMethodId: '22222222-2222-2222-2222-222222222222',
        termsAccepted: true,
      });
      assert.equal(valid.success, true);
    });

    it('rejects when termsAccepted is false or omitted', () => {
      const invalid = createOrderFormSchema.safeParse({
        novelId: '11111111-1111-1111-1111-111111111111',
        paymentMethodId: '22222222-2222-2222-2222-222222222222',
        termsAccepted: false,
      });
      assert.equal(invalid.success, false);
    });
  });

  describe('formatOrderStatusTimeline', () => {
    it('returns appropriate timeline metadata for all order statuses', () => {
      const statuses = [
        'pending_payment',
        'payment_submitted',
        'verified',
        'rejected',
        'disputed',
        'cancelled',
        'refunded_adjusted',
      ] as const;

      for (const st of statuses) {
        const details = formatOrderStatusTimeline(st);
        assert.equal(details.status, st);
        assert.ok(details.label.length > 0);
        assert.ok(details.urduLabel.length > 0);
        assert.ok(details.explanation.length > 0);
      }
    });
  });
});
