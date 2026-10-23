'use server';

import React from 'react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { OrderDetailView } from './OrderDetailView';
import type { OrderStatus } from '@/types/database';

interface OrderPageProps {
  params: Promise<{
    orderNumber: string;
  }>;
}

export default async function OrderPage({ params }: OrderPageProps) {
  const { orderNumber } = await params;
  const { user } = await requireAuth(`/orders/${orderNumber}`);
  const supabase = await createClient();

  // 1. Fetch order details strictly for the current reader
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      reader_id,
      writer_id,
      novel_id,
      amount_pkr,
      payment_method,
      payment_instructions_snapshot,
      applied_commission_rate,
      status,
      rejected_reason,
      created_at,
      updated_at,
      novels (
        id,
        title_english,
        title_urdu,
        slug,
        cover_image_url
      ),
      writer:writer_profiles!orders_writer_id_fkey (
        pen_name_english,
        pen_name_urdu
      )
    `)
    .eq('order_number', orderNumber)
    .eq('reader_id', user.id)
    .maybeSingle();

  // If order not found or does not belong to caller, return 404 (never reveal other user orders)
  if (error || !order) {
    notFound();
  }

  // 2. Fetch payment submissions for this order
  const { data: submissions } = await supabase
    .from('payment_submissions')
    .select(`
      id,
      transaction_reference_tid,
      screenshot_path,
      paid_amount_claimed_pkr,
      sender_account_name,
      reader_note,
      reviewer_status,
      reviewer_note,
      is_duplicate_tid_flagged,
      created_at
    `)
    .eq('order_id', order.id)
    .order('created_at', { ascending: false });

  // 3. Fetch disputes for this order
  const { data: disputes } = await supabase
    .from('disputes')
    .select('id, reason, status, resolution, created_at, resolved_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false });

  // 4. Fetch dispute window from platform settings
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('dispute_window_days')
    .eq('id', 1)
    .maybeSingle();

  const disputeWindowDays = settings?.dispute_window_days ?? 30;

  const novel = Array.isArray(order.novels) ? order.novels[0] : order.novels;
  const writer = Array.isArray(order.writer) ? order.writer[0] : order.writer;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <OrderDetailView
          order={{
            id: order.id,
            orderNumber: order.order_number,
            amountPkr: order.amount_pkr,
            status: order.status as OrderStatus,
            paymentMethod: order.payment_method,
            instructionsSnapshot: order.payment_instructions_snapshot as Record<string, unknown> | null,
            rejectedReason: order.rejected_reason,
            createdAt: order.created_at,
            updatedAt: order.updated_at,
          }}
          novel={{
            id: novel?.id || '',
            titleEnglish: novel?.title_english || 'Novel',
            titleUrdu: novel?.title_urdu || 'ناول',
            slug: novel?.slug || '',
            coverImageUrl: novel?.cover_image_url || null,
          }}
          writer={{
            penNameEnglish: writer?.pen_name_english || 'Author',
            penNameUrdu: writer?.pen_name_urdu || 'مصنف',
          }}
          submissions={submissions || []}
          disputes={disputes || []}
          disputeWindowDays={disputeWindowDays}
          // eslint-disable-next-line react-hooks/purity
          currentTimestamp={Date.now()}
        />
      </div>
    </div>
  );
}
