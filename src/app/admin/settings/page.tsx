import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapSingleQuery } from '@/lib/supabase/query';
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
        tips_enabled,
        tip_min_pkr,
        tip_max_pkr,
        max_tips_per_hour,
        tip_daily_cap_pkr_per_reader,
        tip_confirm_reminder_hours,
        updated_at
      `)
      .eq('id', 1)
      .maybeSingle(),
    supabase
      .from('platform_payment_methods')
      .select('id, method_type, account_title, account_number_or_iban, bank_name, instructions_note, is_active, created_at, updated_at')
      .order('created_at', { ascending: true }),
  ]);

  const { data: rawSettings, error: settingsError } = unwrapSingleQuery<{
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
    tips_enabled?: boolean;
    tip_min_pkr?: number;
    tip_max_pkr?: number;
    max_tips_per_hour?: number;
    tip_daily_cap_pkr_per_reader?: number;
    tip_confirm_reminder_hours?: number;
    updated_at: string;
  }>(settingsRes, { context: 'AdminSettingsPage.platform_settings' });

  let paymentMethods: PlatformPaymentMethodRow[] = [];
  let paymentLoadError: { code?: string; message: string } | null = null;

  // Gracefully handle platform payment methods:
  // 1. Direct table query succeeds (including 0 rows, which is a valid empty list)
  if (paymentMethodsRes.data && !paymentMethodsRes.error) {
    paymentMethods = (paymentMethodsRes.data as PlatformPaymentMethodRow[]).map((m) => ({
      id: String(m.id),
      method_type: m.method_type,
      account_title: String(m.account_title),
      account_number_or_iban: String(m.account_number_or_iban),
      bank_name: m.bank_name ? String(m.bank_name) : null,
      instructions_note: m.instructions_note ? String(m.instructions_note) : null,
      is_active: Boolean(m.is_active),
      created_at: String(m.created_at),
      updated_at: String(m.updated_at),
    }));
  } else if (paymentMethodsRes.error) {
    // 2. Direct table SELECT failed (e.g. privilege lockdown before policy migration), fallback to RPC
    const rawErr = paymentMethodsRes.error;
    const hasErrMsg = Boolean(rawErr.message || rawErr.code || (typeof rawErr === 'object' && Object.keys(rawErr).length > 0));
    if (hasErrMsg) {
      console.warn('[AdminSettingsPage.payment_methods] Table query failed, attempting RPC fallback:', rawErr.message || rawErr.code);
    }

    const instructionsRes = await supabase.rpc('get_platform_payment_instructions');
    if (instructionsRes.error) {
      const rpcErr = instructionsRes.error;
      if (rpcErr.message || rpcErr.code) {
        console.error('[AdminSettingsPage.get_platform_payment_instructions]:', rpcErr);
        paymentLoadError = {
          code: rpcErr.code,
          message: rpcErr.message || 'Failed to load platform payment methods.',
        };
      }
    } else if (Array.isArray(instructionsRes.data)) {
      paymentMethods = (instructionsRes.data as Array<Record<string, unknown>>).map((m) => ({
        id: String(m.id || ''),
        method_type: (m.method_type as PlatformPaymentMethodRow['method_type']) || 'bank_transfer',
        account_title: String(m.account_title || ''),
        account_number_or_iban: String(m.account_number_or_iban || ''),
        bank_name: m.bank_name ? String(m.bank_name) : null,
        instructions_note: m.instructions_note ? String(m.instructions_note) : null,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }));
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
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const currentSettings = rawSettings
    ? {
        default_commission_rate: Number(rawSettings.default_commission_rate ?? 20),
        default_unpaid_commission_limit: Number(rawSettings.default_unpaid_commission_limit ?? 5000),
        dispute_window_days: Number(rawSettings.dispute_window_days ?? 3),
        min_novel_price_pkr: Number(rawSettings.min_novel_price_pkr ?? 50),
        max_novel_price_pkr: Number(rawSettings.max_novel_price_pkr ?? 5000),
        max_orders_per_hour: Number(rawSettings.max_orders_per_hour ?? 5),
        max_chapter_reads_per_window: Number(rawSettings.max_chapter_reads_per_window ?? 20),
        chapter_read_window_minutes: Number(rawSettings.chapter_read_window_minutes ?? 10),
        invoice_due_days: Number(rawSettings.invoice_due_days ?? 7),
        overdue_grace_days: Number(rawSettings.overdue_grace_days ?? 3),
        min_dispute_wait_hours: Number(rawSettings.min_dispute_wait_hours ?? 24),
        verification_reminder_hours: Number(rawSettings.verification_reminder_hours ?? 12),
        support_email: String(rawSettings.support_email ?? 'support@unbpremium.pk'),
        updated_at: String(rawSettings.updated_at ?? '2026-01-01T00:00:00.000Z'),
      }
    : fallbackSettings;

  const pageError = settingsError || paymentLoadError;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <Settings className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xl font-bold text-main">Global Platform Configuration</h1>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Configure default platform fee, author balance pause limits, dispute windows, and pricing ceilings.
          </p>
        </div>
      </div>

      {pageError && (
        <div className="p-4 rounded-xl border border-danger-border bg-danger-soft text-danger-text flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-danger-text" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load platform settings data</h3>
            <p className="text-xs text-danger-text/90 mt-1">{pageError.message}</p>
          </div>
        </div>
      )}

      <PlatformSettingsForm initialSettings={currentSettings} />

      <PlatformPaymentMethodsManager initialMethods={paymentMethods} />
    </div>
  );
}

