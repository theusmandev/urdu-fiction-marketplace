import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { UserManagementTable, UserItem } from '@/components/admin/UserManagementTable';
import { Users, Search, AlertCircle } from 'lucide-react';
import type { UserRole } from '@/types/database';

interface PageProps {
  searchParams: Promise<{
    role?: string;
    q?: string;
  }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const { user } = await requireRole('admin', '/admin');
  const params = await searchParams;
  const currentRole = params.role || 'all';
  const query = (params.q || '').trim();

  const supabase = await createServerClient();

  let queryBuilder = supabase
    .from('profiles')
    .select('id, email, username, full_name, role, is_active, created_at')
    .order('created_at', { ascending: false });

  if (currentRole !== 'all') {
    queryBuilder = queryBuilder.eq('role', currentRole as UserRole);
  }

  const usersRes = await queryBuilder;
  const { data: rawUsers, error: usersError } = unwrapQuery<UserItem[]>(usersRes, {
    context: 'AdminUsersPage.fetchUsers',
  });

  // Filter in memory for email or username or full name
  const filteredUsers = (rawUsers || []).filter((u) => {
    if (!query) return true;
    const qLower = query.toLowerCase();
    return (
      u.email.toLowerCase().includes(qLower) ||
      (u.username && u.username.toLowerCase().includes(qLower)) ||
      (u.full_name && u.full_name.toLowerCase().includes(qLower)) ||
      u.role.toLowerCase().includes(qLower)
    );
  }) as UserItem[];

  const ROLE_TABS = [
    { label: 'All Users', value: 'all' },
    { label: 'Administrators', value: 'admin' },
    { label: 'Writers', value: 'writer' },
    { label: 'Readers', value: 'reader' },
  ];

  return (
    <div className="space-y-6">
      {usersError && (
        <div className="p-4 rounded-xl border border-danger-border bg-danger-soft text-danger-text flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-danger-text" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load users</h3>
            <p className="text-xs text-danger-text/90 mt-1">{usersError.message}</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <Users className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xl font-bold text-main">Platform User Governance</h1>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Manage user roles, ban/deactivate accounts, and inspect access permissions across the system.
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface p-2.5 rounded-2xl border border-border shadow-card">
        <div className="flex overflow-x-auto gap-1 no-scrollbar">
          {ROLE_TABS.map((tab) => {
            const isActive = currentRole === tab.value;
            return (
              <Link
                key={tab.value}
                href={`/admin/users?role=${tab.value}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
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
          <input type="hidden" name="role" value={currentRole} />
          <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search email, username..."
            className="w-full bg-surface-muted border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-ring-admin/20 focus:border-accent-admin transition-colors"
          />
        </form>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="py-16 text-center bg-surface rounded-2xl border border-border shadow-card space-y-2">
          <div className="w-12 h-12 rounded-full bg-surface-muted border border-border flex items-center justify-center mx-auto text-muted">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-main">No users found</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            No profile records matched your current query or role filter.
          </p>
        </div>
      ) : (
        <UserManagementTable
          users={filteredUsers}
          currentAdminId={user.id}
        />
      )}
    </div>
  );
}
