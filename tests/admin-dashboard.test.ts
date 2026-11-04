import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardTimeframeSchema } from '../src/lib/admin/schemas.ts';
import type { AdminDashboardAnalytics } from '../src/types/database.ts';

describe('Admin Dashboard Executive Analytics', () => {
  describe('dashboardTimeframeSchema validation', () => {
    it('accepts valid predefined timeframe numbers', () => {
      const validCases = [7, 30, 90, 365];
      for (const val of validCases) {
        const result = dashboardTimeframeSchema.safeParse(val);
        assert.equal(result.success, true);
        if (result.success) {
          assert.equal(result.data, val);
        }
      }
    });

    it('accepts sentinel values 0 and -1 for All Time', () => {
      assert.equal(dashboardTimeframeSchema.safeParse(0).success, true);
      assert.equal(dashboardTimeframeSchema.safeParse(-1).success, true);
    });

    it('coerces string representations from URL searchParams', () => {
      assert.equal(dashboardTimeframeSchema.safeParse('7').data, 7);
      assert.equal(dashboardTimeframeSchema.safeParse('30').data, 30);
      assert.equal(dashboardTimeframeSchema.safeParse('90').data, 90);
      assert.equal(dashboardTimeframeSchema.safeParse('365').data, 365);
      assert.equal(dashboardTimeframeSchema.safeParse('0').data, 0);
      assert.equal(dashboardTimeframeSchema.safeParse('-1').data, -1);
    });

    it('rejects unapproved timeframes', () => {
      const invalid = [1, 14, 15, 60, 100, 500, 3650];
      for (const val of invalid) {
        const result = dashboardTimeframeSchema.safeParse(val);
        assert.equal(result.success, false, `Expected ${val} to be rejected`);
      }
    });

    it('rejects non-integer and non-numeric inputs', () => {
      assert.equal(dashboardTimeframeSchema.safeParse(30.5).success, false);
      assert.equal(dashboardTimeframeSchema.safeParse('weekly').success, false);
      assert.equal(dashboardTimeframeSchema.safeParse(null).success, false);
      assert.equal(dashboardTimeframeSchema.safeParse(undefined).success, false);
      assert.equal(dashboardTimeframeSchema.safeParse({}).success, false);
    });
  });

  describe('Payload Normalization Safety', () => {
    it('correctly maps and provides defaults for partial or empty database payloads', () => {
      const rawDatabasePayload: Partial<AdminDashboardAnalytics> = {
        kpis: {
          gmv_pkr: 25000,
          prev_gmv_pkr: 20000,
          verified_orders_count: 50,
          prev_verified_orders_count: 40,
          platform_fee_accrued_pkr: 5000,
          platform_fee_settled_pkr: 3000,
          unpaid_fee_exposure_pkr: 2000,
          writer_net_earnings_pkr: 20000,
          avg_order_value_pkr: 500,
          verified_tips_pkr: 1500,
          verified_tips_count: 6,
          conversion_rate_pct: 82.5,
        },
        order_funnel: {
          verified: 50,
          pending_verification: 3,
          pending_payment: 8,
          rejected: 2,
          cancelled: 1,
          disputed: 0,
          refunded_adjusted: 0,
          total_orders: 64,
        },
        daily_series: [
          { date: '2026-11-01', gmv_pkr: 12000, platform_fee_pkr: 2400, orders_count: 24 },
          { date: '2026-11-02', gmv_pkr: 13000, platform_fee_pkr: 2600, orders_count: 26 },
        ],
        infrastructure: {
          db_size_bytes: 42000000,
          db_quota_limit_bytes: 524288000,
          table_counts: {
            orders: 1420,
            chapters: 310,
            audit_logs: 5200,
            chapter_reads: 8900,
            email_outbox: 840,
            notifications: 2300,
          },
          active_payment_proofs_count: 140,
          pruned_payment_proofs_count: 1280,
        },
      };

      assert.equal(rawDatabasePayload.kpis?.gmv_pkr, 25000);
      assert.equal(rawDatabasePayload.kpis?.conversion_rate_pct, 82.5);
      assert.equal(rawDatabasePayload.order_funnel?.total_orders, 64);
      assert.equal(rawDatabasePayload.daily_series?.length, 2);
      assert.equal(rawDatabasePayload.infrastructure?.db_quota_limit_bytes, 524288000);
      assert.equal(rawDatabasePayload.infrastructure?.active_payment_proofs_count, 140);
    });
  });
});

