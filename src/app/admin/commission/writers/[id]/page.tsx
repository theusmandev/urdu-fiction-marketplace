import React from 'react';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';
import { ShieldAlert } from 'lucide-react';
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
  const writerRes = await supabase
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

  const { data: writerData, error: writerError } = unwrapSingleQuery<{
    id: string;
    pen_name_english: string;
    pen_name_urdu: string;
    custom_commission_rate: number | null;
    current_unpaid_commission: number | null;
    unpaid_commission_limit: number | null;
    is_orders_paused_for_commission: boolean;
  }>(writerRes, {
    context: 'AdminWriterCommissionDetailPage.fetchWriter',
  });

  if (writerError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="p-4 rounded-xl border border-danger-border bg-danger-soft text-danger-text flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0 text-danger-text" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load author platform fee profile</h3>
            <p className="text-xs text-danger-text mt-1">{writerError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!writerData) {
    notFound();
  }

  // 2. Fetch Writer's Commission Invoices
  const invoicesRes = await supabase
    .from('commission_invoices')
    .select('*')
    .eq('writer_id', writerId)
    .order('created_at', { ascending: false });
  const { data: invoicesData } = unwrapQuery<CommissionInvoiceRow[]>(invoicesRes, {
    context: 'AdminWriterCommissionDetailPage.fetchInvoices',
  });

  // 3. Fetch Recent Sales Ledger Entries (without reader email)
  const ledgerRes = await supabase
    .from('sales_ledger')
    .select('id, created_at, entry_type, gross_amount_pkr, platform_commission_pkr, writer_net_pkr, notes')
    .eq('writer_id', writerId)
    .order('created_at', { ascending: false })
    .limit(50);
  const { data: ledgerData } = unwrapQuery<
    Array<{
      id: string;
      created_at: string;
      entry_type: string;
      gross_amount_pkr: number | null;
      platform_commission_pkr: number | null;
      writer_net_pkr: number | null;
      notes: string | null;
    }>
  >(ledgerRes, {
    context: 'AdminWriterCommissionDetailPage.fetchLedger',
  });

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
