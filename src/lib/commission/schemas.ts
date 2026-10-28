import { z } from 'zod';
import type { CommissionInvoiceStatus } from '@/types/database';

/**
 * TID validation regex: 6 to 40 characters, alphanumeric, hyphen, underscore
 */
export const TID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export const reportCommissionPaymentSchema = z.object({
  invoiceId: z.string().uuid('Invalid invoice UUID'),
  amountPkr: z.coerce.number().positive('Payment amount must be greater than 0'),
  tid: z
    .string()
    .trim()
    .min(6, 'TID reference must be at least 6 characters')
    .max(40, 'TID reference cannot exceed 40 characters')
    .regex(TID_REGEX, 'TID must contain only letters, numbers, hyphens or underscores'),
  screenshotPath: z
    .string()
    .trim()
    .min(5, 'Proof screenshot path is required')
    .refine((p) => !p.includes('..'), 'Path traversal is not permitted'),
  writerNote: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional().nullable(),
});

export type ReportCommissionPaymentInput = z.infer<typeof reportCommissionPaymentSchema>;

export const confirmCommissionSettlementSchema = z.object({
  invoiceId: z.string().uuid('Invalid invoice UUID'),
  amountPkr: z.coerce.number().positive('Settlement confirmation amount must be positive'),
  reportId: z.string().uuid('Invalid report UUID').optional().nullable(),
  adminNote: z.string().trim().max(500, 'Admin note cannot exceed 500 characters').optional().nullable(),
});

export type ConfirmCommissionSettlementInput = z.infer<typeof confirmCommissionSettlementSchema>;

export const rejectCommissionReportSchema = z.object({
  reportId: z.string().uuid('Invalid report UUID'),
  reason: z.string().trim().min(3, 'Rejection reason must be at least 3 characters').max(500, 'Reason cannot exceed 500 characters'),
});

export type RejectCommissionReportInput = z.infer<typeof rejectCommissionReportSchema>;

export const recordCommissionAdjustmentSchema = z.object({
  writerId: z.string().uuid('Invalid author UUID'),
  amountPkr: z.coerce.number().refine((n) => n !== 0, 'Adjustment amount cannot be zero'),
  reason: z.string().trim().min(3, 'Justification reason is required').max(500, 'Reason cannot exceed 500 characters'),
});

export type RecordCommissionAdjustmentInput = z.infer<typeof recordCommissionAdjustmentSchema>;

export const voidCommissionInvoiceSchema = z.object({
  invoiceId: z.string().uuid('Invalid invoice UUID'),
  reason: z.string().trim().min(3, 'Void justification reason is required').max(500, 'Reason cannot exceed 500 characters'),
});

export type VoidCommissionInvoiceInput = z.infer<typeof voidCommissionInvoiceSchema>;

export const platformPaymentMethodSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  methodType: z.enum(['jazzcash', 'easypaisa', 'raast', 'bank_transfer']),
  accountTitle: z.string().trim().min(2, 'Account title must be at least 2 characters').max(100),
  accountNumberOrIban: z.string().trim().min(5, 'Account number or IBAN is required').max(50),
  bankName: z.string().trim().max(100).optional().nullable(),
  instructionsNote: z.string().trim().max(500).optional().nullable(),
});

export type PlatformPaymentMethodInput = z.infer<typeof platformPaymentMethodSchema>;

export function getInvoiceStatusMeta(status: CommissionInvoiceStatus): {
  label: string;
  badgeClass: string;
  description: string;
} {
  switch (status) {
    case 'invoiced':
    case 'open':
      return {
        label: 'Awaiting Payment',
        badgeClass: 'bg-warning/15 text-warning-text border-warning-border/30',
        description: 'Invoice issued. Waiting for writer to transfer platform fee.',
      };
    case 'payment_reported':
      return {
        label: 'Claim Submitted',
        badgeClass: 'bg-info-soft text-info-text border-info-border/30',
        description: 'Author has reported payment. Awaiting administrator verification.',
      };
    case 'partially_paid':
      return {
        label: 'Partially Paid',
        badgeClass: 'bg-primary/10 text-primary border-primary/20',
        description: 'Installment payment confirmed. Remaining balance due.',
      };
    case 'settled':
      return {
        label: 'Fully Settled',
        badgeClass: 'bg-success/15 text-success border-success-border/30',
        description: 'Platform fee payment confirmed and reconciled.',
      };
    case 'void':
      return {
        label: 'Voided',
        badgeClass: 'bg-surface-muted text-text-muted border-border/30',
        description: 'Invoice cancelled and lines released for re-billing.',
      };
    case 'disputed':
      return {
        label: 'Under Dispute',
        badgeClass: 'bg-danger/15 text-danger-text border-danger-border/30',
        description: 'Disputed billing period under review.',
      };
    default:
      return {
        label: status,
        badgeClass: 'bg-surface-muted text-text-muted border-border/30',
        description: '',
      };
  }
}
