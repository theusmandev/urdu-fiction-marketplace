import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { UrduText } from '@/components/urdu/UrduText';
import { Clock, FileText, User } from 'lucide-react';
import { StudioShellClient } from '@/components/layout/writer/StudioShellClient';
import { WriterAnnouncementBanner, type WriterAnnouncementData } from '@/components/writer/WriterAnnouncementBanner';
import type { WriterAnnouncementVariant } from '@/types/database';

interface PlatformAnnouncementSettingsRow {
  writer_announcement_enabled?: boolean;
  writer_announcement_variant?: WriterAnnouncementVariant;
  writer_announcement_title_en?: string | null;
  writer_announcement_title_ur?: string | null;
  writer_announcement_body_en?: string | null;
  writer_announcement_body_ur?: string | null;
  writer_announcement_link_url?: string | null;
  writer_announcement_link_label?: string | null;
  writer_announcement_dismissible?: boolean;
  writer_announcement_updated_at?: string | null;
}

import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';

export const metadata: Metadata = {
  title: 'Writer Studio | UNB Premium',
};

export default async function WriterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, writerProfile, isPendingApproval } = await requireWriter('/writer');
  const supabase = await createServerClient();

  // If application is awaiting editorial approval, present the pending state inside the studio shell
  if (isPendingApproval) {
    return (
      <div className="min-h-screen bg-ivory py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-xl w-full">
          <div className="bg-surface rounded-2xl border border-border shadow-md p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-warning-soft border border-warning-border text-accent-strong flex items-center justify-center mx-auto shadow-inner">
              <Clock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-warning-soft text-warning-text">
                Application Under Editorial Review
              </span>
              <h1 className="text-2xl font-serif font-bold text-navy">
                Author Studio Access Pending
              </h1>
              <p className="text-sm text-secondary">
                Thank you for applying to publish on UNB Premium,{' '}
                <strong className="text-main">{writerProfile.pen_name_english}</strong>.
              </p>
            </div>

            <div className="p-4 bg-ivory rounded-xl border border-border text-right space-y-2" dir="rtl">
              <div className="text-xs text-secondary font-urdu">قلمی نام:</div>
              <UrduText as="div" size="xl" className="text-navy">
                {writerProfile.pen_name_urdu}
              </UrduText>
              <p className="text-xs text-secondary leading-relaxed font-urdu">
                آپ کی مصنّف کی درخواست اس وقت ہماری ادارتی ٹیم کے زیرِ جائزہ ہے۔ منظوری کے بعد آپ اپنے ناولز شائع کر سکیں گے اور قارئین کی براہِ راست ادائیگیوں کی تصدیق کر سکیں گے۔
              </p>
            </div>

            <div className="text-xs text-secondary bg-surface-muted p-4 rounded-xl text-left space-y-1 border border-border/60">
              <div><strong>Application Submitted:</strong> {new Date(writerProfile.created_at).toLocaleDateString()}</div>
              <div><strong>Account Email:</strong> {profile.email}</div>
              <div><strong>Terms Accepted:</strong> UNB Author & Payment Agreement v1.0</div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/account"
                className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold rounded-xl bg-surface border border-border text-main hover:bg-ivory transition-colors"
              >
                <User className="w-4 h-4 mr-1.5" />
                View Account Profile
              </Link>
              <Link
                href="/writer/agreement"
                className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold rounded-xl bg-navy text-accent hover:bg-navy-light transition-colors"
              >
                <FileText className="w-4 h-4 mr-1.5" />
                Review Author Agreement
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fetch pending verification count, active disputes count, unread notifications, pending tips count, and announcement
  const [
    pendingVerificationRes,
    disputesRes,
    notificationsRes,
    tipSummaryRes,
    settingsRes,
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('writer_id', user.id)
      .eq('status', 'payment_submitted'),
    supabase
      .from('disputes')
      .select('id, orders!inner(writer_id)', { count: 'exact', head: true })
      .eq('orders.writer_id' as 'order_id', user.id)
      .in('status', ['open', 'under_review']),
    supabase.rpc('get_my_unread_notification_count'),
    supabase.rpc('get_my_tip_summary'),
    supabase
      .from('platform_settings')
      .select(`
        writer_announcement_enabled,
        writer_announcement_variant,
        writer_announcement_title_en,
        writer_announcement_title_ur,
        writer_announcement_body_en,
        writer_announcement_body_ur,
        writer_announcement_link_url,
        writer_announcement_link_label,
        writer_announcement_dismissible,
        writer_announcement_updated_at
      `)
      .eq('id', 1)
      .maybeSingle(),
  ]);

  const { count: pendingVerificationCount } = unwrapQuery(
    pendingVerificationRes,
    'WriterLayout.pendingVerification'
  );
  const { count: openDisputesCount } = unwrapQuery(
    disputesRes,
    'WriterLayout.openDisputes'
  );
  const { data: unreadNotificationsCount } = unwrapQuery(
    notificationsRes,
    'WriterLayout.unreadNotifications'
  );
  const { data: tipSummary } = unwrapQuery<{ pending_confirmation_count?: number }>(
    tipSummaryRes,
    'WriterLayout.tipSummary'
  );
  const { data: rawAnnouncement } = unwrapSingleQuery<PlatformAnnouncementSettingsRow>(
    settingsRes,
    { context: 'WriterLayout.announcement' }
  );

  const announcement: WriterAnnouncementData = {
    enabled: Boolean(rawAnnouncement?.writer_announcement_enabled),
    variant: rawAnnouncement?.writer_announcement_variant || 'info',
    title_en: rawAnnouncement?.writer_announcement_title_en || '',
    title_ur: rawAnnouncement?.writer_announcement_title_ur || '',
    body_en: rawAnnouncement?.writer_announcement_body_en || '',
    body_ur: rawAnnouncement?.writer_announcement_body_ur || '',
    link_url: rawAnnouncement?.writer_announcement_link_url || '',
    link_label: rawAnnouncement?.writer_announcement_link_label || '',
    dismissible: rawAnnouncement?.writer_announcement_dismissible ?? true,
    updated_at: rawAnnouncement?.writer_announcement_updated_at || null,
  };

  return (
    <StudioShellClient
      profile={profile}
      writerProfile={writerProfile}
      pendingVerificationCount={pendingVerificationCount ?? 0}
      pendingTipsCount={tipSummary?.pending_confirmation_count ?? 0}
      openDisputesCount={openDisputesCount ?? 0}
      unreadNotificationsCount={unreadNotificationsCount ?? 0}
    >
      <div className="space-y-6">
        <WriterAnnouncementBanner announcement={announcement} />
        {children}
      </div>
    </StudioShellClient>
  );
}
