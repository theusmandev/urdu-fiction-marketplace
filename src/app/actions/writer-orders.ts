'use server';

import { revalidatePath } from 'next/cache';
import { requireWriter } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { ActionResponse } from './checkout';

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const verifyPaymentSchema = z.object({
  orderId: z.string().regex(uuidRegex, 'Invalid order ID'),
  submissionId: z.string().regex(uuidRegex, 'Invalid submission ID'),
  confirmationText: z.string().min(1, 'Verification confirmation is required'),
  writerNote: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional().or(z.literal('')),
});

const rejectPaymentSchema = z.object({
  orderId: z.string().regex(uuidRegex, 'Invalid order ID'),
  submissionId: z.string().regex(uuidRegex, 'Invalid submission ID'),
  reason: z
    .string()
    .trim()
    .min(5, 'A clear rejection reason of at least 5 characters is required')
    .max(500, 'Rejection reason cannot exceed 500 characters'),
});

export async function verifyOrderPaymentAction(
  input: z.infer<typeof verifyPaymentSchema>
): Promise<ActionResponse<{ orderId: string }>> {
  try {
    await requireWriter('/writer/orders');
    const parsed = verifyPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Invalid verification parameters.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('verify_order_payment', {
      p_order_id: parsed.data.orderId,
      p_submission_id: parsed.data.submissionId,
      p_writer_note: parsed.data.writerNote || null,
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to verify payment.',
      };
    }

    const res = data as { order_id: string };
    revalidatePath('/writer/orders');

    return {
      success: true,
      data: {
        orderId: res.order_id,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred.',
    };
  }
}

export async function rejectOrderPaymentAction(
  input: z.infer<typeof rejectPaymentSchema>
): Promise<ActionResponse<{ orderId: string }>> {
  try {
    await requireWriter('/writer/orders');
    const parsed = rejectPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Please provide a clear rejection reason.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('reject_order_payment', {
      p_order_id: parsed.data.orderId,
      p_submission_id: parsed.data.submissionId,
      p_rejection_reason: parsed.data.reason,
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to reject payment.',
      };
    }

    const res = data as { order_id: string };
    revalidatePath('/writer/orders');

    return {
      success: true,
      data: {
        orderId: res.order_id,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred.',
    };
  }
}
