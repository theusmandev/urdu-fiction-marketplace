import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { retentionSettingsSchema } from '../src/lib/admin/schemas.ts';
import {
  extractProofStorageKey,
  cleanupOldPaymentProofFiles,
} from '../src/lib/retention/storage-cleanup.ts';

describe('Data Retention Settings & Storage Cleanup', () => {
  describe('retentionSettingsSchema validation', () => {
    it('accepts valid retention configurations with all 8 categories', () => {
      const valid = {
        retention_audit_logs_days: 30,
        retention_chapter_reads_days: 7,
        retention_chapter_revisions_days: 30,
        retention_email_outbox_days: 30,
        retention_notifications_days: 30,
        retention_rate_limits_days: 2,
        retention_chapter_drafts_days: 90,
        retention_payment_proofs_days: 90,
      };

      const result = retentionSettingsSchema.safeParse(valid);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.retention_audit_logs_days, 30);
        assert.equal(result.data.retention_rate_limits_days, 2);
      }
    });

    it('accepts unlimited / never delete sentinel value (-1) for any category', () => {
      const unlimited = {
        retention_audit_logs_days: -1,
        retention_chapter_reads_days: -1,
        retention_chapter_revisions_days: -1,
        retention_email_outbox_days: -1,
        retention_notifications_days: -1,
        retention_rate_limits_days: -1,
        retention_chapter_drafts_days: -1,
        retention_payment_proofs_days: -1,
      };

      const result = retentionSettingsSchema.safeParse(unlimited);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.retention_audit_logs_days, -1);
        assert.equal(result.data.retention_payment_proofs_days, -1);
      }
    });

    it('coerces string representations from form inputs', () => {
      const stringified = {
        retention_audit_logs_days: '60',
        retention_chapter_reads_days: '14',
        retention_chapter_revisions_days: '45',
        retention_email_outbox_days: '30',
        retention_notifications_days: '90',
        retention_rate_limits_days: '3',
        retention_chapter_drafts_days: '180',
        retention_payment_proofs_days: '365',
      };

      const result = retentionSettingsSchema.safeParse(stringified);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.retention_audit_logs_days, 60);
        assert.equal(result.data.retention_chapter_drafts_days, 180);
      }
    });

    it('rejects values below -1', () => {
      const invalid = {
        retention_audit_logs_days: -2,
        retention_chapter_reads_days: 7,
        retention_chapter_revisions_days: 30,
        retention_email_outbox_days: 30,
        retention_notifications_days: 30,
        retention_rate_limits_days: 2,
        retention_chapter_drafts_days: 90,
        retention_payment_proofs_days: 90,
      };

      const result = retentionSettingsSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it('rejects values exceeding 3650 days (10 years)', () => {
      const invalid = {
        retention_audit_logs_days: 3651,
        retention_chapter_reads_days: 7,
        retention_chapter_revisions_days: 30,
        retention_email_outbox_days: 30,
        retention_notifications_days: 30,
        retention_rate_limits_days: 2,
        retention_chapter_drafts_days: 90,
        retention_payment_proofs_days: 90,
      };

      const result = retentionSettingsSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it('rejects non-integer float days', () => {
      const invalid = {
        retention_audit_logs_days: 30.5,
        retention_chapter_reads_days: 7,
        retention_chapter_revisions_days: 30,
        retention_email_outbox_days: 30,
        retention_notifications_days: 30,
        retention_rate_limits_days: 2,
        retention_chapter_drafts_days: 90,
        retention_payment_proofs_days: 90,
      };

      const result = retentionSettingsSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });
  });

  describe('extractProofStorageKey', () => {
    it('extracts relative path from full Supabase storage URL', () => {
      const url =
        'https://supabase.example.com/storage/v1/object/public/payment-proofs/order-uuid/proof.png';
      const key = extractProofStorageKey(url);
      assert.equal(key, 'order-uuid/proof.png');
    });

    it('strips query parameters from signed or transformed URLs', () => {
      const url =
        'https://supabase.example.com/storage/v1/object/sign/payment-proofs/tips/receipt_123.jpg?token=abcdef12345';
      const key = extractProofStorageKey(url);
      assert.equal(key, 'tips/receipt_123.jpg');
    });

    it('handles relative storage keys with leading slashes', () => {
      assert.equal(
        extractProofStorageKey('/folder-1/receipt.webp'),
        'folder-1/receipt.webp'
      );
      assert.equal(
        extractProofStorageKey('folder-1/receipt.webp'),
        'folder-1/receipt.webp'
      );
    });

    it('returns null for already-pruned markers or empty strings', () => {
      assert.equal(
        extractProofStorageKey('[PRUNED_BY_RETENTION_POLICY]'),
        null
      );
      assert.equal(extractProofStorageKey(''), null);
      assert.equal(extractProofStorageKey('   '), null);
    });
  });

  describe('cleanupOldPaymentProofFiles sentinel bypass', () => {
    it('skips deletion and returns 0 deletedFiles when retentionDays is <= 0 (unlimited)', async () => {
      const result = await cleanupOldPaymentProofFiles({ retentionDays: -1 });
      assert.equal(result.success, true);
      assert.equal(result.deletedFiles, 0);
      assert.match(result.message || '', /unlimited/i);

      const resultZero = await cleanupOldPaymentProofFiles({ retentionDays: 0 });
      assert.equal(resultZero.success, true);
      assert.equal(resultZero.deletedFiles, 0);
    });
  });
});

