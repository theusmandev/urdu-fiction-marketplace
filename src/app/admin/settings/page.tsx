import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';
import { PlatformSettingsForm } from '@/components/admin/PlatformSettingsForm';
import { PlatformPaymentMethodsManager } from '@/components/admin/PlatformPaymentMethodsManager';
import { Settings, AlertCircle } from 'lucide-react';
import type { PlatformPaymentMethodRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  const [
    settingsRes,
    paymentMethodsRes,
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
        min_dispute_wait_hours,
        verification_reminder_hours,
        support_email,
        updated_at
      `)
      .eq('id', 1)
      .maybeSingle(),
    supabase
      .from('platform_payment_methods')
      .select('*')
      .order('created_at', { ascending: true }),
  ]);

  const { data: settings, error: settingsError } = unwrapSingleQuery<{
    default_commission_rate: number;
    default_unpaid_commission_limit: number;
    dispute_window_days: number;
    min_novel_price_pkr: number;
    max_novel_price_pkr: number;
    max_orders_per_hour?: number;
    max_chapter_reads_per_window?: number;
    chapter_read_window_minutes?: number;
    invoice_due_days?: number;
    overdue_grace_days?: number;
    min_dispute_wait_hours?: number;
    verification_reminder_hours?: number;
    support_email: string;
    updated_at: string;
  }>(settingsRes, { context: 'AdminSettingsPage.platform_settings' });

  const { data: paymentMethodsData, error: paymentMethodsError } = unwrapQuery<PlatformPaymentMethodRow[]>(
    paymentMethodsRes,
    { context: 'AdminSettingsPage.payment_methods' }
  );

  let paymentMethods: PlatformPaymentMethodRow[] = paymentMethodsData || [];
  let paymentLoadError = paymentMethodsError;

  // Fallback: If table SELECT failed (e.g. privilege lockdown), query get_platform_payment_instructions RPC
  if (paymentMethodsError || paymentMethods.length === 0) {
    const instructionsRes = await supabase.rpc('get_platform_payment_instructions');
    const { data: instructionsData, error: instructionsError } = unwrapQuery<PlatformPaymentMethodRow[]>(
      instructionsRes,
      { context: 'AdminSettingsPage.get_platform_payment_instructions' }
    );
    if (instructionsData && instructionsData.length > 0) {
      paymentMethods = instructionsData.map((m) => ({
        ...m,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      paymentLoadError = null;
    } else if (instructionsError && paymentMethodsError) {
      paymentLoadError = instructionsError;
    }
  }

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
    min_dispute_wait_hours: 24,
    verification_reminder_hours: 12,
    support_email: 'support@unbpremium.pk',
    updated_at: new Date().toISOString(),
  };

  const currentSettings = settings || fallbackSettings;
  const pageError = settingsError || paymentLoadError;

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

      {pageError && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load platform settings data</h3>
            <p className="text-xs text-red-400/80 mt-1">{pageError.message}</p>
          </div>
        </div>
      )}

      <PlatformSettingsForm initialSettings={currentSettings} />

      <PlatformPaymentMethodsManager initialMethods={paymentMethods} />
    </div>
  );
}

