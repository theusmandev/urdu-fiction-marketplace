import React from 'react';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminInvoiceDetailClient } from './AdminInvoiceDetailClient';

export const dynamic = 'force-dynamic';

interface AdminInvoiceDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AdminInvoiceDetailPage({
  params,
}: AdminInvoiceDetailPageProps) {
  await requireRole('admin', '/admin/invoices');
  const { id: invoiceId } = await params;

  if (!invoiceId) {
    notFound();
  }

  const supabase = await createServerClient();

  // Call admin_get_invoice RPC
  const { data, error } = await supabase.rpc('admin_get_invoice', {
    p_invoice_id: invoiceId,
  });

  if (error || !data || !data.invoice) {
    console.error('Failed to load admin invoice detail:', error);
    notFound();
  }

  return <AdminInvoiceDetailClient invoiceDetail={data} />;
}
