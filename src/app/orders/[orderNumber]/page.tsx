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
  const { user, profile } = await requireAuth(`/orders/${orderNumber}`);
  const supabase = await createClient();

  // Support both friendly order_number (e.g. ORD-...) and UUID id
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    orderNumber
  );

  let orderQuery = supabase
    .from('orders')
    .select(`
      id,
      order_number,
      reader_id,
      writer_id,
      novel_id,
      novel_title_snapshot,
      amount_pkr,
      currency,
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
        cover_url
      ),
      writer:writer_profiles!orders_writer_id_fkey (
        pen_name_english,
        pen_name_urdu
      )
    `);

  if (isUuid) {
    orderQuery = orderQuery.or(`order_number.eq.${orderNumber},id.eq.${orderNumber}`);
  } else {
    orderQuery = orderQuery.eq('order_number', orderNumber);
  }

  // 1. Fetch order details strictly for the authorized caller
  const { data: order, error } = await orderQuery.maybeSingle();

  // If order not found or does not belong to caller, return 404 (never reveal other user orders)
  if (error || !order) {
    notFound();
  }

  // Authorization check: must be the purchasing reader, author, or admin
  const isAuthorized =
    order.reader_id === user.id || order.writer_id === user.id || profile.role === 'admin';
  if (!isAuthorized) {
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

  // 4. Fetch dispute window and wait hours from platform settings
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('dispute_window_days, min_dispute_wait_hours')
    .eq('id', 1)
    .maybeSingle();

  const disputeWindowDays = settings?.dispute_window_days ?? 30;
  const minDisputeWaitHours = settings?.min_dispute_wait_hours ?? 24;

  const novel = Array.isArray(order.novels) ? order.novels[0] : order.novels;
  const writer = Array.isArray(order.writer) ? order.writer[0] : order.writer;

  const instructions = (order.payment_instructions_snapshot as Record<string, unknown>) || {};
  const paymentMethod = (instructions.method_type as string) || 'Direct Payment';

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <OrderDetailView
          order={{
            id: order.id,
            orderNumber: order.order_number,
            amountPkr: order.amount_pkr,
            status: order.status as OrderStatus,
            paymentMethod,
            instructionsSnapshot: order.payment_instructions_snapshot as Record<string, unknown> | null,
            rejectedReason: order.rejected_reason,
            createdAt: order.created_at,
            updatedAt: order.updated_at,
          }}
          novel={{
            id: novel?.id || '',
            titleEnglish: novel?.title_english || order.novel_title_snapshot || 'Novel',
            titleUrdu: novel?.title_urdu || 'ناول',
            slug: novel?.slug || '',
            coverImageUrl: novel?.cover_url || null,
          }}
          writer={{
            penNameEnglish: writer?.pen_name_english || 'Author',
            penNameUrdu: writer?.pen_name_urdu || 'مصنف',
          }}
          submissions={submissions || []}
          disputes={disputes || []}
          disputeWindowDays={disputeWindowDays}
          minDisputeWaitHours={minDisputeWaitHours}
          // eslint-disable-next-line react-hooks/purity
          currentTimestamp={Date.now()}
        />
      </div>
    </div>
  );
}
