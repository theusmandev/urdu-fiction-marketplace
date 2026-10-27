import React from 'react';
import type { Metadata } from 'next';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';
import { WriterTipsClient, type WriterReceivedTipItem } from './WriterTipsClient';
import type {
  WriterTipSettingsRow,
  WriterPaymentMethodRow,
  TipSummaryPayload,
} from '@/types/database';

export const metadata: Metadata = {
  title: 'Thanks Received | Writer Studio | UNB Premium',
  description: 'Manage reader tips, verification queue, presets, and private monthly gift totals.',
};

export default async function WriterTipsPage() {
  const { user, writerProfile } = await requireWriter('/writer/tips');
  const supabase = await createServerClient();

  const [
    settingsRes,
    methodsRes,
    tipsRes,
    summaryRes,
  ] = await Promise.all([
    supabase.rpc('get_my_tip_settings'),
    supabase
      .from('writer_payment_methods')
      .select('*')
      .eq('writer_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase.rpc('get_my_received_tips', {
      p_status: null,
      p_limit: 100,
      p_offset: 0,
    }),
    supabase.rpc('get_my_tip_summary'),
  ]);

  const { data: settingsData } = unwrapSingleQuery<WriterTipSettingsRow>(settingsRes, {
    context: 'WriterTipsPage.get_my_tip_settings',
  });

  const { data: methodsData } = unwrapQuery<WriterPaymentMethodRow[]>(methodsRes, {
    context: 'WriterTipsPage.payment_methods',
  });

  const { data: tipsData } = unwrapQuery<WriterReceivedTipItem[]>(tipsRes, {
    context: 'WriterTipsPage.get_my_received_tips',
  });

  const { data: summaryData } = unwrapSingleQuery<TipSummaryPayload>(summaryRes, {
    context: 'WriterTipsPage.get_my_tip_summary',
  });

  const settings: WriterTipSettingsRow = settingsData || {
    writer_id: user.id,
    enabled: false,
    thank_you_message: 'شکریہ! آپ کی پزیرائی کا بہت شکریہ۔',
    preset_amounts: [100, 250, 500],
    min_amount: null,
    max_amount: null,
    updated_at: new Date().toISOString(),
  };

  const paymentMethods: WriterPaymentMethodRow[] = Array.isArray(methodsData) ? methodsData : [];
  const tips: WriterReceivedTipItem[] = Array.isArray(tipsData) ? tipsData : [];
  const summary: TipSummaryPayload = summaryData || {
    writer_id: user.id,
    confirmed_tips_count: 0,
    confirmed_total_pkr: 0,
    unique_supporters_count: 0,
    pending_confirmation_count: 0,
  };

  return (
    <WriterTipsClient
      initialSettings={settings}
      initialPaymentMethods={paymentMethods}
      initialTips={tips}
      initialSummary={summary}
      writerPenName={writerProfile.pen_name_english || writerProfile.pen_name_urdu || 'Author'}
    />
  );
}
