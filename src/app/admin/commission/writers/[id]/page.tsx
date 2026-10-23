import React from 'react';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminWriterCommissionDetailClient } from './AdminWriterCommissionDetailClient';
import type { CommissionInvoiceRow } from '@/types/database';

export const dynamic = 'force-dynamic';

interface AdminWriterCommissionDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AdminWriterCommissionDetailPage({
  params,
}: AdminWriterCommissionDetailPageProps) {
  await requireRole('admin', '/admin/commission');
  const { id: writerId } = await params;

  if (!writerId) {
    notFound();
  }

  const supabase = await createServerClient();

  // 1. Fetch Writer Profile
  const { data: writerData, error: writerError } = await supabase
    .from('writer_profiles')
    .select(`
      id,
      pen_name_english,
      pen_name_urdu,
      custom_commission_rate,
      current_unpaid_commission,
      unpaid_commission_limit,
      is_orders_paused_for_commission
    `)
    .eq('id', writerId)
    .maybeSingle();

  if (writerError || !writerData) {
    console.error('Writer not found:', writerError);
    notFound();
  }

  // 2. Fetch Writer's Commission Invoices
  const { data: invoicesData } = await supabase
    .from('commission_invoices')
    .select('*')
    .eq('writer_id', writerId)
    .order('created_at', { ascending: false });

  // 3. Fetch Recent Sales Ledger Entries (without reader email)
  const { data: ledgerData } = await supabase
    .from('sales_ledger')
    .select('id, created_at, entry_type, gross_amount_pkr, platform_commission_pkr, writer_net_pkr, notes')
    .eq('writer_id', writerId)
    .order('created_at', { ascending: false })
    .limit(50);

  const writer = {
    id: writerData.id,
    pen_name_english: writerData.pen_name_english,
    pen_name_urdu: writerData.pen_name_urdu,
    custom_commission_rate: writerData.custom_commission_rate,
    current_unpaid_commission: Number(writerData.current_unpaid_commission || 0),
    unpaid_commission_limit: Number(writerData.unpaid_commission_limit || 5000),
    is_orders_paused_for_commission: Boolean(writerData.is_orders_paused_for_commission),
  };

  const invoices = (invoicesData as CommissionInvoiceRow[]) || [];
  const recentLedger = (ledgerData || []).map((l) => ({
    id: l.id,
    created_at: l.created_at,
    entry_type: l.entry_type,
    gross_amount_pkr: Number(l.gross_amount_pkr || 0),
    platform_commission_pkr: Number(l.platform_commission_pkr || 0),
    writer_net_pkr: Number(l.writer_net_pkr || 0),
    notes: l.notes,
  }));

  return (
    <AdminWriterCommissionDetailClient
      writer={writer}
      invoices={invoices}
      recentLedger={recentLedger}
    />
  );
}
