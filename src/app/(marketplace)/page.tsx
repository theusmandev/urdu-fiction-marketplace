import React from "react";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { NovelCard } from "@/components/catalog/NovelCard";
import {
  getFeaturedNovels,
  getNewestNovels,
  getPublicGenres,
} from "@/lib/supabase/public";
import {
  BookMarked,
  Feather,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Smartphone,
  CheckCircle2,
  BookOpen,
  Search,
} from "lucide-react";

export const revalidate = 120; // 2 minutes ISR revalidation

export default async function HomePage() {
  const [featuredNovels, newestNovels, genres] = await Promise.all([
    getFeaturedNovels(6),
    getNewestNovels(8),
    getPublicGenres(),
  ]);

  return (
    <div className="flex flex-col min-h-screen bg-bg text-text">
      {/* 1. HERO SECTION (Warm Light Aesthetic) */}
      <section className="relative overflow-hidden bg-gradient-to-b from-bg to-surface-muted text-text pt-10 pb-14 sm:pt-16 sm:pb-20 md:pt-20 md:pb-24 border-b border-border">
        {/* Subtle decorative geometric overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(var(--color-accent)_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 sm:space-y-8">
          {/* Primary Headings with Urdu Nastaliq Elegance */}
          <div className="space-y-4 max-w-4xl mx-auto">
            <UrduText
              as="h1"
              size="4xl"
              className="text-text leading-[2.2] py-1 text-2xl sm:text-4xl md:text-5xl font-normal"
            >
              معیاری اردو فکشن اور ناولز کا مستند ادبی مرکز
            </UrduText>

            {/* One Gold Accent Line */}
            <div className="h-1 w-24 bg-accent rounded-full mx-auto" />

            <p className="font-serif text-base sm:text-lg md:text-xl text-text-muted max-w-xl mx-auto font-normal leading-relaxed">
              Direct reader-to-writer Pakistani fiction marketplace.
            </p>
          </div>

          {/* Action CTAs: Primary button + search shortcut with minimum 44px touch targets */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-2">
            <Link
              href="/novels"
              className="btn-primary text-xs sm:text-sm shadow-md"
            >
              <BookOpen className="w-4 h-4" />
              <span>Browse Catalog / ناولز دریافت کریں</span>
            </Link>

            <Link
              href="/novels"
              className="btn-secondary text-xs sm:text-sm"
            >
              <Search className="w-4 h-4 text-accent-strong" />
              <span>Search Novels / تلاش</span>
            </Link>

            <Link
              href="/become-a-writer"
              className="hidden sm:inline-flex btn-secondary text-xs sm:text-sm"
            >
              <Feather className="w-4 h-4 text-accent-strong" />
              <span>Sell Your Novels / مصنف بنیں</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 2. COMPACT TRUST STRIP (Direct Reader-to-Writer Payments) */}
      <section className="bg-surface border-b border-border py-3.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-text-muted">
          <div className="inline-flex items-center gap-2 font-medium text-text">
            <ShieldCheck className="w-4 h-4 text-accent-strong shrink-0" />
            <span>100% Direct Reader-to-Writer Pakistani Payments</span>
          </div>
          <span className="hidden sm:inline text-border">•</span>
          <div className="flex flex-wrap items-center gap-2">
            <span>Directly via:</span>
            <span className="px-2 py-0.5 rounded bg-surface-muted text-text font-medium border border-border">
              JazzCash
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-muted text-text font-medium border border-border">
              EasyPaisa
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-muted text-text font-medium border border-border">
              Raast
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-muted text-text font-medium border border-border">
              Direct Bank
            </span>
          </div>
        </div>
      </section>

      {/* 3. HOW DIRECT PAYMENT WORKS (Honest & Transparent) */}
      <section className="py-16 md:py-20 bg-surface-muted/40 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-semibold text-accent-strong uppercase tracking-wider">
              Transparency & Security
            </span>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-text">
              How Direct Payment Works
            </h2>
            <UrduText size="base" className="text-text-muted py-0">
              براہ راست ادائیگی کا شفاف اور محفوظ طریقہ کار
            </UrduText>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-surface p-6 rounded-2xl border border-border shadow-card flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-accent-soft text-accent-strong border border-border flex items-center justify-center font-bold">
                <Smartphone className="w-6 h-6 text-accent-strong" />
              </div>
              <h3 className="font-serif text-lg font-bold text-text">
                1. Transfer to Author
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Send the exact novel price directly to the author&apos;s verified
                JazzCash, EasyPaisa, Raast, or Bank IBAN. The platform never holds
                your money.
              </p>
            </div>

            <div className="bg-surface p-6 rounded-2xl border border-border shadow-card flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary border border-border flex items-center justify-center font-bold">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-serif text-lg font-bold text-text">
                2. Submit TID & Receipt
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Provide your bank or wallet Transaction Reference (TID) and payment
                screenshot. The writer is immediately notified to verify the deposit.
              </p>
            </div>

            <div className="bg-surface p-6 rounded-2xl border border-border shadow-card flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-success-soft text-success-text border border-success-border flex items-center justify-center font-bold">
                <Sparkles className="w-6 h-6 text-success" />
              </div>
              <h3 className="font-serif text-lg font-bold text-text">
                3. Instant Access Unlocked
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Once the author confirms receipt in their account, your novel is
                unlocked permanently in your personal library with complete Nastaliq
                reading controls.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FEATURED NOVELS SHOWCASE */}
      <section className="py-16 md:py-20 bg-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-4">
            <div>
              <span className="text-xs font-semibold text-accent-strong uppercase tracking-wider">
                Curated Selection
              </span>
              <h2 className="font-serif text-2xl md:text-3xl font-bold text-text">
                Featured Novels
              </h2>
            </div>
            <Link
              href="/novels?sort=featured"
              className="text-xs font-semibold text-accent-strong hover:underline transition-colors inline-flex items-center gap-1"
            >
              <span>View all featured</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {featuredNovels.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 w-full min-w-0">
              {featuredNovels.map((novel, idx) => (
                <NovelCard key={novel.id} novel={novel} priority={idx < 3} />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center bg-surface-muted/50 rounded-2xl border border-dashed border-border space-y-3">
              <BookMarked className="w-10 h-10 text-text-muted mx-auto" />
              <p className="text-sm font-medium text-text">
                No featured novels yet
              </p>
              <UrduText size="sm" className="text-text-muted py-0">
                جلد ہی نئے اور منتخب ناولز شامل کیے جائیں گے۔
              </UrduText>
            </div>
          )}
        </div>
      </section>

      {/* 5. BROWSE BY GENRE */}
      {genres.length > 0 && (
        <section className="py-16 bg-surface-muted/30 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 min-w-0">
            <div className="text-center space-y-2">
              <span className="text-xs font-semibold text-accent-strong uppercase tracking-wider">
                Taxonomy & Themes
              </span>
              <h2 className="font-serif text-2xl md:text-3xl font-bold text-text">
                Explore by Genre
              </h2>
              <UrduText size="base" className="text-text-muted py-0">
                اصنافِ ادب کے ذریعے ناولز کی تلاش
              </UrduText>
            </div>

            <div className="flex sm:grid overflow-x-auto snap-x snap-mandatory gap-3 pb-3 sm:pb-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 w-full min-w-0">
              {genres.map((genre) => (
                <Link
                  key={genre.id}
                  href={`/genres/${genre.slug}`}
                  className="group bg-surface hover:bg-surface-muted p-3.5 sm:p-4 rounded-xl border border-border hover:border-primary shadow-xs transition-all duration-200 flex flex-col items-center text-center space-y-1.5 w-[145px] sm:w-auto shrink-0 snap-start"
                >
                  <UrduText
                    as="span"
                    size="base"
                    className="text-text group-hover:text-primary font-normal py-0 leading-[2.2]"
                  >
                    {genre.name_urdu}
                  </UrduText>
                  <span className="text-xs font-medium text-text-muted group-hover:text-text">
                    {genre.name_english}
                  </span>
                  <span className="text-[10px] bg-surface-muted text-text-muted px-2 py-0.5 rounded-full mt-1 border border-border">
                    {genre.published_novels_count}{" "}
                    {genre.published_novels_count === 1 ? "novel" : "novels"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 6. NEWEST RELEASES */}
      <section className="py-16 md:py-20 bg-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-4 min-w-0">
            <div>
              <span className="text-xs font-semibold text-accent-strong uppercase tracking-wider">
                Fresh Stories
              </span>
              <h2 className="font-serif text-2xl md:text-3xl font-bold text-text">
                New Releases
              </h2>
            </div>
            <Link
              href="/novels?sort=newest"
              className="text-xs font-semibold text-accent-strong hover:underline transition-colors inline-flex items-center gap-1 shrink-0"
            >
              <span>Explore all new releases</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {newestNovels.length > 0 ? (
            <div className="flex sm:grid overflow-x-auto snap-x snap-mandatory gap-3 pb-3 sm:pb-0 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 w-full min-w-0">
              {newestNovels.map((novel) => (
                <div key={novel.id} className="w-[155px] sm:w-auto shrink-0 snap-start flex flex-col h-full">
                  <NovelCard novel={novel} />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center bg-surface-muted/50 rounded-2xl border border-dashed border-border space-y-3">
              <BookMarked className="w-10 h-10 text-text-muted mx-auto" />
              <p className="text-sm font-medium text-text">
                No novels published yet
              </p>
              <UrduText size="sm" className="text-text-muted py-0">
                نئے ناولز جلد دستیاب ہوں گے۔
              </UrduText>
            </div>
          )}
        </div>
      </section>

      {/* 7. RECRUITMENT CALLOUT: SELL YOUR NOVELS (Warm Light Editorial Style) */}
      <section className="bg-surface-muted/40 text-text py-16 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-surface p-8 md:p-12 rounded-3xl border border-border flex flex-col md:flex-row items-center justify-between gap-8 shadow-card">
            <div className="space-y-4 max-w-xl">
              <span className="text-xs font-semibold text-accent-strong uppercase tracking-wider">
                For Urdu Writers
              </span>
              <UrduText
                as="h2"
                size="3xl"
                className="text-text leading-[2.2] py-0"
              >
                کیا آپ باصلاحیت افسانہ نگار یا ناول نگار ہیں؟
              </UrduText>
              <p className="text-sm text-text-muted leading-relaxed">
                Join UNB Premium as an author. Keep up to 80% of novel sales, receive
                payments directly from readers to your Pakistani bank account or wallet,
                and maintain 100% intellectual property rights.
              </p>
            </div>

            <div className="shrink-0 flex flex-col sm:flex-row gap-4">
              <Link
                href="/become-a-writer"
                className="btn-primary"
              >
                <Feather className="w-4 h-4" />
                <span>Apply to Publish</span>
              </Link>
              <Link
                href="/how-it-works"
                className="btn-secondary"
              >
                <span>Learn More</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
