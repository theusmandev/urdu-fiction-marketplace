import React from 'react';
import { cookies } from 'next/headers';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';
import { BottomNav } from '@/components/layout/BottomNav';
import { AdminPalettePreview } from '@/components/admin/AdminPalettePreview';
import { getHeaderSessionUser } from '@/lib/auth/getHeaderSessionUser';

export default async function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sessionUser, cookieStore] = await Promise.all([
    getHeaderSessionUser(),
    cookies(),
  ]);
  const bannerDismissed = cookieStore.get('unb_banner_dismissed')?.value === 'true';

  return (
    <div
      data-area="marketplace"
      className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col bg-bg text-text"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 bg-primary text-primary-contrast px-4 py-2 rounded-lg shadow-lg font-semibold border border-border"
      >
        Skip to main content
      </a>
      <PublicHeader initialUser={sessionUser} initialBannerDismissed={bannerDismissed} />
      <main
        id="main-content"
        className="flex-1 w-full min-w-0 flex flex-col focus:outline-none pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        {children}
      </main>
      <PublicFooter />
      <BottomNav initialUser={sessionUser} />
      <AdminPalettePreview />
    </div>
  );
}
