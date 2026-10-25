import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { UrduText } from '@/components/urdu/UrduText';
import { StatusBadge } from '@/components/ui/status-badge';
import { WriterActions } from '@/components/admin/WriterActions';
import {
  Feather,
  ArrowLeft,
  Calendar,
  CreditCard,
  BookOpen,
  Mail,
  User,
  Shield,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AdminWriterDetailPage({ params }: PageProps) {
  await requireRole('admin', '/admin');
  const { id: writerId } = await params;

  const supabase = await createServerClient();

  // 1. Fetch writer profile with user profile
  const writerRes = await supabase
    .from('writer_profiles')
    .select(`
      id,
      pen_name_english,
      pen_name_urdu,
      bio_english,
      bio_urdu,
      status,
      custom_commission_rate,
      unpaid_commission_limit,
      current_unpaid_commission,
      is_orders_paused_for_commission,
      agreement_accepted_at,
      created_at,
      updated_at,
      profiles:profiles!writer_profiles_id_fkey (
        id,
        email,
        full_name,
        username,
        role,
        is_active,
        created_at
      )
    `)
    .eq('id', writerId)
    .maybeSingle();

  const { data: writer, error: writerError, isNotFound } = unwrapSingleQuery(
    writerRes,
    'AdminWriterDetailPage'
  );

  if (writerError) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-8">
        <Link
          href="/admin/writers"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Authors Directory</span>
        </Link>
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>Database Error Loading Author Profile</span>
          </div>
          <p className="text-xs text-rose-200/90 leading-relaxed">
            A database error occurred while retrieving this writer profile:
          </p>
          <div className="p-3 rounded-xl bg-slate-950/80 border border-rose-900/40 text-xs font-mono text-rose-300">
            {writerError.message} {writerError.code ? `(Code: ${writerError.code})` : ''}
          </div>
          {writerError.hint && (
            <p className="text-[11px] text-slate-400 italic">Hint: {writerError.hint}</p>
          )}
        </div>
      </div>
    );
  }

  if (isNotFound || !writer) {
    notFound();
  }

  const profile = Array.isArray(writer.profiles) ? writer.profiles[0] : writer.profiles;

  // 2. Fetch writer payment methods & novels
  const [pmRes, novelsRes] = await Promise.all([
    supabase
      .from('writer_payment_methods')
      .select('id, method_type, account_title, account_number_or_iban, bank_name, instructions_note, is_active, created_at')
      .eq('writer_id', writerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('novels')
      .select('id, slug, title_urdu, title_english, price_pkr, status, is_featured, total_chapters, created_at, published_at')
      .eq('writer_id', writerId)
      .order('created_at', { ascending: false }),
  ]);

  const { data: paymentMethods } = unwrapQuery(pmRes, 'AdminWriterDetailPage.paymentMethods');
  const { data: novels } = unwrapQuery(novelsRes, 'AdminWriterDetailPage.novels');

  // Helper to mask account number / IBAN
  const maskAccountNumber = (num: string) => {
    if (!num) return '••••';
    const clean = num.trim();
    if (clean.length <= 4) return '••••';
    return `••••••••${clean.slice(-4)}`;
  };

  const METHOD_LABELS: Record<string, string> = {
    jazzcash: 'JazzCash',
    easypaisa: 'EasyPaisa',
    raast: 'Raast (Instant)',
    bank_transfer: 'Direct Bank Transfer',
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/writers"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Writer Directory</span>
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge status={writer.status} />
          {writer.is_orders_paused_for_commission && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Orders Paused (Limit Exceeded)
            </span>
          )}
        </div>
      </div>

      {/* Author Header Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Feather className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                  {writer.pen_name_english}
                </h1>
                <UrduText as="div" size="lg" className="text-amber-400 font-medium py-0">
                  {writer.pen_name_urdu}
                </UrduText>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <div className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-300 font-mono">{profile?.email}</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>@{profile?.username || 'no-username'}</span>
                {profile?.full_name && <span className="text-slate-500">({profile.full_name})</span>}
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Joined {new Date(writer.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Interactive Actions Component */}
          <div className="shrink-0 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80">
            <div className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              Administrative Actions
            </div>
            <WriterActions
              writerId={writer.id}
              status={writer.status}
              customRate={writer.custom_commission_rate}
              unpaidLimit={Number(writer.unpaid_commission_limit)}
            />
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Agreement & Commission Info */}
        <div className="space-y-6">
          {/* Commission & Limits Card */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span>Commission & Ledger Status</span>
            </h2>

            <div className="space-y-3 text-xs font-mono">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400 font-sans">Applicable Commission:</span>
                <span className="font-semibold text-white">
                  {writer.custom_commission_rate !== null ? (
                    <span className="text-amber-400">{writer.custom_commission_rate}% (Custom)</span>
                  ) : (
                    <span className="text-slate-300">20.00% (Platform Default)</span>
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400 font-sans">Current Unpaid Balance:</span>
                <span className="font-bold text-emerald-400">
                  PKR {Number(writer.current_unpaid_commission).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400 font-sans">Unpaid Limit Threshold:</span>
                <span className="text-slate-200">
                  PKR {Number(writer.unpaid_commission_limit).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5">
                <span className="text-slate-400 font-sans">Order Acceptance:</span>
                <span>
                  {writer.is_orders_paused_for_commission ? (
                    <span className="text-rose-400 flex items-center gap-1 font-sans font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" /> Paused (Over Limit)
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-sans font-semibold">Active & Accepting</span>
                  )}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 text-[11px] text-slate-400">
              Platform rule: If unpaid commission reaches PKR {Number(writer.unpaid_commission_limit).toLocaleString()}, new orders are paused automatically until an invoice settlement is recorded.
            </div>
          </div>

          {/* Agreement Acceptance Details */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>Author Terms Agreement</span>
            </h2>
            <div className="text-xs text-slate-300 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className={writer.agreement_accepted_at ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                  {writer.agreement_accepted_at ? 'Accepted' : 'Pending Acceptance'}
                </span>
              </div>
              {writer.agreement_accepted_at && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Timestamp:</span>
                  <span className="font-mono text-slate-200">
                    {new Date(writer.agreement_accepted_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Author Biographies */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-white">Author Bio & Notes</h2>
            {writer.bio_english && (
              <div className="text-xs text-slate-300">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-semibold">English</div>
                <p className="bg-slate-900 p-3 rounded-xl border border-slate-800/60 leading-relaxed">
                  {writer.bio_english}
                </p>
              </div>
            )}
            {writer.bio_urdu && (
              <div className="text-xs text-slate-300">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-semibold">Urdu</div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/60">
                  <UrduText as="div" size="sm" className="leading-[2.2] text-slate-200">
                    {writer.bio_urdu}
                  </UrduText>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right 2 Columns: Payment Methods & Novel Portfolio */}
        <div className="lg:col-span-2 space-y-6">
          {/* Direct Payment Methods (Safe metadata, masked accounts) */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Registered Payment Methods ({paymentMethods?.length || 0})</span>
              </h2>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Account Numbers Masked
              </span>
            </div>

            {!paymentMethods || paymentMethods.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No payout or reader-receiving methods registered by this author yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {paymentMethods.map((pm) => (
                  <div
                    key={pm.id}
                    className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">
                        {METHOD_LABELS[pm.method_type] || pm.method_type}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          pm.is_active
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {pm.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="text-xs font-mono text-slate-300 space-y-0.5">
                      <div className="text-slate-400 text-[11px] font-sans">
                        Title: <span className="text-white font-medium">{pm.account_title}</span>
                      </div>
                      <div>
                        Number: <span className="text-amber-400">{maskAccountNumber(pm.account_number_or_iban)}</span>
                      </div>
                      {pm.bank_name && (
                        <div className="text-[11px] text-slate-400 font-sans">
                          Bank: <span className="text-slate-300">{pm.bank_name}</span>
                        </div>
                      )}
                    </div>

                    {pm.instructions_note && (
                      <div className="text-[10px] text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60 italic">
                        &quot;{pm.instructions_note}&quot;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Author Novels Portfolio */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>Novels Portfolio ({novels?.length || 0})</span>
              </h2>
            </div>

            {!novels || novels.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                This author has not created any novels yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                {novels.map((novel) => (
                  <div
                    key={novel.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/80 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">
                          {novel.title_english}
                        </span>
                        <StatusBadge status={novel.status} />
                        {novel.is_featured && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Featured
                          </span>
                        )}
                      </div>
                      <UrduText as="div" size="sm" className="text-amber-400 py-0">
                        {novel.title_urdu}
                      </UrduText>
                      <div className="text-[11px] text-slate-400 flex items-center gap-3 font-mono">
                        <span>PKR {Number(novel.price_pkr).toLocaleString()}</span>
                        <span>•</span>
                        <span>{novel.total_chapters} Chapters</span>
                        <span>•</span>
                        <span>Created {new Date(novel.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Link
                        href={`/admin/novels/${novel.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
                      >
                        <span>Review Novel</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
