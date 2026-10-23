'use server';

import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { WriterOrdersClient, type WriterOrderCardData } from './WriterOrdersClient';
import type { OrderStatus } from '@/types/database';

export default async function WriterOrdersPage() {
  const { user } = await requireWriter('/writer/orders');
  const supabase = await createClient();

  // Fetch all orders for this author
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      reader_id,
      amount_pkr,
      payment_method,
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
      reader:profiles!orders_reader_id_fkey (
        full_name,
        username
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
      )
    `)
    .eq('writer_id', user.id)
    .order('created_at', { ascending: false });

  // Map to clean client model (reader display name only, never email)
  const formattedOrders: WriterOrderCardData[] = (orders || []).map((o) => {
    const novel = Array.isArray(o.novels) ? o.novels[0] : o.novels;
    const reader = Array.isArray(o.reader) ? o.reader[0] : o.reader;
    const submissions = Array.isArray(o.payment_submissions)
      ? [...o.payment_submissions].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      : [];

    const displayName = reader?.full_name || reader?.username || 'Reader';

    return {
      id: o.id,
      orderNumber: o.order_number,
      readerId: o.reader_id,
      readerDisplayName: displayName,
      novelTitleUrdu: novel?.title_urdu || 'ناول',
      novelTitleEnglish: novel?.title_english || 'Novel',
      novelSlug: novel?.slug || '',
      amountPkr: Number(o.amount_pkr),
      paymentMethod: o.payment_method,
      status: o.status as OrderStatus,
      rejectedReason: o.rejected_reason,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      submissions: submissions.map((s) => ({
        id: s.id,
        tid: s.transaction_reference_tid,
        screenshotPath: s.screenshot_path,
        claimedAmount: Number(s.paid_amount_claimed_pkr ?? o.amount_pkr),
        senderAccountName: s.sender_account_name,
        readerNote: s.reader_note,
        reviewerStatus: s.reviewer_status,
        reviewerNote: s.reviewer_note,
        isDuplicateTidFlagged: Boolean(s.is_duplicate_tid_flagged),
        createdAt: s.created_at,
      })),
    };
  });

  return (
    <div className="space-y-6">
      <WriterOrdersClient initialOrders={formattedOrders} />
    </div>
  );
}
