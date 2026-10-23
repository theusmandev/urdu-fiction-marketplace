'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import type { DisputeListItem, DisputeDetailPayload } from '@/types/database';

export interface DisputeActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Opens a formal dispute on an order.
 * Enforces min_dispute_wait_hours on payment_submitted orders.
 */
export async function openDisputeAction(
  orderId: string,
  reason: string
): Promise<DisputeActionResult<{ dispute_id: string }>> {
  await requireAuth('/orders');

  if (!reason || reason.trim().length === 0) {
    return { success: false, error: 'Dispute reason is required.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('open_dispute', {
    p_order_id: orderId,
    p_reason: reason.trim(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to open dispute.',
    };
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/disputes');
  revalidatePath('/writer/disputes');
  revalidatePath('/admin/disputes');

  return {
    success: true,
    data: { dispute_id: data.dispute_id },
    message: 'Dispute has been formally registered. Both parties and admin will review.',
  };
}

/**
 * Adds a message to an active dispute thread with optional attachment path.
 * Rate limited to 20 messages per hour.
 */
export async function addDisputeMessageAction(
  disputeId: string,
  body: string,
  attachmentPath?: string | null
): Promise<DisputeActionResult<{ message_id: string }>> {
  await requireAuth(`/disputes/${disputeId}`);

  if (!body || body.trim().length === 0) {
    return { success: false, error: 'Message body cannot be empty.' };
  }

  if (body.length > 2000) {
    return { success: false, error: 'Message cannot exceed 2000 characters.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('add_dispute_message', {
    p_dispute_id: disputeId,
    p_body: body.trim(),
    p_attachment_path: attachmentPath || null,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to post message.',
    };
  }

  revalidatePath(`/disputes/${disputeId}`);
  revalidatePath(`/writer/disputes/${disputeId}`);
  revalidatePath(`/admin/disputes/${disputeId}`);

  return {
    success: true,
    data: { message_id: data.message_id },
  };
}

/**
 * Fetches all disputes where the authenticated user is either reader or writer.
 */
export async function getMyDisputesAction(): Promise<DisputeActionResult<DisputeListItem[]>> {
  await requireAuth('/disputes');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('get_my_disputes');
  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to fetch disputes.',
    };
  }

  return {
    success: true,
    data: (data as DisputeListItem[]) || [],
  };
}

/**
 * Fetches single dispute details, messages, and order info.
 */
export async function getDisputeDetailAction(
  disputeId: string
): Promise<DisputeActionResult<DisputeDetailPayload>> {
  await requireAuth(`/disputes/${disputeId}`);
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('get_dispute', {
    p_dispute_id: disputeId,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to fetch dispute details.',
    };
  }

  return {
    success: true,
    data: data as unknown as DisputeDetailPayload,
  };
}
