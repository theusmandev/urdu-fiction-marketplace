'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';

export interface RefundActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Submits an off-platform refund adjustment request.
 * Can be submitted by the writer (declaring they refunded the reader)
 * or reader (on verified order inside dispute window).
 */
export async function requestRefundAction(
  orderId: string,
  reason: string,
  evidenceNote?: string | null,
  evidencePath?: string | null
): Promise<RefundActionResult<{ request_id: string }>> {
  await requireAuth('/orders');

  if (!reason || reason.trim().length === 0) {
    return { success: false, error: 'Reason for refund request is required.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('request_refund', {
    p_order_id: orderId,
    p_reason: reason.trim(),
    p_evidence_note: evidenceNote?.trim() || null,
    p_evidence_path: evidencePath || null,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to submit refund request.',
    };
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/writer/orders');
  revalidatePath('/admin/refunds');

  return {
    success: true,
    data: { request_id: data.request_id },
    message:
      'Refund request has been submitted for platform administrator review. No financial adjustment or access revocation occurs until approved.',
  };
}
