import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
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
  const summaryRes = await supabase.rpc('get_my_sales_summary', {
    p_from: from || null,
    p_to: to || null,
  });
  const { data: summaryData, error: summaryError } = unwrapQuery<WriterSalesSummary>(summaryRes, {
    context: 'WriterEarningsPage.get_my_sales_summary',
  });

  // 2. Fetch Ledger Entries
  const ledgerRes = await supabase.rpc('get_my_ledger', {
    p_from: from || null,
    p_to: to || null,
    p_entry_type: entryType || null,
    p_limit: pageSize,
    p_offset: offset,
  });
  const { data: ledgerData, error: ledgerError } = unwrapQuery<{
    entries: WriterLedgerEntry[];
    total_count: number;
  }>(ledgerRes, {
    context: 'WriterEarningsPage.get_my_ledger',
  });

  const queryError = summaryError || ledgerError;
  const summary = summaryData || null;
  const ledgerEntries = ledgerData?.entries || [];
  const totalCount = ledgerData?.total_count ?? 0;

  return (
    <div>
      {queryError && (
        <div className="container mx-auto px-4 pt-6">
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-sm">Failed to load earnings data</h3>
              <p className="text-xs text-red-400/80 mt-1">{queryError.message}</p>
            </div>
          </div>
        </div>
      )}
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
    </div>
  );
}
