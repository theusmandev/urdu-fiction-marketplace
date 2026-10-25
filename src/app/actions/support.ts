'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import type { SupportRequestListItem, SupportRequestDetailPayload } from '@/types/database';

export interface SupportActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Creates a new support ticket. Rate-limited to 5 tickets per day per user.
 */
export async function createSupportRequestAction(
  category: 'order' | 'payment' | 'account' | 'content' | 'other',
  subject: string,
  body: string,
  orderId?: string | null
): Promise<SupportActionResult<{ request_id: string }>> {
  await requireAuth('/support');

  if (!subject || subject.trim().length === 0) {
    return { success: false, error: 'Subject is required.' };
  }
  if (subject.length > 120) {
    return { success: false, error: 'Subject cannot exceed 120 characters.' };
  }
  if (!body || body.trim().length === 0) {
    return { success: false, error: 'Message body is required.' };
  }
  if (body.length > 2000) {
    return { success: false, error: 'Message cannot exceed 2000 characters.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('create_support_request', {
    p_category: category,
    p_subject: subject.trim(),
    p_body: body.trim(),
    p_order_id: orderId || null,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to submit support request.',
    };
  }

  revalidatePath('/support');
  revalidatePath('/admin/support');

  return {
    success: true,
    data: { request_id: data.request_id },
    message: 'Support request submitted. Our team will review and reply shortly.',
  };
}

/**
 * Adds a reply to an existing support ticket thread.
 */
export async function addSupportMessageAction(
  requestId: string,
  body: string
): Promise<SupportActionResult<{ message_id: string }>> {
  await requireAuth(`/support/${requestId}`);

  if (!body || body.trim().length === 0) {
    return { success: false, error: 'Message body cannot be empty.' };
  }
  if (body.length > 2000) {
    return { success: false, error: 'Message cannot exceed 2000 characters.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('add_support_message', {
    p_request_id: requestId,
    p_body: body.trim(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to post reply.',
    };
  }

  revalidatePath(`/support/${requestId}`);
  revalidatePath(`/admin/support/${requestId}`);

  return {
    success: true,
    data: { message_id: data.message_id },
  };
}

/**
 * Closes a support request.
 */
export async function closeSupportRequestAction(
  requestId: string
): Promise<SupportActionResult<{ request_id: string }>> {
  await requireAuth(`/support/${requestId}`);
  const supabase = await createServerClient();

  const { error } = await supabase.rpc('close_support_request', {
    p_request_id: requestId,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to close support request.',
    };
  }

  revalidatePath('/support');
  revalidatePath(`/support/${requestId}`);
  revalidatePath('/admin/support');

  return {
    success: true,
    data: { request_id: requestId },
    message: 'Support request has been closed.',
  };
}

/**
 * Retrieves the current user's support requests.
 */
export async function getMySupportRequestsAction(): Promise<
  SupportActionResult<SupportRequestListItem[]>
> {
  await requireAuth('/support');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('get_my_support_requests');
  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to fetch support requests.',
    };
  }

  return {
    success: true,
    data: (data as unknown as SupportRequestListItem[]) || [],
  };
}

/**
 * Retrieves single support ticket thread and messages.
 */
export async function getSupportRequestDetailAction(
  requestId: string
): Promise<SupportActionResult<SupportRequestDetailPayload>> {
  await requireAuth(`/support/${requestId}`);
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('get_support_request', {
    p_request_id: requestId,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to fetch support ticket details.',
    };
  }

  return {
    success: true,
    data: data as unknown as SupportRequestDetailPayload,
  };
}
