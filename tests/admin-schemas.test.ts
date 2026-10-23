import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  platformSettingsSchema,
  writerCommissionTermsSchema,
  adminUpdateUserRoleStatusSchema,
  createGenreSchema,
  suspendNovelSchema,
} from '../src/lib/admin/schemas.ts';

describe('Admin Validation Schemas (Zod)', () => {
  describe('platformSettingsSchema', () => {
    it('accepts valid platform settings', () => {
      const valid = {
        defaultCommissionRate: 20,
        defaultUnpaidCommissionLimit: 5000,
        disputeWindowDays: 14,
        maxNovelPricePkr: 50000,
        supportEmail: 'admin@unbpremium.pk',
      };
      const result = platformSettingsSchema.safeParse(valid);
      assert.equal(result.success, true);
    });

    it('rejects commission rate over 100% or below 0%', () => {
      const tooHigh = platformSettingsSchema.safeParse({
        defaultCommissionRate: 101,
        defaultUnpaidCommissionLimit: 5000,
        disputeWindowDays: 14,
        maxNovelPricePkr: 50000,
        supportEmail: 'admin@unbpremium.pk',
      });
      assert.equal(tooHigh.success, false);

      const negative = platformSettingsSchema.safeParse({
        defaultCommissionRate: -1,
        defaultUnpaidCommissionLimit: 5000,
        disputeWindowDays: 14,
        maxNovelPricePkr: 50000,
        supportEmail: 'admin@unbpremium.pk',
      });
      assert.equal(negative.success, false);
    });

    it('rejects invalid dispute window (< 1 or > 365)', () => {
      const zeroDays = platformSettingsSchema.safeParse({
        defaultCommissionRate: 20,
        defaultUnpaidCommissionLimit: 5000,
        disputeWindowDays: 0,
        maxNovelPricePkr: 50000,
        supportEmail: 'admin@unbpremium.pk',
      });
      assert.equal(zeroDays.success, false);

      const tooLong = platformSettingsSchema.safeParse({
        defaultCommissionRate: 20,
        defaultUnpaidCommissionLimit: 5000,
        disputeWindowDays: 400,
        maxNovelPricePkr: 50000,
        supportEmail: 'admin@unbpremium.pk',
      });
      assert.equal(tooLong.success, false);
    });

    it('rejects invalid support email', () => {
      const invalidEmail = platformSettingsSchema.safeParse({
        defaultCommissionRate: 20,
        defaultUnpaidCommissionLimit: 5000,
        disputeWindowDays: 7,
        maxNovelPricePkr: 50000,
        supportEmail: 'not-an-email',
      });
      assert.equal(invalidEmail.success, false);
    });
  });

  describe('writerCommissionTermsSchema', () => {
    it('accepts valid terms and transforms empty custom rate to null', () => {
      const valid = writerCommissionTermsSchema.safeParse({
        writerId: '11111111-1111-1111-1111-111111111111',
        customCommissionRate: '',
        unpaidCommissionLimit: '8000',
        reason: 'Adjusting standard limit',
      });
      assert.equal(valid.success, true);
      if (valid.success) {
        assert.equal(valid.data.customCommissionRate, null);
        assert.equal(valid.data.unpaidCommissionLimit, 8000);
      }
    });

    it('rejects without mandatory reason', () => {
      const noReason = writerCommissionTermsSchema.safeParse({
        writerId: '11111111-1111-1111-1111-111111111111',
        customCommissionRate: 15,
        unpaidCommissionLimit: 5000,
        reason: '   ',
      });
      assert.equal(noReason.success, false);
    });
  });

  describe('adminUpdateUserRoleStatusSchema', () => {
    it('accepts valid role and active status update', () => {
      const valid = adminUpdateUserRoleStatusSchema.safeParse({
        userId: '22222222-2222-2222-2222-222222222222',
        role: 'writer',
        isActive: true,
        reason: 'Approved via background verification',
      });
      assert.equal(valid.success, true);
    });

    it('rejects invalid role', () => {
      const invalid = adminUpdateUserRoleStatusSchema.safeParse({
        userId: '22222222-2222-2222-2222-222222222222',
        role: 'superman',
        isActive: true,
        reason: 'Testing invalid role',
      });
      assert.equal(invalid.success, false);
    });

    it('requires a justification reason', () => {
      const blankReason = adminUpdateUserRoleStatusSchema.safeParse({
        userId: '22222222-2222-2222-2222-222222222222',
        role: 'admin',
        isActive: true,
        reason: '',
      });
      assert.equal(blankReason.success, false);
    });
  });

  describe('createGenreSchema & suspendNovelSchema', () => {
    it('validates genre creation and sanitized slugs', () => {
      const valid = createGenreSchema.safeParse({
        nameEnglish: 'Historical Fiction',
        nameUrdu: 'تاریخی افسانہ',
        slug: 'historical-fiction',
        displayOrder: '3',
      });
      assert.equal(valid.success, true);
      if (valid.success) {
        assert.equal(valid.data.displayOrder, 3);
      }
    });

    it('rejects invalid slug characters in genre', () => {
      const invalidSlug = createGenreSchema.safeParse({
        nameEnglish: 'Mystery',
        nameUrdu: 'معمہ',
        slug: 'Mystery & Crime!',
      });
      assert.equal(invalidSlug.success, false);
    });

    it('enforces mandatory reason for novel suspension', () => {
      const missingReason = suspendNovelSchema.safeParse({
        novelId: '33333333-3333-3333-3333-333333333333',
        reason: 'no',
      });
      assert.equal(missingReason.success, false);
    });
  });
});
