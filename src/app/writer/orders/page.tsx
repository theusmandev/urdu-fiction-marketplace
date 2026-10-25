'use server';

import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { WriterOrdersClient, type WriterOrderCardData } from './WriterOrdersClient';
import type { OrderStatus } from '@/types/database';

export default async function WriterOrdersPage() {
  const { user } = await requireWriter('/writer/orders');
  const supabase = await createClient();

  // Fetch all orders for this author
  const ordersRes = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      reader_id,
      amount_pkr,
      payment_instructions_snapshot,
      status,
      rejected_reason,
      created_at,
      updated_at,
      novels (
        id,
        title_urdu,
        title_english,
        slug
      ),
      payment_submissions (
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
      ),
      refund_requests (
        id,
        status,
        reason,
        created_at
      )
    `)
    .eq('writer_id', user.id)
    .order('created_at', { ascending: false });

interface WriterOrderDbRow {
  id: string;
  order_number: string;
  reader_id: string;
  amount_pkr: number;
  payment_instructions_snapshot: { method_type?: string } | null;
  status: OrderStatus;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
  novels: {
    id: string;
    title_urdu: string;
    title_english: string;
    slug: string;
  } | {
    id: string;
    title_urdu: string;
    title_english: string;
    slug: string;
  }[] | null;
  payment_submissions: Array<{
    id: string;
    transaction_reference_tid: string;
    screenshot_path: string | null;
    paid_amount_claimed_pkr: number | null;
    sender_account_name: string | null;
    reader_note: string | null;
    reviewer_status: string;
    reviewer_note: string | null;
    is_duplicate_tid_flagged: boolean;
    created_at: string;
  }> | null;
  refund_requests: Array<{
    id: string;
    status: string;
    reason: string | null;
    created_at: string;
  }> | null;
}

  const { data: orders, error: ordersError } = unwrapQuery<WriterOrderDbRow[]>(ordersRes, {
    context: 'WriterOrdersPage.fetchOrders',
  });

  if (ordersError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load orders</h3>
            <p className="text-xs text-red-400/80 mt-1">{ordersError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // Fetch safe reader display names via RPC (never exposes reader email)
  const readerIds = Array.from(new Set((orders || []).map((o) => o.reader_id).filter(Boolean)));
  const readerDisplayMap = new Map<string, { full_name: string | null; username: string }>();

  if (readerIds.length > 0) {
    const readerRes = await supabase.rpc('get_reader_display_names', {
      p_reader_ids: readerIds,
    });
    const { data: readerData } = unwrapQuery<
      Array<{ id: string; full_name: string | null; username: string }>
    >(readerRes, { context: 'WriterOrdersPage.get_reader_display_names' });

    if (readerData) {
      for (const r of readerData) {
        readerDisplayMap.set(r.id, { full_name: r.full_name, username: r.username });
      }
    }
  }

  // Map to clean client model (reader display name only, never email)
  const formattedOrders: WriterOrderCardData[] = (orders || []).map((o) => {
    const novel = Array.isArray(o.novels) ? o.novels[0] : o.novels;
    const readerInfo = readerDisplayMap.get(o.reader_id);
    const refundRequests = Array.isArray(o.refund_requests) ? o.refund_requests : [];
    const pendingRefund = refundRequests.find((r: { status: string }) => r.status === 'pending');
    const submissions = Array.isArray(o.payment_submissions)
      ? [...o.payment_submissions].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      : [];

    const displayName = readerInfo?.full_name || readerInfo?.username || 'Reader';

    return {
      id: o.id,
      orderNumber: o.order_number,
      readerId: o.reader_id,
      readerDisplayName: displayName,
      novelTitleUrdu: novel?.title_urdu || 'ناول',
      novelTitleEnglish: novel?.title_english || 'Novel',
      novelSlug: novel?.slug || '',
      amountPkr: Number(o.amount_pkr),
      paymentMethod:
        ((o.payment_instructions_snapshot as { method_type?: string })?.method_type as string) ||
        'Direct Payment',
      status: o.status as OrderStatus,
      rejectedReason: o.rejected_reason,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      submissions: submissions.map((s) => ({
        id: s.id,
        tid: s.transaction_reference_tid,
        screenshotPath: s.screenshot_path || '',
        claimedAmount: Number(s.paid_amount_claimed_pkr ?? o.amount_pkr),
        senderAccountName: s.sender_account_name,
        readerNote: s.reader_note,
        reviewerStatus: s.reviewer_status,
        reviewerNote: s.reviewer_note,
        isDuplicateTidFlagged: Boolean(s.is_duplicate_tid_flagged),
        createdAt: s.created_at,
      })),
      hasPendingRefund: Boolean(pendingRefund),
      pendingRefundReason: pendingRefund?.reason || null,
    };
  });

  return (
    <div className="space-y-6">
      <WriterOrdersClient initialOrders={formattedOrders} />
    </div>
  );
}
