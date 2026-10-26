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
} from "lucide-react";

export const revalidate = 120; // 2 minutes ISR revalidation

export default async function HomePage() {
  const [featuredNovels, newestNovels, genres] = await Promise.all([
    getFeaturedNovels(6),
    getNewestNovels(8),
    getPublicGenres(),
  ]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy via-navy to-[#121c2e] text-white pt-8 pb-12 sm:pt-16 sm:pb-20 md:pt-24 md:pb-32">
        {/* Subtle decorative geometric overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(#C5A880_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-5 sm:space-y-8">
          {/* Trust Badge - hidden on phones to eliminate duplicate badge chrome */}
          <div className="hidden sm:inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/15 text-xs text-slate-200 shadow-inner">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span>100% Direct Reader-to-Writer Pakistani Payments</span>
          </div>

          {/* Primary Headings with Urdu Nastaliq Elegance */}
          <div className="space-y-3 sm:space-y-4 max-w-4xl mx-auto">
            <UrduText
              as="h1"
              size="4xl"
              className="text-white drop-shadow-md leading-[2.2] py-1 text-2xl sm:text-4xl md:text-5xl font-normal"
            >
              معیاری اردو فکشن اور ناولز کا مستند ادبی مرکز
            </UrduText>
            <p className="font-serif text-sm sm:text-base md:text-xl text-slate-300 max-w-xl mx-auto font-normal leading-relaxed">
              Direct reader-to-writer Pakistani fiction marketplace.
            </p>
          </div>

          {/* Action CTAs with minimum 44px touch targets */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-2 sm:pt-4">
            <Link
              href="/novels"
              className="inline-flex items-center gap-2.5 bg-accent hover:bg-accent-light text-navy font-semibold px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all text-xs sm:text-sm min-h-[44px]"
            >
              <BookOpen className="w-4 h-4" />
              <span>Browse Catalog / ناولز دریافت کریں</span>
            </Link>

            <Link
              href="/novels"
              className="sm:hidden inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-4 py-3 rounded-xl border border-white/20 transition-all text-xs min-h-[44px]"
            >
              <span>Explore All</span>
              <ArrowRight className="w-3.5 h-3.5 text-accent" />
            </Link>

            <Link
              href="/become-a-writer"
              className="hidden sm:inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-3.5 rounded-xl border border-white/20 transition-all text-sm min-h-[44px]"
            >
              <Feather className="w-4 h-4 text-accent" />
              <span>Sell Your Novels / مصنف بنیں</span>
            </Link>
          </div>
        </div>
      </section>

      {/* HOW DIRECT PAYMENT WORKS (Honest & Transparent) */}
      <section className="py-16 md:py-20 bg-ivory/50 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-semibold text-accent uppercase tracking-wider">
              Transparency & Security
            </span>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-navy">
              How Direct Payment Works
            </h2>
            <UrduText size="base" className="text-secondary py-0">
              براہ راست ادائیگی کا شفاف اور محفوظ طریقہ کار
            </UrduText>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-accent/20 text-navy flex items-center justify-center font-bold">
                <Smartphone className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-serif text-lg font-bold text-navy">
                1. Transfer to Author
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                Send the exact novel price directly to the author&apos;s verified
                JazzCash, EasyPaisa, Raast, or Bank IBAN. The platform never holds
                your money.
              </p>
            </div>

            <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-navy text-accent flex items-center justify-center font-bold">
                <CheckCircle2 className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-serif text-lg font-bold text-navy">
                2. Submit TID & Receipt
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                Provide your bank or wallet Transaction Reference (TID) and payment
                screenshot. The writer is immediately notified to verify the deposit.
              </p>
            </div>

            <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold">
                <Sparkles className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="font-serif text-lg font-bold text-navy">
                3. Instant Access Unlocked
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                Once the author confirms receipt in their account, your novel is
                unlocked permanently in your personal library with complete Nastaliq
                reading controls.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED NOVELS SHOWCASE */}
      <section className="py-16 md:py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-4">
            <div>
              <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                Curated Selection
              </span>
              <h2 className="font-serif text-2xl md:text-3xl font-bold text-navy">
                Featured Novels
              </h2>
            </div>
            <Link
              href="/novels?sort=featured"
              className="text-xs font-semibold text-accent hover:text-accent-dark transition-colors inline-flex items-center gap-1"
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
            <div className="p-12 text-center bg-ivory/50 rounded-2xl border border-dashed border-border space-y-3">
              <BookMarked className="w-10 h-10 text-secondary mx-auto" />
              <p className="text-sm font-medium text-navy">
                No featured novels yet
              </p>
              <UrduText size="sm" className="text-secondary py-0">
                جلد ہی نئے اور منتخب ناولز شامل کیے جائیں گے۔
              </UrduText>
            </div>
          )}
        </div>
      </section>

      {/* BROWSE BY GENRE */}
      {genres.length > 0 && (
        <section className="py-16 bg-ivory/40 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 min-w-0">
            <div className="text-center space-y-2">
              <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                Taxonomy & Themes
              </span>
              <h2 className="font-serif text-2xl md:text-3xl font-bold text-navy">
                Explore by Genre
              </h2>
              <UrduText size="base" className="text-secondary py-0">
                اصنافِ ادب کے ذریعے ناولز کی تلاش
              </UrduText>
            </div>

            <div className="flex sm:grid overflow-x-auto snap-x snap-mandatory gap-3 pb-3 sm:pb-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 w-full min-w-0">
              {genres.map((genre) => (
                <Link
                  key={genre.id}
                  href={`/genres/${genre.slug}`}
                  className="group bg-surface hover:bg-navy p-3.5 sm:p-4 rounded-xl border border-border hover:border-navy shadow-xs transition-all duration-200 flex flex-col items-center text-center space-y-1.5 w-[145px] sm:w-auto shrink-0 snap-start"
                >
                  <UrduText
                    as="span"
                    size="base"
                    className="text-navy group-hover:text-accent font-normal py-0 leading-[2.2]"
                  >
                    {genre.name_urdu}
                  </UrduText>
                  <span className="text-xs font-medium text-secondary group-hover:text-slate-300">
                    {genre.name_english}
                  </span>
                  <span className="text-[10px] bg-ivory group-hover:bg-white/10 text-secondary group-hover:text-slate-400 px-2 py-0.5 rounded-full mt-1">
                    {genre.published_novels_count}{" "}
                    {genre.published_novels_count === 1 ? "novel" : "novels"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* NEWEST RELEASES */}
      <section className="py-16 md:py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-4 min-w-0">
            <div>
              <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                Fresh Stories
              </span>
              <h2 className="font-serif text-2xl md:text-3xl font-bold text-navy">
                New Releases
              </h2>
            </div>
            <Link
              href="/novels?sort=newest"
              className="text-xs font-semibold text-accent hover:text-accent-dark transition-colors inline-flex items-center gap-1 shrink-0"
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
            <div className="p-12 text-center bg-ivory/50 rounded-2xl border border-dashed border-border space-y-3">
              <BookMarked className="w-10 h-10 text-secondary mx-auto" />
              <p className="text-sm font-medium text-navy">
                No novels published yet
              </p>
              <UrduText size="sm" className="text-secondary py-0">
                نئے ناولز جلد دستیاب ہوں گے۔
              </UrduText>
            </div>
          )}
        </div>
      </section>

      {/* RECRUITMENT CALLOUT: SELL YOUR NOVELS */}
      <section className="bg-navy text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-navy-light to-navy p-8 md:p-12 rounded-3xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl">
            <div className="space-y-4 max-w-xl">
              <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                For Urdu Writers
              </span>
              <UrduText
                as="h2"
                size="3xl"
                className="text-white leading-[2.2] py-0"
              >
                کیا آپ باصلاحیت افسانہ نگار یا ناول نگار ہیں؟
              </UrduText>
              <p className="text-sm text-slate-300 leading-relaxed">
                Join UNB Premium as an author. Keep up to 80% of novel sales, receive
                payments directly from readers to your Pakistani bank account or wallet,
                and maintain 100% intellectual property rights.
              </p>
            </div>

            <div className="shrink-0 flex flex-col sm:flex-row gap-4">
              <Link
                href="/become-a-writer"
                className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-light text-navy font-semibold px-6 py-3.5 rounded-xl shadow-lg transition-all text-sm"
              >
                <Feather className="w-4 h-4" />
                <span>Apply to Publish</span>
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-3.5 rounded-xl border border-white/20 transition-all text-sm"
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
