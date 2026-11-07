import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { UrduText } from '@/components/urdu/UrduText';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';
import { WriterAgreementContent } from '@/components/legal/WriterAgreementContent';
import { Feather, ChevronRight, Home, ArrowRight, BookOpen } from 'lucide-react';

export const revalidate = 86400; // 24 hours ISR

export const metadata: Metadata = {
  title: 'Writer Platform Agreement — مصنفین کا معاہدہ شراکت | UNB Premium',
  description:
    'Author platform agreement, direct reader payment verification rules, and platform fee terms for Urdu fiction writers on UNB Premium.',
  alternates: {
    canonical: '/writer-agreement',
  },
  openGraph: {
    title: 'Writer Platform Agreement — مصنفین کا معاہدہ شراکت | UNB Premium',
    description:
      'Author platform agreement, direct reader payment verification rules, and platform fee terms for Urdu fiction writers on UNB Premium.',
    url: '/writer-agreement',
    type: 'website',
    locale: 'en_PK',
    alternateLocale: ['ur_PK'],
    images: [
      {
        url: `${siteConfig.url}/brand/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'UNB Premium Writer Platform Agreement',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Writer Platform Agreement — مصنفین کا معاہدہ شراکت | UNB Premium',
    description:
      'Author platform agreement, direct reader payment verification rules, and platform fee terms for Urdu fiction writers on UNB Premium.',
    images: [`${siteConfig.url}/brand/og-image.png`],
  },
};

export default function WriterAgreementPublicPage() {
  const breadcrumbs = buildBreadcrumbJsonLd([
    { name: 'Writer Platform Agreement', path: '/writer-agreement' },
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 space-y-8">
      <JsonLd data={breadcrumbs} />

      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-secondary">
        <Link href="/" className="hover:text-navy flex items-center gap-1 transition-colors">
          <Home className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
        <Link href="/terms" className="hover:text-navy transition-colors">
          Legal
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
        <span className="text-navy font-semibold">Writer Agreement</span>
      </nav>

      {/* Main Agreement Content */}
      <div className="rounded-3xl border border-border/80 bg-surface p-6 sm:p-10 md:p-12 shadow-sm space-y-8">
        <WriterAgreementContent showHeader={true} />

        {/* Action Footer for Visitors / Applicants */}
        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left space-y-0.5">
            <h3 className="font-semibold text-sm text-navy">Ready to publish your stories?</h3>
            <UrduText as="p" size="xs" className="text-secondary py-0">
              اپنی تخلیقات شائع کرنے اور لاکھوں قارئین تک پہنچنے کے لیے ابھی درخواست دیں
            </UrduText>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/become-a-writer"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs sm:text-sm font-bold text-navy hover:bg-accent-dark transition-all shadow-sm hover:shadow-md min-h-[44px]"
            >
              <Feather className="w-4 h-4" />
              <span>Apply to Become a Writer</span>
            </Link>
            <Link
              href="/terms"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-secondary hover:text-navy hover:bg-surface-elevated transition-colors min-h-[44px]"
            >
              <span>General Terms</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

