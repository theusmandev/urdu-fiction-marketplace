import React from 'react';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-main">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 bg-navy text-accent px-4 py-2 rounded-lg shadow-lg font-semibold border border-accent/40"
      >
        Skip to main content
      </a>
      <PublicHeader />
      <main id="main-content" className="flex-1 flex flex-col focus:outline-none">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
