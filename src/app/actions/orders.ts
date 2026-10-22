'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth, requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';

export interface OrderActionResult {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * Server action: Cancel open or rejected order via RPC cancel_order
 */
export async function cancelOrderAction(orderId: string, reason?: string): Promise<OrderActionResult> {
  await requireAuth('/orders');
  const supabase = await createServerClient();

  const { error } = await supabase.rpc('cancel_order', {
    p_order_id: orderId,
    p_reason: reason || 'Cancelled by reader via order dashboard.',
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Unable to cancel this order.',
    };
  }

  revalidatePath('/orders');
  return {
    success: true,
    message: 'Order has been successfully cancelled.',
  };
}

/**
 * Server action: Writer verifies bank deposit via RPC verify_order_payment
 */
export async function verifyOrderPaymentAction(
  orderId: string,
  submissionId: string,
  writerNote?: string
): Promise<OrderActionResult> {
  await requireWriter('/writer/orders');
  const supabase = await createServerClient();

  const { error } = await supabase.rpc('verify_order_payment', {
    p_order_id: orderId,
    p_submission_id: submissionId,
    p_writer_note: writerNote || null,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Payment verification failed.',
    };
  }

  revalidatePath('/writer/orders');
  revalidatePath('/writer');
  return {
    success: true,
    message: 'Payment verified successfully. Novel access has been unlocked for the reader.',
  };
}

/**
 * Server action: Writer rejects invalid/unmatched deposit via RPC reject_order_payment
 */
export async function rejectOrderPaymentAction(
  orderId: string,
  submissionId: string,
  rejectionReason: string
): Promise<OrderActionResult> {
  await requireWriter('/writer/orders');
  const supabase = await createServerClient();

  if (!rejectionReason || rejectionReason.trim().length < 5) {
    return {
      success: false,
      error: 'Please provide a clear reason for rejecting the payment submission (at least 5 characters).',
    };
  }

  const { error } = await supabase.rpc('reject_order_payment', {
    p_order_id: orderId,
    p_submission_id: submissionId,
    p_rejection_reason: rejectionReason.trim(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Payment rejection failed.',
    };
  }

  revalidatePath('/writer/orders');
  revalidatePath('/writer');
  return {
    success: true,
    message: 'Payment submission has been rejected. The reader has been notified.',
  };
}
