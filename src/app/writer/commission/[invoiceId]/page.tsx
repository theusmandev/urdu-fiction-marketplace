import React from 'react';
import { notFound } from 'next/navigation';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
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
  const { data: invoiceData, error: invoiceError } = await supabase.rpc('get_my_invoice', {
    p_invoice_id: invoiceId,
  });

  if (invoiceError || !invoiceData || !invoiceData.invoice) {
    console.error('Invoice not found or access denied:', invoiceError);
    notFound();
  }

  // 2. Fetch Platform Payment Instructions
  const { data: instructionsData } = await supabase.rpc('get_platform_payment_instructions');

  const invoiceDetail = invoiceData as WriterInvoiceDetail;
  const paymentInstructions = (instructionsData as PlatformPaymentMethodRow[]) || [];

  return (
    <InvoiceDetailClient
      invoiceDetail={invoiceDetail}
      paymentInstructions={paymentInstructions}
    />
  );
}
