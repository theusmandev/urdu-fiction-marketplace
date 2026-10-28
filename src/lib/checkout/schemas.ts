import { z } from 'zod';
import type { OrderStatus } from '@/types/database';

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const tidRegex = /^[a-zA-Z0-9_-]{6,40}$/;

export const uuidSchema = z
  .string()
  .trim()
  .regex(uuidRegex, 'Invalid identifier format');

export const createOrderFormSchema = z.object({
  novelId: uuidSchema,
  paymentMethodId: uuidSchema,
  termsAccepted: z.literal(true, {
    message: 'You must agree to the direct payment terms and refund policy to proceed.',
  }),
});

export type CreateOrderFormInput = z.infer<typeof createOrderFormSchema>;

export const paymentSubmissionFormSchema = z.object({
  orderId: uuidSchema,
  tid: z
    .string()
    .trim()
    .min(6, 'Transaction reference (TID) must be at least 6 characters')
    .max(40, 'Transaction reference (TID) cannot exceed 40 characters')
    .regex(
      tidRegex,
      'Transaction reference (TID) can only contain letters, numbers, hyphens, and underscores'
    ),
  claimedAmount: z.coerce
    .number()
    .positive('Payment amount must be greater than 0 PKR'),
  senderAccountName: z
    .string()
    .trim()
    .max(100, 'Sender account name cannot exceed 100 characters')
    .optional()
    .or(z.literal('')),
  readerNote: z
    .string()
    .trim()
    .max(500, 'Reader note cannot exceed 500 characters')
    .optional()
    .or(z.literal('')),
  screenshotPath: z
    .string()
    .trim()
    .min(1, 'Payment screenshot proof is required')
    .refine((val) => !val.includes('..'), {
      message: 'Invalid path format: path traversal is prohibited',
    })
    .refine(
      (val) => /^[0-9a-fA-F-]{36}\/[a-zA-Z0-9._-]+$/.test(val),
      {
        message: 'Screenshot path must be scoped to the order folder (<orderId>/<filename>)',
      }
    ),
});

export type PaymentSubmissionFormInput = z.infer<typeof paymentSubmissionFormSchema>;

export const openDisputeFormSchema = z.object({
  orderId: uuidSchema,
  reason: z
    .string()
    .trim()
    .min(10, 'Please describe your dispute in at least 10 characters')
    .max(1000, 'Dispute reason cannot exceed 1000 characters'),
});

export type OpenDisputeFormInput = z.infer<typeof openDisputeFormSchema>;

export const cancelOrderFormSchema = z.object({
  orderId: uuidSchema,
  reason: z
    .string()
    .trim()
    .max(300, 'Cancellation reason cannot exceed 300 characters')
    .optional()
    .or(z.literal('')),
});

export type CancelOrderFormInput = z.infer<typeof cancelOrderFormSchema>;

/**
 * Builds the canonical private bucket storage path for an order payment proof:
 * Format: `<orderId>/<uuid>.<ext>`
 */
export function buildScreenshotStoragePath(orderId: string, ext = 'webp'): string {
  const sanitizedExt = ext.replace(/^\./, '').toLowerCase() || 'webp';
  // Use crypto.randomUUID or fallback
  const uniqueId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15);
  return `${orderId}/${uniqueId}.${sanitizedExt}`;
}

/**
 * Validates transaction reference (TID) against marketplace rules:
 * - 6 to 40 characters
 * - Letters, digits, dash, underscore only
 */
export function validateTid(tid: string): { isValid: boolean; error?: string } {
  const clean = (tid || '').trim();
  if (!clean) {
    return { isValid: false, error: 'Transaction reference (TID) is required.' };
  }
  if (clean.length < 6) {
    return { isValid: false, error: 'Transaction reference (TID) must be at least 6 characters.' };
  }
  if (clean.length > 40) {
    return { isValid: false, error: 'Transaction reference (TID) cannot exceed 40 characters.' };
  }
  if (!tidRegex.test(clean)) {
    return {
      isValid: false,
      error: 'TID can only contain letters, numbers, hyphens (-), and underscores (_).',
    };
  }
  return { isValid: true };
}

/**
 * Validates claimed payment amount against order amount:
 * - Positive number
 * - Max 10x order amount
 * - Identifies mismatch
 */
