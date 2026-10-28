import React from 'react';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminInvoiceDetailClient } from './AdminInvoiceDetailClient';

import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { unwrapQuery } from '@/lib/supabase/query';

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
  const rpcResult = await supabase.rpc('admin_get_invoice', {
    p_invoice_id: invoiceId,
  });

  const { data, error: queryError } = unwrapQuery(rpcResult, 'AdminInvoiceDetailPage');

  if (queryError) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-8">
        <Link
          href="/admin/invoices"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-main transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Invoices</span>
        </Link>
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600" />
            <span>Database Error Loading Platform Fee Invoice</span>
          </div>
          <p className="text-xs text-rose-800/90 leading-relaxed">
            Unable to retrieve invoice statement from the database:
          </p>
          <div className="p-3 rounded-xl bg-surface border border-rose-200 text-xs font-mono text-rose-800">
            {queryError.message} {queryError.code ? `(Code: ${queryError.code})` : ''}
          </div>
          {queryError.hint && (
            <p className="text-[11px] text-muted italic">Hint: {queryError.hint}</p>
          )}
        </div>
      </div>
    );
  }

  if (!data || !data.invoice) {
    notFound();
  }

  return <AdminInvoiceDetailClient invoiceDetail={data} />;
}
