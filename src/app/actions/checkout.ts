'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import {
  createOrderFormSchema,
  paymentSubmissionFormSchema,
  openDisputeFormSchema,
  cancelOrderFormSchema,
  type CreateOrderFormInput,
  type PaymentSubmissionFormInput,
  type OpenDisputeFormInput,
  type CancelOrderFormInput,
} from '@/lib/checkout/schemas';

export interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Creates an order for a novel with the chosen writer payment method
 */
export async function createOrderAction(
  input: CreateOrderFormInput
): Promise<ActionResponse<{ orderId: string; orderNumber: string }>> {
  try {
    await requireAuth();
    const parsed = createOrderFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Please fix the errors in your order request.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('create_order', {
      p_novel_id: parsed.data.novelId,
      p_payment_method_id: parsed.data.paymentMethodId,
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('rate limit exceeded')) {
        return {
          success: false,
          error:
            'Order rate limit reached. You can create at most 5 orders per hour. Please complete or cancel your pending orders before placing a new one.',
        };
      }
      if (msg.includes('authors cannot purchase their own novels')) {
        return {
          success: false,
          error: 'You are the author of this novel and cannot purchase your own work.',
        };
      }
      if (msg.includes('already hold an active purchase entitlement')) {
        return {
          success: false,
          error: 'You already own this novel in your library.',
        };
      }
      if (msg.includes('active, rejected, or disputed order') || msg.includes('order for this novel already exists')) {
        return {
          success: false,
          error:
            'An open, rejected, or disputed order for this novel already exists in your account. Please view your orders to complete or cancel it.',
        };
      }
      if (msg.includes('orders for this author are currently paused')) {
        return {
          success: false,
          error: 'Orders for this author are currently paused. Please try again later.',
        };
      }
      return {
        success: false,
        error: error.message || 'Failed to create order. Please try again.',
      };
    }

    const result = data as { order_id: string; order_number: string };
    revalidatePath('/orders');
    revalidatePath(`/orders/${result.order_number}`);

    return {
      success: true,
      data: {
        orderId: result.order_id,
        orderNumber: result.order_number,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred while placing your order.',
    };
  }
}

/**
 * Submits payment proof (TID and private bucket screenshot path) for an order
 */
export async function submitPaymentAction(
  input: PaymentSubmissionFormInput
): Promise<ActionResponse<{ submissionId: string; isRetry: boolean }>> {
  try {
    await requireAuth('/orders');
    const parsed = paymentSubmissionFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Please fix the submission errors below.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('submit_payment', {
      p_order_id: parsed.data.orderId,
      p_tid: parsed.data.tid,
      p_screenshot_path: parsed.data.screenshotPath,
      p_claimed_amount: parsed.data.claimedAmount,
      p_sender_name: parsed.data.senderAccountName || null,
      p_note: parsed.data.readerNote || null,
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to submit payment details.',
      };
    }

    const result = data as { submission_id: string; is_retry: boolean };
    revalidatePath('/orders');

    return {
      success: true,
      data: {
        submissionId: result.submission_id,
        isRetry: result.is_retry,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred.',
    };
  }
}

/**
 * Cancels a pending or rejected order
 */
export async function cancelOrderAction(
  input: CancelOrderFormInput
): Promise<ActionResponse<{ orderId: string }>> {
  try {
    await requireAuth('/orders');
    const parsed = cancelOrderFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Invalid order request.',
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('cancel_order', {
      p_order_id: parsed.data.orderId,
      p_reason: parsed.data.reason || 'Cancelled by reader',
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Unable to cancel order.',
      };
    }

    const result = data as { order_id: string };
    revalidatePath('/orders');

    return {
      success: true,
      data: {
        orderId: result.order_id,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred.',
    };
  }
}

/**
 * Opens a dispute for an order
 */
export async function openDisputeAction(
  input: OpenDisputeFormInput
): Promise<ActionResponse<{ disputeId: string }>> {
  try {
    await requireAuth('/orders');
    const parsed = openDisputeFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Please provide a valid dispute reason.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('open_dispute', {
      p_order_id: parsed.data.orderId,
      p_reason: parsed.data.reason,
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to open dispute.',
      };
    }

    const result = data as { dispute_id: string };
    revalidatePath('/orders');

    return {
      success: true,
      data: {
        disputeId: result.dispute_id,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred.',
    };
  }
}

/**
 * Marks notifications as read (specific IDs or all if empty)
 */
export async function markNotificationsReadAction(
  notificationIds?: string[]
): Promise<ActionResponse<{ updatedCount: number }>> {
  try {
    await requireAuth('/notifications');
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('mark_notifications_as_read', {
      p_notification_ids: notificationIds && notificationIds.length > 0 ? notificationIds : null,
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to update notifications.',
      };
    }

    revalidatePath('/notifications');

    return {
      success: true,
      data: {
        updatedCount: data || 0,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred.',
    };
  }
}

export type NovelAccessState =
  | 'visitor'
  | 'owner_buyer'
  | 'pending_verification'
  | 'rejected'
  | 'disputed'
  | 'author'
  | 'admin';

export interface NovelAccessStatus {
  state: NovelAccessState;
  signedIn: boolean;
  orderNumber?: string | null;
  lastReadChapterNumber?: number | null;
}

/**
 * Checks a novel's complete access status, entitlement, and reading progress for the current visitor.
 */
export async function getNovelAccessStatusAction(novelId: string): Promise<NovelAccessStatus> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        state: 'visitor',
        signedIn: false,
        orderNumber: null,
        lastReadChapterNumber: null,
      };
    }

    // 1. Check if user is an administrator
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      console.error('getNovelAccessStatusAction: profile query error:', profileErr);
    }

    if (profile?.role === 'admin') {
      const { data: progress, error: progressErr } = await supabase
        .from('reader_progress')
        .select('last_chapter_number')
        .eq('reader_id', user.id)
        .eq('novel_id', novelId)
        .maybeSingle();

      if (progressErr) {
        console.error('getNovelAccessStatusAction: admin progress query error:', progressErr);
      }

      return {
        state: 'admin',
        signedIn: true,
        orderNumber: null,
        lastReadChapterNumber: progress?.last_chapter_number ?? null,
      };
    }

    // 2. Check if novel exists and belongs to current author
    const { data: novel, error: novelErr } = await supabase
      .from('novels')
      .select('writer_id')
      .eq('id', novelId)
      .maybeSingle();

    if (novelErr) {
      console.error('getNovelAccessStatusAction: novel query error:', novelErr);
    }

    const isOwnNovel = novel?.writer_id === user.id;
    if (isOwnNovel) {
      const { data: progress, error: progressErr } = await supabase
        .from('reader_progress')
        .select('last_chapter_number')
        .eq('reader_id', user.id)
        .eq('novel_id', novelId)
        .maybeSingle();

      if (progressErr) {
        console.error('getNovelAccessStatusAction: author progress query error:', progressErr);
      }

      return {
        state: 'author',
        signedIn: true,
        orderNumber: null,
        lastReadChapterNumber: progress?.last_chapter_number ?? null,
      };
    }

    // 3. Check if user holds active entitlement (owner_buyer)
    const { data: entitlement, error: entitlementErr } = await supabase
      .from('purchase_entitlements')
      .select('id')
      .eq('reader_id', user.id)
      .eq('novel_id', novelId)
      .eq('is_revoked', false)
      .maybeSingle();

    if (entitlementErr) {
      console.error('getNovelAccessStatusAction: entitlement query error:', entitlementErr);
    }

    if (entitlement) {
      const { data: progress, error: progressErr } = await supabase
        .from('reader_progress')
        .select('last_chapter_number')
        .eq('reader_id', user.id)
        .eq('novel_id', novelId)
        .maybeSingle();

      if (progressErr) {
        console.error('getNovelAccessStatusAction: entitlement progress query error:', progressErr);
      }

      return {
        state: 'owner_buyer',
        signedIn: true,
        orderNumber: null,
        lastReadChapterNumber: progress?.last_chapter_number ?? null,
      };
    }

    // 4. Check if user has an open or pending order for this novel
    const { data: openOrder, error: orderErr } = await supabase
      .from('orders')
      .select('order_number, status')
      .eq('reader_id', user.id)
      .eq('novel_id', novelId)
      .in('status', ['pending_payment', 'payment_submitted', 'rejected', 'disputed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderErr) {
      console.error('getNovelAccessStatusAction: openOrder query error:', orderErr);
    }

    if (openOrder) {
      if (openOrder.status === 'rejected') {
        return {
          state: 'rejected',
          signedIn: true,
          orderNumber: openOrder.order_number,
          lastReadChapterNumber: null,
        };
      }
      if (openOrder.status === 'disputed') {
        return {
          state: 'disputed',
          signedIn: true,
          orderNumber: openOrder.order_number,
          lastReadChapterNumber: null,
        };
      }
      return {
        state: 'pending_verification',
        signedIn: true,
        orderNumber: openOrder.order_number,
        lastReadChapterNumber: null,
      };
    }

    // 5. Signed-in prospective buyer (visitor)
    return {
      state: 'visitor',
      signedIn: true,
      orderNumber: null,
      lastReadChapterNumber: null,
    };
  } catch (err) {
    console.error('getNovelAccessStatusAction caught unexpected error:', err);
    return {
      state: 'visitor',
      signedIn: false,
      orderNumber: null,
      lastReadChapterNumber: null,
    };
  }
}

/**
 * Legacy compatibility wrapper around getNovelAccessStatusAction
 */
export async function getNovelPurchaseStatusAction(novelId: string): Promise<{
  signedIn: boolean;
  isOwnNovel: boolean;
  isOwned: boolean;
  openOrderNumber: string | null;
}> {
  const access = await getNovelAccessStatusAction(novelId);
  return {
    signedIn: access.signedIn,
    isOwnNovel: access.state === 'author',
    isOwned: access.state === 'owner_buyer' || access.state === 'author' || access.state === 'admin',
    openOrderNumber: access.orderNumber ?? null,
  };
}

