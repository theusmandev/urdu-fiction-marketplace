import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { PaymentMethodsManager } from './PaymentMethodsManager';
import { UrduText } from '@/components/urdu/UrduText';
import type { WriterPaymentMethodRow } from '@/types/database';

export default async function WriterPaymentMethodsPage() {
  const { user } = await requireWriter('/writer/payment-methods');
  const supabase = await createServerClient();

  // Fetch author's direct payment methods
  const methodsRes = await supabase
    .from('writer_payment_methods')
    .select('*')
    .eq('writer_id', user.id)
    .order('created_at', { ascending: false });

  const { data: methods, error: methodsError } = unwrapQuery<WriterPaymentMethodRow[]>(methodsRes, {
    context: 'WriterPaymentMethodsPage.fetchMethods',
  });

  const paymentMethods: WriterPaymentMethodRow[] = methods || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {methodsError && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load payment methods</h3>
            <p className="text-xs text-red-400/80 mt-1">{methodsError.message}</p>
          </div>
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
            Author Financials
          </span>
          <span className="text-xs text-secondary">
            Pakistani Direct Rails (JazzCash / EasyPaisa / Raast / Bank)
          </span>
        </div>
        <h1 className="text-2xl font-serif font-bold text-navy mt-1">
          Direct Payment Methods
        </h1>
        <UrduText as="p" size="base" className="text-accent py-0">
          براہِ راست وصولی کے اکاؤنٹس
        </UrduText>
      </div>

      <PaymentMethodsManager
        initialMethods={paymentMethods}
        writerId={user.id}
      />
    </div>
  );
}
