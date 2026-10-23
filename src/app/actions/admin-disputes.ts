'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import type {
  DisputeListItem,
  RefundRequestItem,
  SupportRequestListItem,
  EmailOutboxStats,
} from '@/types/database';

export interface AdminActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Lists all platform disputes for admin inspection with status filters and search.
 */
export async function adminListDisputesAction(
  status?: string | null,
  search?: string | null,
  limit?: number,
  offset?: number
): Promise<AdminActionResult<{ total_count: number; disputes: DisputeListItem[] }>> {
  await requireRole('admin', '/admin/disputes');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('admin_list_disputes', {
    p_status: status || null,
    p_search: search || null,
    p_limit: limit || 25,
    p_offset: offset || 0,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to list disputes.',
    };
  }

  return {
    success: true,
    data: data as unknown as { total_count: number; disputes: DisputeListItem[] },
  };
}

/**
 * Outcome A: Proof of payment confirmed real.
 * Runs admin_force_verify logic (entitlement, sales_ledger row, commission accrual),
 * and marks dispute resolved_for_reader.
 */
export async function resolveDisputeVerifyAction(
  disputeId: string,
  note: string
): Promise<AdminActionResult<{ dispute_id: string; order_id: string }>> {
  await requireRole('admin','/admin/disputes');

  if (!note || note.trim().length === 0) {
    return { success: false, error: 'A mandatory administrative justification note is required.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('resolve_dispute_for_reader_verify', {
    p_dispute_id: disputeId,
    p_note: note.trim(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to resolve dispute for reader verify.',
    };
  }

  revalidatePath('/admin/disputes');
  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath('/admin/orders');
  revalidatePath('/orders');
  revalidatePath('/disputes');

  return {
    success: true,
    data: { dispute_id: data.dispute_id, order_id: data.order_id },
    message: 'Order verified. Reading entitlement granted and sale ledger recorded.',
  };
}

/**
 * Outcome B: Off-platform refund confirmed for verified order.
 * Appends negative refund_adjustment ledger row, revokes reader entitlement,
 * and marks order refunded_adjusted.
 */
export async function resolveDisputeRefundAction(
  disputeId: string,
  note: string
): Promise<AdminActionResult<{ dispute_id: string; order_id: string }>> {
  await requireRole('admin','/admin/disputes');

  if (!note || note.trim().length === 0) {
    return { success: false, error: 'A mandatory administrative justification note is required.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('resolve_dispute_refund', {
    p_dispute_id: disputeId,
    p_note: note.trim(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to record refund adjustment.',
    };
  }

  revalidatePath('/admin/disputes');
  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath('/admin/orders');
  revalidatePath('/orders');
  revalidatePath('/disputes');

  return {
    success: true,
    data: { dispute_id: data.dispute_id, order_id: data.order_id },
    message:
      'Refund adjustment recorded in sales ledger. Reading access revoked and order status updated.',
  };
}

/**
 * Outcome C: Payment not proven.
 * Order remains in rejected/current status with no financial change.
 */
export async function resolveDisputeForWriterAction(
  disputeId: string,
  note: string
): Promise<AdminActionResult<{ dispute_id: string; order_id: string }>> {
  await requireRole('admin','/admin/disputes');

  if (!note || note.trim().length === 0) {
    return { success: false, error: 'A mandatory administrative justification note is required.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('resolve_dispute_for_writer', {
    p_dispute_id: disputeId,
    p_note: note.trim(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to resolve dispute for writer.',
    };
  }

  revalidatePath('/admin/disputes');
  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath('/disputes');

  return {
    success: true,
    data: { dispute_id: data.dispute_id, order_id: data.order_id },
    message: 'Dispute closed in writer favor. No financial changes applied.',
  };
}

/**
 * Outcome D: Dismisses dispute without outcome.
 */
export async function closeDisputeAction(
  disputeId: string,
  note: string
): Promise<AdminActionResult<{ dispute_id: string }>> {
  await requireRole('admin','/admin/disputes');

  if (!note || note.trim().length === 0) {
    return { success: false, error: 'A mandatory note is required.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('close_dispute', {
    p_dispute_id: disputeId,
    p_note: note.trim(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to close dispute.',
    };
  }

  revalidatePath('/admin/disputes');
  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath('/disputes');

  return {
    success: true,
    data: { dispute_id: data.dispute_id },
    message: 'Dispute has been closed.',
  };
}

/**
 * Lists pending/reviewed refund adjustment requests.
 */
export async function adminListRefundRequestsAction(
  status?: string | null,
  limit?: number,
  offset?: number
): Promise<AdminActionResult<{ total_count: number; requests: RefundRequestItem[] }>> {
  await requireRole('admin','/admin/refunds');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('admin_list_refund_requests', {
    p_status: status || null,
    p_limit: limit || 25,
    p_offset: offset || 0,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to list refund requests.',
    };
  }

  return {
    success: true,
    data: data as unknown as { total_count: number; requests: RefundRequestItem[] },
  };
}

/**
 * Approves a refund request: records negative sales_ledger adjustment and revokes entitlement.
 */
export async function approveRefundRequestAction(
  requestId: string,
  note: string
): Promise<AdminActionResult<{ request_id: string; order_id: string }>> {
  await requireRole('admin','/admin/refunds');

  if (!note || note.trim().length === 0) {
    return { success: false, error: 'A mandatory approval note is required.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('approve_refund_request', {
    p_request_id: requestId,
    p_note: note.trim(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to approve refund request.',
    };
  }

  revalidatePath('/admin/refunds');
  revalidatePath('/admin/orders');
  revalidatePath('/writer/orders');
  revalidatePath('/orders');

  return {
    success: true,
    data: { request_id: data.request_id, order_id: data.order_id },
    message: 'Refund request approved. Negative ledger adjustment applied and access revoked.',
  };
}

/**
 * Rejects a refund request.
 */
export async function rejectRefundRequestAction(
  requestId: string,
  note: string
): Promise<AdminActionResult<{ request_id: string }>> {
  await requireRole('admin','/admin/refunds');

  if (!note || note.trim().length === 0) {
    return { success: false, error: 'A mandatory administrative note is required.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('reject_refund_request', {
    p_request_id: requestId,
    p_note: note.trim(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to reject refund request.',
    };
  }

  revalidatePath('/admin/refunds');

  return {
    success: true,
    data: { request_id: data.request_id },
    message: 'Refund request declined.',
  };
}

/**
 * Lists support tickets for administration.
 */
export async function adminListSupportRequestsAction(
  status?: string | null,
  category?: string | null,
  limit?: number,
  offset?: number
): Promise<AdminActionResult<{ total_count: number; requests: SupportRequestListItem[] }>> {
  await requireRole('admin','/admin/support');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('admin_list_support_requests', {
    p_status: status || null,
    p_category: category || null,
    p_limit: limit || 25,
    p_offset: offset || 0,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to list support tickets.',
    };
  }

  return {
    success: true,
    data: data as unknown as { total_count: number; requests: SupportRequestListItem[] },
  };
}

/**
 * Admin reply to support request.
 */
export async function adminReplySupportRequestAction(
  requestId: string,
  body: string
): Promise<AdminActionResult<{ message_id: string }>> {
  await requireRole('admin',`/admin/support/${requestId}`);

  if (!body || body.trim().length === 0) {
    return { success: false, error: 'Reply body cannot be empty.' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('add_support_message', {
    p_request_id: requestId,
    p_body: body.trim(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to post admin reply.',
    };
  }

  revalidatePath(`/admin/support/${requestId}`);
  revalidatePath(`/support/${requestId}`);

  return {
    success: true,
    data: { message_id: data.message_id },
    message: 'Reply sent to user.',
  };
}

/**
 * Email Outbox stats for admin dashboard card.
 */
export async function getOutboxStatsAction(): Promise<AdminActionResult<EmailOutboxStats>> {
  await requireRole('admin','/admin');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('get_email_outbox_stats');
  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to fetch email outbox stats.',
    };
  }

  return {
    success: true,
    data: data as unknown as EmailOutboxStats,
  };
}

/**
 * Retries failed email dispatches.
 */
export async function retryFailedEmailsAction(): Promise<AdminActionResult<{ retried_count: number }>> {
  await requireRole('admin','/admin');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('retry_failed_emails', {
    p_max_retry: 50,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to retry failed emails.',
    };
  }

  revalidatePath('/admin');

  return {
    success: true,
    data: { retried_count: data.retried_count },
    message: `Reset ${data.retried_count} failed email(s) to pending.`,
  };
}
