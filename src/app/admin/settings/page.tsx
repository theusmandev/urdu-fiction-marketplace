import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { PlatformSettingsForm } from '@/components/admin/PlatformSettingsForm';
import { PlatformPaymentMethodsManager } from '@/components/admin/PlatformPaymentMethodsManager';
import { Settings } from 'lucide-react';
import type { PlatformPaymentMethodRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  const [
    { data: settings },
    { data: paymentMethodsData },
  ] = await Promise.all([
    supabase
      .from('platform_settings')
      .select(`
        default_commission_rate,
        default_unpaid_commission_limit,
        dispute_window_days,
        min_novel_price_pkr,
        max_novel_price_pkr,
        max_orders_per_hour,
        max_chapter_reads_per_window,
        chapter_read_window_minutes,
        invoice_due_days,
        overdue_grace_days,
        support_email,
        updated_at
      `)
      .eq('id', 1)
      .single(),
    supabase
      .from('platform_payment_methods')
      .select('*')
      .order('created_at', { ascending: true }),
  ]);

  const fallbackSettings = {
    default_commission_rate: 20.0,
    default_unpaid_commission_limit: 5000.0,
    dispute_window_days: 3,
    min_novel_price_pkr: 50,
    max_novel_price_pkr: 5000.0,
    max_orders_per_hour: 5,
    max_chapter_reads_per_window: 20,
    chapter_read_window_minutes: 10,
    invoice_due_days: 7,
    overdue_grace_days: 3,
    support_email: 'support@unbpremium.pk',
    updated_at: new Date().toISOString(),
  };

  const currentSettings = settings || fallbackSettings;
  const paymentMethods = (paymentMethodsData as PlatformPaymentMethodRow[]) || [];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Settings className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xl font-bold text-white">Global Platform Configuration</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure default platform commission, author balance pause limits, dispute windows, and pricing ceilings.
          </p>
        </div>
      </div>

      <PlatformSettingsForm initialSettings={currentSettings} />

      <PlatformPaymentMethodsManager initialMethods={paymentMethods} />
    </div>
  );
}

