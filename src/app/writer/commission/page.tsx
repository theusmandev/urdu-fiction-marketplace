import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { CommissionOverviewView } from './CommissionOverviewView';
import type { WriterSalesSummary, WriterInvoiceSummary } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function WriterCommissionPage() {
  await requireWriter('/writer/commission');
  const supabase = await createServerClient();

  const [summaryRes, invoicesRes] = await Promise.all([
    supabase.rpc('get_my_sales_summary', { p_from: null, p_to: null }),
    supabase.rpc('get_my_invoices'),
  ]);

  const { data: summaryData, error: summaryError } = unwrapQuery<WriterSalesSummary>(summaryRes, {
    context: 'WriterCommissionPage.get_my_sales_summary',
  });
  const { data: invoicesData, error: invoicesError } = unwrapQuery<WriterInvoiceSummary[]>(invoicesRes, {
    context: 'WriterCommissionPage.get_my_invoices',
  });

  const queryError = summaryError || invoicesError;

  return (
    <div>
      {queryError && (
        <div className="container mx-auto px-4 pt-6">
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-sm">Failed to load platform fee data</h3>
              <p className="text-xs text-red-400/80 mt-1">{queryError.message}</p>
            </div>
          </div>
        </div>
      )}
      <CommissionOverviewView summary={summaryData} invoices={invoicesData || []} />
    </div>
  );
}
