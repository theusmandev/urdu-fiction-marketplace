import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { UrduText } from '@/components/urdu/UrduText';
import { StatusBadge } from '@/components/ui/status-badge';
import { Feather, ChevronRight, Search, ShieldAlert } from 'lucide-react';
import type { WriterStatus } from '@/types/database';
import { unwrapQuery } from '@/lib/supabase/query';

interface PageProps {
  searchParams: Promise<{
    status?: string;
    q?: string;
  }>;
}

export default async function AdminWritersPage({ searchParams }: PageProps) {
  await requireRole('admin', '/admin');
  const params = await searchParams;
  const currentStatus = params.status || 'all';
  const query = (params.q || '').trim();

  const supabase = await createServerClient();

  let queryBuilder = supabase
    .from('writer_profiles')
    .select(`
      id,
      pen_name_english,
      pen_name_urdu,
      status,
      custom_commission_rate,
      unpaid_commission_limit,
      current_unpaid_commission,
      is_orders_paused_for_commission,
      agreement_accepted_at,
      created_at,
      profiles:profiles!writer_profiles_id_fkey (
        email,
        full_name,
        username,
        is_active
      )
    `)
    .order('created_at', { ascending: false });

  if (currentStatus !== 'all') {
    queryBuilder = queryBuilder.eq('status', currentStatus as WriterStatus);
  }

  const { data: rawWriters, error } = await queryBuilder;
  const { data: writers, error: queryError } = unwrapQuery({ data: rawWriters, error }, 'AdminWritersPage');

  // Filter in memory for search query across email or pen names
  const filteredWriters = (writers || []).filter((w) => {
    if (!query) return true;
    const qLower = query.toLowerCase();
    const profile = Array.isArray(w.profiles) ? w.profiles[0] : w.profiles;
    return (
      w.pen_name_english.toLowerCase().includes(qLower) ||
      w.pen_name_urdu.includes(query) ||
      profile?.email.toLowerCase().includes(qLower) ||
      (profile?.username && profile.username.toLowerCase().includes(qLower))
    );
  });

  const STATUS_TABS = [
    { label: 'All Writers', value: 'all' },
    { label: 'Pending Approval', value: 'pending_approval' },
    { label: 'Approved', value: 'approved' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Rejected', value: 'rejected' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <Feather className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xl font-bold text-main">Writer Directory & Approvals</h1>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Manage author onboarding, credentials, custom platform fee rates, and suspension states.
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface p-2.5 rounded-2xl border border-border shadow-card">
        <div className="flex overflow-x-auto gap-1 no-scrollbar">
          {STATUS_TABS.map((tab) => {
            const isActive = currentStatus === tab.value;
            return (
              <Link
                key={tab.value}
                href={`/admin/writers?status=${tab.value}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-accent-admin text-white shadow-sm'
                    : 'text-muted hover:text-main hover:bg-surface-muted'
                }`}
              >
                {tab.label}
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
            placeholder="Search pen name, email..."
            className="w-full bg-surface-muted border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin"
          />
        </form>
      </div>

      {/* Results List */}
      {queryError ? (
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600" />
            <span>Database Error Loading Writers Catalog</span>
          </div>
          <p className="text-xs text-rose-700 leading-relaxed">
            Unable to retrieve author records from the database:
          </p>
          <div className="p-3 rounded-xl bg-white border border-rose-200 text-xs font-mono text-rose-800">
            {queryError.message} {queryError.code ? `(Code: ${queryError.code})` : ''}
          </div>
          {queryError.hint && (
            <p className="text-[11px] text-muted italic">Hint: {queryError.hint}</p>
          )}
        </div>
      ) : filteredWriters.length === 0 ? (
        <div className="py-16 text-center bg-surface rounded-2xl border border-border shadow-card space-y-2">
          <div className="w-12 h-12 rounded-full bg-surface-muted border border-border flex items-center justify-center mx-auto text-muted">
            <Feather className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-main">No writers found</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            No author records matched your current filter criteria.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="w-full overflow-x-auto rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted border-b border-border text-muted font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3 sm:px-4">Author / Pen Name</th>
                    <th className="py-2.5 px-3 sm:px-4">Account / Email</th>
                    <th className="py-2.5 px-3 sm:px-4">Status</th>
                    <th className="py-2.5 px-3 sm:px-4">Platform Fee Terms</th>
                    <th className="py-2.5 px-3 sm:px-4">Unpaid Balance</th>
                    <th className="py-2.5 px-3 sm:px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredWriters.map((writer) => {
                    const profile = Array.isArray(writer.profiles) ? writer.profiles[0] : writer.profiles;
                    return (
                      <tr key={writer.id} className="hover:bg-surface-muted/50 transition-colors">
                        <td className="py-2.5 px-3 sm:px-4 font-sans max-w-[180px]">
                          <div className="font-semibold text-main truncate break-words" title={writer.pen_name_english}>
                            {writer.pen_name_english}
                          </div>
                          <UrduText as="div" size="xs" className="text-brand-gold py-0 font-normal truncate">
                            {writer.pen_name_urdu}
                          </UrduText>
                        </td>
                        <td className="py-2.5 px-3 sm:px-4 max-w-[200px]">
                          <div className="text-main font-mono truncate break-all" title={profile?.email}>{profile?.email}</div>
                          <div className="text-[10px] text-muted font-sans truncate">
                            {profile?.full_name || 'No name'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 sm:px-4 font-sans whitespace-nowrap">
                          <StatusBadge status={writer.status} />
                        </td>
                        <td className="py-2.5 px-3 sm:px-4 font-sans text-main whitespace-nowrap">
                          {writer.custom_commission_rate !== null ? (
                            <span className="text-accent-admin font-mono font-semibold">
                              {writer.custom_commission_rate}% (Custom)
                            </span>
                          ) : (
                            <span className="text-muted">20% (Default)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 sm:px-4 font-mono whitespace-nowrap">
                          <div className="text-main font-semibold">
                            PKR {writer.current_unpaid_commission}
                          </div>
                          <div className="text-[10px] text-muted">
                            Limit: PKR {writer.unpaid_commission_limit}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 sm:px-4 text-right font-sans whitespace-nowrap">
                          <Link
                            href={`/admin/writers/${writer.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-muted text-main border border-border text-xs font-semibold shadow-sm transition-colors"
                          >
                            <span>Manage</span>
                            <ChevronRight className="w-3.5 h-3.5 text-muted" />
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
            {filteredWriters.map((writer) => {
              const profile = Array.isArray(writer.profiles) ? writer.profiles[0] : writer.profiles;
              return (
                <div
                  key={writer.id}
                  className="bg-surface border border-border rounded-xl p-4 space-y-3 shadow-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-main text-sm">
                        {writer.pen_name_english}
                      </div>
                      <UrduText as="div" size="xs" className="text-brand-gold py-0">
                        {writer.pen_name_urdu}
                      </UrduText>
                    </div>
                    <StatusBadge status={writer.status} />
                  </div>

                  <div className="text-xs text-muted font-mono space-y-0.5 border-t border-border pt-2">
                    <div>Email: {profile?.email}</div>
                    <div>
                      Balance: PKR {writer.current_unpaid_commission} / Limit: PKR {writer.unpaid_commission_limit}
                    </div>
                    <div>
                      Rate:{' '}
                      {writer.custom_commission_rate !== null
                        ? `${writer.custom_commission_rate}% (Custom)`
                        : '20% (Default)'}
                    </div>
                  </div>

                  <div className="pt-1">
                    <Link
                      href={`/admin/writers/${writer.id}`}
                      className="w-full py-2 rounded-lg bg-surface hover:bg-surface-muted text-main border border-border text-xs font-semibold flex items-center justify-center gap-1 shadow-sm transition-colors"
                    >
                      <span>Manage Writer Details</span>
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
