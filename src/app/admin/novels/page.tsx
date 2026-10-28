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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <BookOpen className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-main">Novel Moderation & Catalog</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Review submitted manuscripts, verify intellectual rights declarations, approve or suspend publications.
          </p>
        </div>

        {pendingCount > 0 && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-warning-soft border border-warning-border text-warning-text text-xs font-semibold shadow-sm">
            <AlertCircle className="w-4 h-4 text-accent-strong" />
            <span>{pendingCount} Novel{pendingCount > 1 ? 's' : ''} awaiting moderation</span>
          </div>
        )}
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface p-2.5 rounded-2xl border border-border shadow-card">
        <div className="flex overflow-x-auto gap-1 no-scrollbar">
          {STATUS_TABS.map((tab) => {
            const isActive = currentStatus === tab.value;
            return (
              <Link
                key={tab.value}
                href={`/admin/novels?status=${tab.value}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-accent-admin text-white shadow-sm'
                    : 'text-muted hover:text-main hover:bg-surface-muted'
                }`}
              >
                <span>{tab.label}</span>
                {tab.value === 'under_review' && pendingCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-warning-soft text-warning-text text-[10px] font-bold flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <form method="get" className="relative w-full md:w-64">
          <input type="hidden" name="status" value={currentStatus} />
          <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search title, author, email..."
            className="w-full bg-surface border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring-admin focus:border-accent-admin"
          />
        </form>
      </div>

      {/* Error State */}
      {queryError ? (
        <div className="p-6 rounded-2xl bg-danger-soft border border-danger-border space-y-3">
          <div className="flex items-center gap-2 text-danger-text font-bold text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0 text-danger-text" />
            <span>Database Error Loading Novel Catalog</span>
          </div>
          <p className="text-xs text-danger-text/90 leading-relaxed">
            Unable to retrieve novels from the database due to a query or permissions error:
          </p>
          <div className="p-3 rounded-xl bg-surface border border-danger-border text-xs font-mono text-danger-text">
            {queryError.message} {queryError.code ? `(Code: ${queryError.code})` : ''}
          </div>
          {queryError.hint && (
            <p className="text-[11px] text-muted italic">Hint: {queryError.hint}</p>
          )}
        </div>
      ) : sortedNovels.length === 0 ? (
        <div className="py-16 text-center bg-surface rounded-2xl border border-border space-y-2 shadow-card">
          <div className="w-12 h-12 rounded-full bg-surface-muted border border-border flex items-center justify-center mx-auto text-muted">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-main">No novels found</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            No manuscripts matched your current filter criteria.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="w-full overflow-x-auto rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted border-b border-border text-muted font-medium text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 sm:px-4">Novel Title (EN / UR)</th>
                    <th className="py-2.5 px-3 sm:px-4">Author</th>
                    <th className="py-2.5 px-3 sm:px-4">Status</th>
                    <th className="py-2.5 px-3 sm:px-4">Price / Chapters</th>
                    <th className="py-2.5 px-3 sm:px-4">Rights Declared</th>
                    <th className="py-2.5 px-3 sm:px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedNovels.map((novel) => {
                    const writer = Array.isArray(novel.writer_profiles)
                      ? novel.writer_profiles[0]
                      : novel.writer_profiles;
                    const isUnderReview = novel.status === 'under_review';

                    return (
                      <tr
                        key={novel.id}
                        className={`transition-colors ${
                          isUnderReview ? 'bg-warning-soft/40 hover:bg-warning-soft/70' : 'hover:bg-surface-muted/50'
                        }`}
                      >
                        <td className="py-2.5 px-3 sm:px-4 max-w-[220px]">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-main truncate break-words" title={novel.title_english}>{novel.title_english}</span>
                            {novel.is_featured && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-warning-soft text-warning-text border border-warning-border font-medium shrink-0">
                                <Star className="w-2.5 h-2.5 fill-accent-strong/20 text-accent-strong" /> Featured
                              </span>
                            )}
                          </div>
                          <UrduText as="div" size="xs" className="text-accent-strong py-0 truncate">
                            {novel.title_urdu}
                          </UrduText>
                        </td>

                        <td className="py-2.5 px-3 sm:px-4 max-w-[180px]">
                          <div className="text-main font-medium truncate break-words" title={writer?.pen_name_english || 'Unknown'}>
                            {writer?.pen_name_english || 'Unknown'}
                          </div>
                          <UrduText as="div" size="xs" className="text-muted py-0 font-normal truncate">
                            {writer?.pen_name_urdu || ''}
                          </UrduText>
                        </td>

                        <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                          <StatusBadge status={novel.status} />
                        </td>

                        <td className="py-2.5 px-3 sm:px-4 font-mono whitespace-nowrap">
                          <div className="text-main font-bold">PKR {Number(novel.price_pkr).toLocaleString()}</div>
                          <div className="text-[10px] text-muted">{novel.total_chapters} chapters</div>
                        </td>

                        <td className="py-2.5 px-3 sm:px-4 font-mono whitespace-nowrap">
                          {novel.rights_declaration_accepted ? (
                            <span className="text-[11px] text-success-text font-sans flex items-center gap-1 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-success" /> Accepted
                            </span>
                          ) : (
                            <span className="text-[11px] text-danger-text font-sans flex items-center gap-1 font-medium">
                              <ShieldAlert className="w-3.5 h-3.5 text-danger-text" /> Missing
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap">
                          <Link
                            href={`/admin/novels/${novel.id}`}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm ${
                              isUnderReview
                                ? 'bg-warning hover:bg-primary text-white'
                                : 'bg-surface hover:bg-surface-muted text-main border border-border'
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
                  className={`bg-surface border rounded-xl p-4 space-y-3 shadow-card ${
                    isUnderReview ? 'border-warning-border bg-warning-soft/20' : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-main text-sm">{novel.title_english}</span>
                        {novel.is_featured && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning-soft text-warning-text border border-warning-border">
                            ★ Featured
                          </span>
                        )}
                      </div>
                      <UrduText as="div" size="xs" className="text-accent-strong py-0">
                        {novel.title_urdu}
                      </UrduText>
                    </div>
                    <StatusBadge status={novel.status} />
                  </div>

                  <div className="text-xs text-muted space-y-0.5 border-t border-border pt-2">
                    <div>Author: <span className="text-main font-medium">{writer?.pen_name_english || 'Unknown'}</span></div>
                    <div>Price: <span className="font-mono text-main font-semibold">PKR {Number(novel.price_pkr).toLocaleString()}</span> • {novel.total_chapters} Chapters</div>
                    <div>
                      Rights: {novel.rights_declaration_accepted ? (
                        <span className="text-success-text font-semibold">Accepted</span>
                      ) : (
                        <span className="text-danger-text font-semibold">Missing</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-1">
                    <Link
                      href={`/admin/novels/${novel.id}`}
                      className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-sm ${
                        isUnderReview
                          ? 'bg-warning hover:bg-primary text-white'
                          : 'bg-surface hover:bg-surface-muted text-main border border-border'
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
