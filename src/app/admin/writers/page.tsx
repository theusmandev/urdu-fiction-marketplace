import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { UrduText } from '@/components/urdu/UrduText';
import { StatusBadge } from '@/components/ui/status-badge';
import { Feather, ChevronRight, Search } from 'lucide-react';
import type { WriterStatus } from '@/types/database';

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
      profiles:id (
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

  const { data: writers } = await queryBuilder;

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
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Feather className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xl font-bold text-white">Writer Directory & Approvals</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage author onboarding, credentials, custom commission rates, and suspension states.
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/50 p-2.5 rounded-2xl border border-slate-800">
        <div className="flex overflow-x-auto gap-1 no-scrollbar">
          {STATUS_TABS.map((tab) => {
            const isActive = currentStatus === tab.value;
            return (
              <Link
                key={tab.value}
                href={`/admin/writers?status=${tab.value}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
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
            placeholder="Search pen name, email..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </form>
      </div>

      {/* Results List */}
      {filteredWriters.length === 0 ? (
        <div className="py-16 text-center bg-slate-950/40 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Feather className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-300">No writers found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No author records matched your current filter criteria.
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
                    <th className="py-3 px-4">Author / Pen Name</th>
                    <th className="py-3 px-4">Account / Email</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Commission Terms</th>
                    <th className="py-3 px-4">Unpaid Balance</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredWriters.map((writer) => {
                    const profile = Array.isArray(writer.profiles) ? writer.profiles[0] : writer.profiles;
                    return (
                      <tr key={writer.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-4 font-sans">
                          <div className="font-semibold text-white">
                            {writer.pen_name_english}
                          </div>
                          <UrduText as="div" size="xs" className="text-amber-400 py-0 font-normal">
                            {writer.pen_name_urdu}
                          </UrduText>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-300 font-mono">{profile?.email}</div>
                          <div className="text-[10px] text-slate-500 font-sans">
                            {profile?.full_name || 'No name'}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <StatusBadge status={writer.status} />
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-300">
                          {writer.custom_commission_rate !== null ? (
                            <span className="text-amber-400 font-mono">
                              {writer.custom_commission_rate}% (Custom)
                            </span>
                          ) : (
                            <span className="text-slate-400">20% (Default)</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-200">
                            PKR {writer.current_unpaid_commission}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Limit: PKR {writer.unpaid_commission_limit}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-sans">
                          <Link
                            href={`/admin/writers/${writer.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
                          >
                            <span>Manage</span>
                            <ChevronRight className="w-3 h-3 text-slate-400" />
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
                  className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-white text-sm">
                        {writer.pen_name_english}
                      </div>
                      <UrduText as="div" size="xs" className="text-amber-400 py-0">
                        {writer.pen_name_urdu}
                      </UrduText>
                    </div>
                    <StatusBadge status={writer.status} />
                  </div>

                  <div className="text-xs text-slate-400 font-mono space-y-0.5 border-t border-slate-800/60 pt-2">
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
                      className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
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
