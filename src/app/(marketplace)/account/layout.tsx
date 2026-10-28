import React from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/requireRole';
import { User, BookOpen, ShoppingBag, Feather, ShieldAlert, LogOut, Mail } from 'lucide-react';
import { logoutUser } from '@/app/actions/auth';


export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, writerProfile } = await requireAuth('/account');

  return (
    <div className="min-h-screen bg-ivory text-main">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Navigation Sidebar */}
          <aside className="w-full md:w-64 shrink-0 space-y-6">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="h-12 w-12 rounded-full overflow-hidden bg-surface-muted border border-accent/40 flex items-center justify-center text-accent font-bold text-lg shrink-0">
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name || 'Avatar'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    profile.full_name?.charAt(0).toUpperCase() || 'U'
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold font-serif text-navy">
                    {profile.full_name || 'Reader'}
                  </p>
                  <p className="truncate text-xs text-secondary">@{profile.username || 'user'}</p>
                  <span className="inline-block mt-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-warning-soft text-warning-text border border-warning-border">
                    {profile.role}
                  </span>
                </div>
              </div>

              <nav className="mt-4 space-y-1">
                <Link
                  href="/account"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-muted hover:text-navy transition-colors"
                >
                  <User className="h-4 w-4 text-accent" />
                  <span>Profile Settings</span>
                </Link>
                <Link
                  href="/account/notifications"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-muted hover:text-navy transition-colors"
                >
                  <Mail className="h-4 w-4 text-accent" />
                  <span>Email Preferences</span>
                </Link>
                <Link
                  href="/library"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-muted hover:text-navy transition-colors"
                >
                  <BookOpen className="h-4 w-4 text-accent" />
                  <span>My Library</span>
                </Link>
                <Link
                  href="/orders"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-muted hover:text-navy transition-colors"
                >
                  <ShoppingBag className="h-4 w-4 text-accent" />
                  <span>My Orders</span>
                </Link>

                {profile.role === 'writer' || writerProfile ? (
                  <Link
                    href="/writer"
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
                  >
                    <Feather className="h-4 w-4 text-accent" />
                    <span>Writer Studio</span>
                  </Link>
                ) : (
                  <Link
                    href="/become-a-writer"
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
                  >
                    <Feather className="h-4 w-4 text-accent" />
                    <span>Become a Writer</span>
                  </Link>
                )}

                {profile.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-danger-text hover:bg-danger-soft transition-colors"
                  >
                    <ShieldAlert className="h-4 w-4 text-danger-text" />
                    <span>Admin Panel</span>
                  </Link>
                )}
              </nav>

              <div className="mt-6 pt-4 border-t border-border">
                <form action={logoutUser}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-secondary hover:bg-danger-soft hover:text-danger-text transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </button>
                </form>
              </div>
            </div>
          </aside>

          {/* Main Area */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
