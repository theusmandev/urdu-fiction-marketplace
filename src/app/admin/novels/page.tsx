import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { UrduText } from '@/components/urdu/UrduText';
import { StatusBadge } from '@/components/ui/status-badge';
import { BookOpen, Search, ChevronRight, Star, AlertCircle, ShieldAlert } from 'lucide-react';
import type { NovelStatus } from '@/types/database';
import { unwrapQuery } from '@/lib/supabase/query';

interface PageProps {
  searchParams: Promise<{
    status?: string;
    q?: string;
  }>;
}

export default async function AdminNovelsPage({ searchParams }: PageProps) {
  await requireRole('admin', '/admin');
  const params = await searchParams;
  const currentStatus = params.status || 'all';
  const query = (params.q || '').trim();

  const supabase = await createServerClient();

  let queryBuilder = supabase
    .from('novels')
    .select(`
      id,
      slug,
      title_urdu,
      title_english,
      synopsis_urdu,
      cover_url,
      price_pkr,
      status,
      is_featured,
      total_chapters,
      rights_declaration_accepted,
      created_at,
      published_at,
      writer_profiles!writer_id (
        id,
        pen_name_english,
        pen_name_urdu
      )
    `)
    .order('created_at', { ascending: false });

  if (currentStatus !== 'all') {
    queryBuilder = queryBuilder.eq('status', currentStatus as NovelStatus);
  }

  const { data: rawNovels, error } = await queryBuilder;
  const { data: novels, error: queryError } = unwrapQuery({ data: rawNovels, error }, 'AdminNovelsPage');

  // Filter in memory for query across title or pen name
  const filtered = (novels || []).filter((n) => {
    if (!query) return true;
    const qLower = query.toLowerCase();
    const writer = Array.isArray(n.writer_profiles) ? n.writer_profiles[0] : n.writer_profiles;

    return (
      n.title_english.toLowerCase().includes(qLower) ||
      n.title_urdu.includes(query) ||
      (writer?.pen_name_english && writer.pen_name_english.toLowerCase().includes(qLower)) ||
      (writer?.pen_name_urdu && writer.pen_name_urdu.includes(query))
    );
  });

  // Prioritize `under_review` at top of default view
  const sortedNovels = [...filtered].sort((a, b) => {
    if (currentStatus === 'all') {
      if (a.status === 'under_review' && b.status !== 'under_review') return -1;
      if (b.status === 'under_review' && a.status !== 'under_review') return 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const STATUS_TABS = [
    { label: 'All Novels', value: 'all' },
    { label: 'Under Review', value: 'under_review' },
    { label: 'Published', value: 'published' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Draft', value: 'draft' },
  ];

  const pendingCount = (novels || []).filter((n) => n.status === 'under_review').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xl font-bold text-white">Novel Moderation & Catalog</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Review submitted manuscripts, verify intellectual rights declarations, approve or suspend publications.
          </p>
        </div>

        {pendingCount > 0 && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>{pendingCount} Novel{pendingCount > 1 ? 's' : ''} awaiting moderation</span>
          </div>
        )}
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/50 p-2.5 rounded-2xl border border-slate-800">
        <div className="flex overflow-x-auto gap-1 no-scrollbar">
          {STATUS_TABS.map((tab) => {
            const isActive = currentStatus === tab.value;
            return (
              <Link
                key={tab.value}
                href={`/admin/novels?status=${tab.value}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span>{tab.label}</span>
                {tab.value === 'under_review' && pendingCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <form method="get" className="relative w-full md:w-64">
          <input type="hidden" name="status" value={currentStatus} />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search title, author, email..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
        </form>
      </div>

      {/* Error State */}
      {queryError ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>Database Error Loading Novel Catalog</span>
          </div>
          <p className="text-xs text-rose-200/90 leading-relaxed">
            Unable to retrieve novels from the database due to a query or permissions error:
          </p>
          <div className="p-3 rounded-xl bg-slate-950/80 border border-rose-900/40 text-xs font-mono text-rose-300">
            {queryError.message} {queryError.code ? `(Code: ${queryError.code})` : ''}
          </div>
          {queryError.hint && (
            <p className="text-[11px] text-slate-400 italic">Hint: {queryError.hint}</p>
          )}
        </div>
      ) : sortedNovels.length === 0 ? (
        <div className="py-16 text-center bg-slate-950/40 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-300">No novels found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No manuscripts matched your current filter criteria.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Novel Title (EN / UR)</th>
                    <th className="py-3 px-4">Author</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Price / Chapters</th>
                    <th className="py-3 px-4">Rights Declared</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sortedNovels.map((novel) => {
                    const writer = Array.isArray(novel.writer_profiles)
                      ? novel.writer_profiles[0]
                      : novel.writer_profiles;
                    const isUnderReview = novel.status === 'under_review';

                    return (
                      <tr
                        key={novel.id}
                        className={`transition-colors ${
                          isUnderReview ? 'bg-amber-500/[0.03] hover:bg-amber-500/[0.06]' : 'hover:bg-slate-900/40'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{novel.title_english}</span>
                            {novel.is_featured && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-medium">
                                <Star className="w-2.5 h-2.5 fill-amber-300" /> Featured
                              </span>
                            )}
                          </div>
                          <UrduText as="div" size="xs" className="text-amber-400 py-0">
                            {novel.title_urdu}
                          </UrduText>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="text-slate-300 font-medium">
                            {writer?.pen_name_english || 'Unknown'}
                          </div>
                          <UrduText as="div" size="xs" className="text-slate-400 py-0 font-normal">
                            {writer?.pen_name_urdu || ''}
                          </UrduText>
                        </td>

                        <td className="py-3.5 px-4">
                          <StatusBadge status={novel.status} />
                        </td>

                        <td className="py-3.5 px-4 font-mono">
                          <div className="text-slate-200">PKR {Number(novel.price_pkr).toLocaleString()}</div>
                          <div className="text-[10px] text-slate-500">{novel.total_chapters} chapters</div>
                        </td>

                        <td className="py-3.5 px-4 font-mono">
                          {novel.rights_declaration_accepted ? (
                            <span className="text-[11px] text-emerald-400 font-sans flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Accepted
                            </span>
                          ) : (
                            <span className="text-[11px] text-rose-400 font-sans flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" /> Missing
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <Link
                            href={`/admin/novels/${novel.id}`}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              isUnderReview
                                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            }`}
                          >
                            <span>{isUnderReview ? 'Review Now' : 'Inspect'}</span>
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {sortedNovels.map((novel) => {
              const writer = Array.isArray(novel.writer_profiles)
                ? novel.writer_profiles[0]
                : novel.writer_profiles;
              const isUnderReview = novel.status === 'under_review';

              return (
                <div
                  key={novel.id}
                  className={`bg-slate-950/60 border rounded-xl p-4 space-y-3 ${
                    isUnderReview ? 'border-amber-500/40 bg-amber-500/[0.02]' : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white text-sm">{novel.title_english}</span>
                        {novel.is_featured && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            ★ Featured
                          </span>
                        )}
                      </div>
                      <UrduText as="div" size="xs" className="text-amber-400 py-0">
                        {novel.title_urdu}
                      </UrduText>
                    </div>
                    <StatusBadge status={novel.status} />
                  </div>

                  <div className="text-xs text-slate-400 font-mono space-y-0.5 border-t border-slate-800/60 pt-2">
                    <div>Author: {writer?.pen_name_english || 'Unknown'}</div>
                    <div>Price: PKR {Number(novel.price_pkr).toLocaleString()} • {novel.total_chapters} Chapters</div>
                    <div>
                      Rights: {novel.rights_declaration_accepted ? 'Accepted' : 'Missing'}
                    </div>
                  </div>

                  <div className="pt-1">
                    <Link
                      href={`/admin/novels/${novel.id}`}
                      className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                        isUnderReview
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      }`}
                    >
                      <span>{isUnderReview ? 'Review Manuscript Now' : 'Inspect Details'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