export function validateClaimedAmount(
  orderAmount: number,
  claimedAmount: number
): { isValid: boolean; error?: string; isMismatch: boolean } {
  if (claimedAmount <= 0) {
    return { isValid: false, error: 'Claimed amount must be greater than 0 PKR.', isMismatch: true };
  }
  if (claimedAmount > orderAmount * 10) {
    return {
      isValid: false,
      error: `Claimed amount cannot exceed 10x the order amount (max PKR ${orderAmount * 10}).`,
      isMismatch: true,
    };
  }
  const isMismatch = Math.abs(claimedAmount - orderAmount) > 0.01;
  return { isValid: true, isMismatch };
}

/**
 * Maps database order status to user-friendly timeline step details
 */
export interface OrderStatusDetails {
  status: OrderStatus;
  stepNumber: number;
  label: string;
  urduLabel: string;
  badgeClass: string;
  headline: string;
  explanation: string;
  nextActor: 'reader' | 'writer' | 'admin' | 'none';
}

export function formatOrderStatusTimeline(status: OrderStatus): OrderStatusDetails {
  switch (status) {
    case 'pending_payment':
      return {
        status,
        stepNumber: 1,
        label: 'Awaiting Payment',
        urduLabel: 'ادائیگی کے منتظر',
        badgeClass: 'bg-warning/10 text-accent-strong border-warning-border/20',
        headline: 'Please transfer the payment to the author',
        explanation:
          'Transfer the exact amount to the author’s account shown below. After sending, submit your Transaction Reference (TID) and payment receipt screenshot.',
        nextActor: 'reader',
      };
    case 'payment_submitted':
      return {
        status,
        stepNumber: 2,
        label: 'Verification Pending',
        urduLabel: 'تصدیق زیر التوا',
        badgeClass: 'bg-info/10 text-info-text border-info-border/30',
        headline: 'Waiting for the author to verify receipt',
        explanation:
          'Your payment proof has been submitted. The author will check their bank/wallet account and confirm your order. Your novel access will unlock immediately upon verification.',
        nextActor: 'writer',
      };
    case 'verified':
      return {
        status,
        stepNumber: 3,
        label: 'Payment Verified',
        urduLabel: 'ادائیگی کی تصدیق ہو گئی',
        badgeClass: 'bg-success/10 text-success border-success-border/20',
        headline: 'Access Granted! Your novel is unlocked',
        explanation:
          'The author verified receipt of your payment. You hold a permanent purchase entitlement for this novel in your library.',
        nextActor: 'none',
      };
    case 'rejected':
      return {
        status,
        stepNumber: 2,
        label: 'Payment Not Verified',
        urduLabel: 'ادائیگی مسترد',
        badgeClass: 'bg-danger/10 text-danger-text border-danger-border/20',
        headline: 'The author could not verify your payment',
        explanation:
          'The author checked their bank statement and was unable to confirm receipt of funds for the submitted TID. Please review the reason below and resubmit with correct details or cancel.',
        nextActor: 'reader',
      };
    case 'disputed':
      return {
        status,
        stepNumber: 2,
        label: 'Under Dispute Review',
        urduLabel: 'تنازعہ زیر جائزہ',
        badgeClass: 'bg-info-soft text-info-text border-info-border/30',
        headline: 'Platform administrator is reviewing this order',
        explanation:
          'A dispute has been opened for this order. Our moderation team will inspect the banking proofs and resolve access fairly.',
        nextActor: 'admin',
      };
    case 'cancelled':
      return {
        status,
        stepNumber: 0,
        label: 'Order Cancelled',
        urduLabel: 'آرڈر منسوخ',
        badgeClass: 'bg-surface-muted text-text-muted border-border',
        headline: 'This order was cancelled',
        explanation: 'This order was cancelled before payment verification. No funds were captured.',
        nextActor: 'none',
      };
    case 'refunded_adjusted':
      return {
        status,
        stepNumber: 3,
        label: 'Refunded / Adjusted',
        urduLabel: 'رقم واپس / ایڈجسٹ',
        badgeClass: 'bg-surface-muted text-text-muted border-border',
        headline: 'Order refunded or adjusted',
        explanation:
          'An administrative adjustment or refund was processed for this order, and purchase entitlement has been revoked.',
        nextActor: 'none',
      };
    default:
      return {
        status,
        stepNumber: 1,
        label: status,
        urduLabel: 'زیر کار',
        badgeClass: 'bg-surface-muted text-text-muted border-border',
        headline: 'Order in progress',
        explanation: 'Your order is currently being processed.',
        nextActor: 'none',
      };
  }
}
