import React from 'react';
import Link from 'next/link';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { WriterOrderRow } from './writer-order-row';
import { Receipt, ArrowLeft } from 'lucide-react';

interface RawOrderQueryResult {
  id: string;
  reader_id: string;
  amount_pkr: number | string;
  payment_method: string;
  status: string;
  created_at: string;
  novels?:
    | {
        title_urdu: string;
        title_english: string;
      }
    | Array<{
        title_urdu: string;
        title_english: string;
      }>
    | null;
  reader?:
    | {
        full_name: string | null;
        email: string;
      }
    | Array<{
        full_name: string | null;
        email: string;
      }>
    | null;
  payment_submissions?: Array<{
    id: string;
    transaction_reference: string;
    screenshot_storage_path: string;
    reviewer_status: string;
    submitted_at: string;
  }>;
}

export default async function WriterOrdersPage() {
  const { user } = await requireWriter('/writer/orders');
  const supabase = await createServerClient();

  // Fetch all orders for this author
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id,
      reader_id,
      amount_pkr,
      payment_method,
      status,
      created_at,
      novels (
        title_urdu,
        title_english
      ),
      reader:profiles!orders_reader_id_fkey (
        full_name,
        email
      ),
      payment_submissions (
        id,
        transaction_reference,
        screenshot_storage_path,
        reviewer_status,
        submitted_at
      )
    `)
    .eq('writer_id', user.id)
    .order('created_at', { ascending: false });

  // Filter or format orders
  const formattedOrders = ((orders || []) as unknown as RawOrderQueryResult[]).map((o) => {
    const novel = Array.isArray(o.novels) ? o.novels[0] : o.novels;
    const reader = Array.isArray(o.reader) ? o.reader[0] : o.reader;
    return {
      id: o.id,
      reader_id: o.reader_id,
      reader_name: reader?.full_name || 'Reader',
      reader_email: reader?.email,
      novel_title_urdu: novel?.title_urdu,
      novel_title_english: novel?.title_english,
      amount_pkr: Number(o.amount_pkr),
      payment_method: o.payment_method,
      status: o.status,
      created_at: o.created_at,
      submissions: o.payment_submissions || [],
    };
  });

  const pendingVerification = formattedOrders.filter(
    (o) => o.status === 'payment_submitted'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/writer"
              className="text-xs text-secondary hover:text-navy flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Writer Studio</span>
            </Link>
            <span className="text-secondary text-xs">•</span>
            <span className="text-xs font-semibold text-accent">Payment Verification</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-navy mt-1">
            Reader Payment Verifications
          </h1>
          <p className="text-xs text-secondary">
            Confirm incoming reader bank deposits and unlock novel access instantly.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            {pendingVerification.length} Awaiting Verification
          </span>
        </div>
      </div>

      {formattedOrders.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-ivory border border-border flex items-center justify-center mx-auto text-secondary">
            <Receipt className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-base text-navy">
              No reader orders yet
            </h3>
            <p className="text-xs text-secondary max-w-md mx-auto">
              Once you publish novels and readers initiate orders, their direct payment submissions and transaction references will appear here for verification.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {formattedOrders.map((order) => (
            <WriterOrderRow key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
