'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const forceVerifySchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  adminNote: z.string().min(5, 'A clear administrative note of at least 5 characters is required'),
});

/**
 * Server action: Platform administrator manually force-verifies a reader order.
 * Grants novel purchase entitlement, records sale_verified ledger entry, and resolves open dispute.
 */
export async function adminForceVerifyOrderAction(
  orderId: string,
  adminNote: string
): Promise<ActionResult> {
  await requireRole('admin', '/admin/orders');

  const parsed = forceVerifySchema.safeParse({ orderId, adminNote });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('admin_force_verify', {
    p_order_id: parsed.data.orderId,
    p_admin_note: parsed.data.adminNote,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
  return { success: true, data };
}
