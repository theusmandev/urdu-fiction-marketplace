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
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Navigation Sidebar */}
          <aside className="w-full md:w-64 shrink-0 space-y-6">
            <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-5 backdrop-blur-md">
              <div className="flex items-center gap-3 border-b border-stone-800 pb-4">
                <div className="h-12 w-12 rounded-full overflow-hidden bg-stone-800 border border-amber-600/30 flex items-center justify-center text-amber-500 font-bold text-lg shrink-0">
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
                  <p className="truncate font-semibold text-white">
                    {profile.full_name || 'Reader'}
                  </p>
                  <p className="truncate text-xs text-stone-400">@{profile.username || 'user'}</p>
                  <span className="inline-block mt-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {profile.role}
                  </span>
                </div>
              </div>

              <nav className="mt-4 space-y-1">
                <Link
                  href="/account"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-300 hover:bg-stone-800 hover:text-white transition-colors"
                >
                  <User className="h-4 w-4 text-amber-500" />
                  <span>Profile Settings</span>
                </Link>
                <Link
                  href="/account/notifications"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-300 hover:bg-stone-800 hover:text-white transition-colors"
                >
                  <Mail className="h-4 w-4 text-amber-500" />
                  <span>Email Preferences</span>
                </Link>
                <Link
                  href="/library"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-300 hover:bg-stone-800 hover:text-white transition-colors"
                >
                  <BookOpen className="h-4 w-4 text-amber-500" />
                  <span>My Library</span>
                </Link>
                <Link
                  href="/orders"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-300 hover:bg-stone-800 hover:text-white transition-colors"
                >
                  <ShoppingBag className="h-4 w-4 text-amber-500" />
                  <span>My Orders</span>
                </Link>

                {profile.role === 'writer' || writerProfile ? (
                  <Link
                    href="/writer"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    <Feather className="h-4 w-4 text-amber-400" />
                    <span>Writer Studio</span>
                  </Link>
                ) : (
                  <Link
                    href="/become-a-writer"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    <Feather className="h-4 w-4 text-amber-400" />
                    <span>Become a Writer</span>
                  </Link>
                )}

                {profile.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <ShieldAlert className="h-4 w-4 text-red-400" />
                    <span>Admin Panel</span>
                  </Link>
                )}
              </nav>

              <div className="mt-6 pt-4 border-t border-stone-800">
                <form action={logoutUser}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-400 hover:bg-red-950/40 hover:text-red-300 transition-colors cursor-pointer"
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
