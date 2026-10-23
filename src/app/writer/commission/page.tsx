import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { CommissionOverviewView } from './CommissionOverviewView';
import type { WriterSalesSummary, WriterInvoiceSummary } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function WriterCommissionPage() {
  await requireWriter('/writer/commission');
  const supabase = await createServerClient();

  const [
    { data: summaryData, error: summaryError },
    { data: invoicesData, error: invoicesError },
  ] = await Promise.all([
    supabase.rpc('get_my_sales_summary', { p_from: null, p_to: null }),
    supabase.rpc('get_my_invoices'),
  ]);

  if (summaryError) {
    console.error('Failed to load sales summary for commission page:', summaryError);
  }
  if (invoicesError) {
    console.error('Failed to load writer invoices:', invoicesError);
  }

  const summary = (summaryData as WriterSalesSummary) || null;
  const invoices = (invoicesData as WriterInvoiceSummary[]) || [];

  return <CommissionOverviewView summary={summary} invoices={invoices} />;
}
