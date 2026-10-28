'use server';

import React from 'react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { OrderDetailView } from './OrderDetailView';
import type { OrderStatus } from '@/types/database';

interface OrderPageProps {
  params: Promise<{
    orderNumber: string;
  }>;
}

interface OrderRowData {
  id: string;
  order_number: string;
  reader_id: string;
  writer_id: string;
  novel_id: string;
  novel_title_snapshot: string;
  amount_pkr: number;
  currency: string;
  payment_instructions_snapshot: Record<string, unknown> | null;
  status: string;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
  novels: {
    id: string;
    title_english: string;
    title_urdu: string;
    slug: string;
    cover_url: string | null;
  } | Array<{
    id: string;
    title_english: string;
    title_urdu: string;
    slug: string;
    cover_url: string | null;
  }> | null;
}

interface PaymentSubmissionItem {
  id: string;
  transaction_reference_tid: string;
  screenshot_path: string;
  paid_amount_claimed_pkr: number | null;
  sender_account_name: string | null;
  reader_note: string | null;
  reviewer_status: string;
  reviewer_note: string | null;
  is_duplicate_tid_flagged: boolean;
  created_at: string;
}

interface DisputeItem {
  id: string;
  reason: string;
  status: string;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface PlatformSettingsItem {
  dispute_window_days: number;
  min_dispute_wait_hours: number;
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
      )
    `);

  if (isUuid) {
    orderQuery = orderQuery.or(`order_number.eq.${orderNumber},id.eq.${orderNumber}`);
  } else {
    orderQuery = orderQuery.eq('order_number', orderNumber);
  }

  // 1. Fetch order details strictly for the authorized caller
  const orderRes = await orderQuery.maybeSingle();
  const { data: order, error: orderError } = unwrapSingleQuery<OrderRowData>(orderRes, {
    context: 'OrderPage.fetchOrder',
  });

  if (orderError) {
    return (
      <div className="min-h-screen bg-ivory text-main py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto p-4 rounded-xl border border-danger-border bg-danger-soft text-danger-text flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-danger-text" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load order</h3>
            <p className="text-xs text-danger-text/80 mt-1">{orderError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    notFound();
  }

  // Authorization check: must be the purchasing reader, author, or admin
  const isAuthorized =
    order.reader_id === user.id || order.writer_id === user.id || profile.role === 'admin';
  if (!isAuthorized) {
    notFound();
  }

  // Fetch safe writer display names via RPC (never exposes financial/commission fields)
  let writerPenNames = { pen_name_english: 'Author', pen_name_urdu: 'مصنف' };
  if (order.writer_id) {
    const writerRes = await supabase.rpc('get_writer_display_names', {
      p_writer_ids: [order.writer_id],
    });
    const { data: writerData } = unwrapQuery<
      Array<{ id: string; pen_name_urdu: string; pen_name_english: string; username: string }>
    >(writerRes, { context: 'OrderPage.get_writer_display_names' });

    if (writerData && writerData[0]) {
      writerPenNames = {
        pen_name_english: writerData[0].pen_name_english || 'Author',
        pen_name_urdu: writerData[0].pen_name_urdu || 'مصنف',
      };
    }
  }

  // 2. Fetch payment submissions for this order
  const submissionsRes = await supabase
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
  const { data: submissions } = unwrapQuery<PaymentSubmissionItem[]>(submissionsRes, {
    context: 'OrderPage.fetchSubmissions',
  });

  // 3. Fetch disputes for this order
  const disputesRes = await supabase
    .from('disputes')
    .select('id, reason, status, resolution, created_at, resolved_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false });
  const { data: disputes } = unwrapQuery<DisputeItem[]>(disputesRes, {
    context: 'OrderPage.fetchDisputes',
  });

  // 4. Fetch dispute window and wait hours from platform settings
  const settingsRes = await supabase
    .from('platform_settings')
    .select('dispute_window_days, min_dispute_wait_hours')
    .eq('id', 1)
    .maybeSingle();
  const { data: settings } = unwrapSingleQuery<PlatformSettingsItem>(settingsRes, {
    context: 'OrderPage.fetchSettings',
  });

  const disputeWindowDays = settings?.dispute_window_days ?? 30;
  const minDisputeWaitHours = settings?.min_dispute_wait_hours ?? 24;

  const novel = Array.isArray(order.novels) ? order.novels[0] : order.novels;

  const instructions = (order.payment_instructions_snapshot as Record<string, unknown>) || {};
  const paymentMethod = (instructions.method_type as string) || 'Direct Payment';

  const formattedSubmissions = (submissions || []).map((s) => ({
    id: s.id,
    transaction_reference_tid: s.transaction_reference_tid,
    screenshot_path: s.screenshot_path || '',
    paid_amount_claimed_pkr: s.paid_amount_claimed_pkr ?? order.amount_pkr,
    sender_account_name: s.sender_account_name,
    reader_note: s.reader_note,
    reviewer_status: s.reviewer_status,
    reviewer_note: s.reviewer_note,
    is_duplicate_tid_flagged: s.is_duplicate_tid_flagged,
    created_at: s.created_at,
  }));

  return (
    <div className="min-h-screen bg-ivory text-main py-10 px-4 sm:px-6 lg:px-8">
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
            penNameEnglish: writerPenNames.pen_name_english,
            penNameUrdu: writerPenNames.pen_name_urdu,
          }}
          submissions={formattedSubmissions}
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
