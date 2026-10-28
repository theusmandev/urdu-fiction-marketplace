import React from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/requireRole';
import { TipCard } from '@/components/tips/TipCard';
import { ChevronRight, Home, Heart } from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';
import { TIP_CARD_COPY } from '@/lib/copy/tips';

interface NewTipPageProps {
  searchParams: Promise<{
    writer?: string;
    novel?: string;
    chapter?: string;
  }>;
}

export const metadata = {
  title: 'Say Thanks to an Author | UNB Premium',
  description: 'Send a voluntary appreciation gift directly to an Urdu fiction author.',
};

export default async function NewTipPage({ searchParams }: NewTipPageProps) {
  await requireAuth('/tips/new');
  const params = await searchParams;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-secondary">
        <Link href="/" className="hover:text-navy flex items-center gap-1 transition-colors">
          <Home className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
        <Link href="/tips" className="hover:text-navy transition-colors">
          My Thanks
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
        <span className="text-navy font-semibold">{TIP_CARD_COPY.title}</span>
      </nav>

      <div className="text-center space-y-2 pb-2">
        <div className="inline-flex p-3 rounded-2xl bg-warning-soft/80 text-warning-text mx-auto">
          <Heart className="w-6 h-6 fill-accent-strong/30" />
        </div>
        <h1 className="text-2xl font-bold font-serif text-main">
          {TIP_CARD_COPY.title}
        </h1>
        <UrduText as="p" size="sm" className="text-secondary py-0">
          {TIP_CARD_COPY.taglineUrdu}
        </UrduText>
      </div>

      <TipCard
        writerId={params.writer || null}
        novelId={params.novel || null}
        chapterId={params.chapter || null}
      />
    </div>
  );
}
