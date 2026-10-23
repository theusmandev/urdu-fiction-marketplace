import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeCsvCell, generateCsvContent } from '../src/lib/commission/csv.ts';
import { getKarachiMonthBounds, formatKarachiDateTime, formatPKR2 } from '../src/lib/commission/time.ts';
import {
  reportCommissionPaymentSchema,
  confirmCommissionSettlementSchema,
  recordCommissionAdjustmentSchema,
  getInvoiceStatusMeta,
} from '../src/lib/commission/schemas.ts';

describe('Commission & Settlement Domain Helpers', () => {
  describe('CSV Export & Formula Injection Prevention', () => {
    it('neutralizes formula injection triggers (=, +, -, @) with single quote prefix', () => {
      assert.strictEqual(escapeCsvCell('=1+1'), '"\'=1+1"');
      assert.strictEqual(escapeCsvCell('+923001234567'), '"\'+923001234567"');
      assert.strictEqual(escapeCsvCell('-200.00'), '"\'-200.00"');
      assert.strictEqual(escapeCsvCell('@SUM(A1:A10)'), '"\'@SUM(A1:A10)"');
    });

    it('escapes standard values and internal quotes properly', () => {
      assert.strictEqual(escapeCsvCell('Alpha "Tale" Novel'), '"Alpha ""Tale"" Novel"');
      assert.strictEqual(escapeCsvCell(500.5), '"500.5"');
      assert.strictEqual(escapeCsvCell(null), '""');
      assert.strictEqual(escapeCsvCell(undefined), '""');
    });

    it('builds complete CSV lines properly', () => {
      const headers = ['Order Number', 'Amount', 'Status'];
      const row = ['ORD-12345', 1000, 'verified'];
      const csv = generateCsvContent(headers, [row]);

      assert.ok(csv.includes('"Order Number","Amount","Status"'));
      assert.ok(csv.includes('"ORD-12345","1000","verified"'));
    });
  });

  describe('Asia/Karachi Period Boundaries & Formatting', () => {
    it('calculates 31-day month boundaries accurately in Karachi time', () => {
      const bounds = getKarachiMonthBounds(2026, 1); // January 2026
      assert.strictEqual(bounds.periodStartIso, '2026-01-01T00:00:00+05:00');
      assert.strictEqual(bounds.periodEndIso, '2026-01-31T23:59:59.999+05:00');
      assert.strictEqual(bounds.label, 'January 2026');
    });

    it('calculates February boundaries in non-leap year (28 days)', () => {
      const bounds = getKarachiMonthBounds(2026, 2); // February 2026
      assert.strictEqual(bounds.periodStartIso, '2026-02-01T00:00:00+05:00');
      assert.strictEqual(bounds.periodEndIso, '2026-02-28T23:59:59.999+05:00');
    });

    it('formats PKR with 2 decimal places consistently', () => {
      assert.strictEqual(formatPKR2(500), 'PKR 500.00');
      assert.strictEqual(formatPKR2(1234.5), 'PKR 1,234.50');
      assert.strictEqual(formatPKR2(0), 'PKR 0.00');
      assert.strictEqual(formatPKR2(null), 'PKR 0.00');
    });

    it('formats Karachi datetime string with PKT timezone', () => {
      const formatted = formatKarachiDateTime('2026-10-23T12:00:00Z', true);
      assert.ok(formatted.includes('2026'));
      assert.ok(formatted.includes('pm') || formatted.includes('PM'));
    });
  });

  describe('Commission Schemas Validation', () => {
    const validUuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    it('validates correct payment reporting input', () => {
      const input = {
        invoiceId: validUuid,
        amountPkr: 500,
        tid: 'JC-12345678-ABCD',
        screenshotPath: `${validUuid}/proof.webp`,
        writerNote: 'Paid via JazzCash app',
      };
      const result = reportCommissionPaymentSchema.safeParse(input);
      assert.strictEqual(result.success, true);
    });

    it('rejects TID shorter than 6 characters or with spaces', () => {
      const input = {
        invoiceId: validUuid,
        amountPkr: 500,
        tid: '12345',
        screenshotPath: `${validUuid}/proof.webp`,
      };
      const result = reportCommissionPaymentSchema.safeParse(input);
      assert.strictEqual(result.success, false);

      const inputWithSpaces = { ...input, tid: 'JC 123456' };
      assert.strictEqual(reportCommissionPaymentSchema.safeParse(inputWithSpaces).success, false);
    });

    it('rejects path traversal in screenshotPath', () => {
      const input = {
        invoiceId: validUuid,
        amountPkr: 500,
        tid: 'JC-12345678',
        screenshotPath: `${validUuid}/../etc/passwd`,
      };
      const result = reportCommissionPaymentSchema.safeParse(input);
      assert.strictEqual(result.success, false);
    });

    it('validates settlement confirmation input', () => {
      const input = {
        invoiceId: validUuid,
        amountPkr: 250.5,
        adminNote: 'Verified bank statement deposit',
      };
      assert.strictEqual(confirmCommissionSettlementSchema.safeParse(input).success, true);
    });

    it('rejects zero amount adjustments', () => {
      const input = {
        writerId: validUuid,
        amountPkr: 0,
        reason: 'Zero adjustment test',
      };
      assert.strictEqual(recordCommissionAdjustmentSchema.safeParse(input).success, false);
    });

    it('provides descriptive meta for all invoice statuses', () => {
      assert.strictEqual(getInvoiceStatusMeta('invoiced').label, 'Awaiting Payment');
      assert.strictEqual(getInvoiceStatusMeta('payment_reported').label, 'Claim Submitted');
      assert.strictEqual(getInvoiceStatusMeta('settled').label, 'Fully Settled');
      assert.strictEqual(getInvoiceStatusMeta('partially_paid').label, 'Partially Paid');
      assert.strictEqual(getInvoiceStatusMeta('void').label, 'Voided');
    });
  });
});
