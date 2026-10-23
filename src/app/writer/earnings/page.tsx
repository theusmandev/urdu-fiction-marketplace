import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { EarningsView } from './EarningsView';
import type { WriterSalesSummary, WriterLedgerEntry } from '@/types/database';

export const dynamic = 'force-dynamic';

interface WriterEarningsPageProps {
  searchParams: Promise<{
    from?: string;
    to?: string;
    entry_type?: string;
    page?: string;
  }>;
}

export default async function WriterEarningsPage({ searchParams }: WriterEarningsPageProps) {
  await requireWriter('/writer/earnings');
  const params = await searchParams;

  const from = params.from || undefined;
  const to = params.to || undefined;
  const entryType = params.entry_type || undefined;
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const supabase = await createServerClient();

  // 1. Fetch Sales & Commission Summary
  const { data: summaryData, error: summaryError } = await supabase.rpc('get_my_sales_summary', {
    p_from: from || null,
    p_to: to || null,
  });

  if (summaryError) {
    console.error('Failed to load sales summary:', summaryError);
  }

  // 2. Fetch Ledger Entries
  const { data: ledgerData, error: ledgerError } = await supabase.rpc('get_my_ledger', {
    p_from: from || null,
    p_to: to || null,
    p_entry_type: entryType || null,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (ledgerError) {
    console.error('Failed to load sales ledger:', ledgerError);
  }

  const summary = (summaryData as WriterSalesSummary) || null;
  const ledgerEntries = (ledgerData?.entries as WriterLedgerEntry[]) || [];
  const totalCount = ledgerData?.total_count ?? 0;

  return (
    <EarningsView
      summary={summary}
      ledgerEntries={ledgerEntries}
      totalLedgerCount={totalCount}
      initialFrom={from}
      initialTo={to}
      initialEntryType={entryType}
      currentPage={page}
      pageSize={pageSize}
    />
  );
}
