import React from 'react';
import { notFound } from 'next/navigation';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { InvoiceDetailClient } from './InvoiceDetailClient';
import type {
  WriterInvoiceDetail,
  PlatformPaymentMethodRow,
} from '@/types/database';

export const dynamic = 'force-dynamic';

interface WriterInvoiceDetailPageProps {
  params: Promise<{
    invoiceId: string;
  }>;
}

export default async function WriterInvoiceDetailPage({
  params,
}: WriterInvoiceDetailPageProps) {
  await requireWriter('/writer/commission');
  const { invoiceId } = await params;

  if (!invoiceId) {
    notFound();
  }

  const supabase = await createServerClient();

  // 1. Fetch Author Invoice with Lines, Payments, Reports
  const invoiceRes = await supabase.rpc('get_my_invoice', {
    p_invoice_id: invoiceId,
  });
  const { data: invoiceData, error: invoiceError } = unwrapQuery<WriterInvoiceDetail>(invoiceRes, {
    context: 'WriterInvoiceDetailPage.get_my_invoice',
  });

  if (invoiceError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load invoice</h3>
            <p className="text-xs text-red-400/80 mt-1">{invoiceError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!invoiceData) {
    notFound();
  }

  // 2. Fetch Platform Payment Instructions
  const instructionsRes = await supabase.rpc('get_platform_payment_instructions');
  const { data: instructionsData } = unwrapQuery<PlatformPaymentMethodRow[]>(instructionsRes, {
    context: 'WriterInvoiceDetailPage.get_platform_payment_instructions',
  });

  const invoiceDetail = invoiceData;
  const paymentInstructions = instructionsData || [];

  return (
    <InvoiceDetailClient
      invoiceDetail={invoiceDetail}
      paymentInstructions={paymentInstructions}
    />
  );
}
