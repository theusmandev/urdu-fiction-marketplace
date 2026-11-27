import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { UrduText } from "@/components/urdu/UrduText";
import { NovelCard } from "@/components/catalog/NovelCard";
import type { PublicNovel } from "@/types/database";
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

const TRUST_PAYMENT_PILLS = ["JazzCash", "EasyPaisa", "Raast", "Bank"] as const;

const PAYMENT_STEPS = [
  {
    number: "01",
    title: "Transfer to Author",
    description:
      "Send the novel price directly to the author's verified JazzCash, EasyPaisa, Raast, or Bank IBAN. The platform never holds your money.",
    urduLabel: "مصنف کے اکاؤنٹ میں براہِ راست رقم بھیجیں",
    icon: Smartphone,
    iconContainerClass: "bg-accent-soft text-accent-strong border-border",
    iconClass: "text-accent-strong",
  },
  {
    number: "02",
    title: "Submit TID & Receipt",
    description:
      "Provide your bank or wallet Transaction Reference (TID) and receipt screenshot. The writer is notified immediately to verify.",
    urduLabel: "رسید اور ٹرانزیکشن آئی ڈی جمع کروائیں",
    icon: CheckCircle2,
    iconContainerClass: "bg-primary/10 text-primary border-border",
    iconClass: "text-primary",
  },
  {
    number: "03",
    title: "Instant Access Unlocked",
    description:
      "Once the author confirms receipt, your novel unlocks permanently in your personal library with full Nastaliq reading controls.",
    urduLabel: "تصدیق کے فوراً بعد مکمل ناول پڑھیں",
    icon: Sparkles,
    iconContainerClass: "bg-success-soft text-success-text border-success-border",
    iconClass: "text-success",
  },
] as const;

const WRITER_VALUE_CHIPS = [
  "Up to 70% Author Share",
  "Direct Payouts",
  "100% IP Rights",
] as const;

interface NovelShowcaseSectionProps {
  eyebrow: string;
  title: string;
  urduTitle: string;
  viewAllHref: string;
  novels: PublicNovel[];
  prioritizeFirst?: boolean;
}

/**
 * Shared novel showcase block enforcing compact single-row headers
 * and a consistent 2-column mobile grid across discovery sections.
 */
function NovelShowcaseSection({
  eyebrow,
  title,
  urduTitle,
  viewAllHref,
  novels,
  prioritizeFirst = false,
}: NovelShowcaseSectionProps) {
  return (
    <section className="py-10 sm:py-14 md:py-16 bg-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 min-w-0">
        <div className="flex items-end justify-between gap-3 border-b border-border pb-3.5 min-w-0">
          <div className="min-w-0">
            <span className="text-[11px] sm:text-xs font-semibold text-accent-strong uppercase tracking-wider block">
              {eyebrow}
            </span>
            <div className="flex items-baseline gap-2.5 flex-wrap mt-0.5">
              <h2 className="font-serif text-xl sm:text-2xl md:text-3xl font-bold text-text">
                {title}
              </h2>
              <UrduText
                as="span"
                size="sm"
                className="text-text-muted py-0 leading-snug text-left"
              >
                {urduTitle}
              </UrduText>
            </div>
          </div>

          <Link
            href={viewAllHref}
            className="text-xs font-semibold text-accent-strong hover:underline transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 pb-0.5"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 w-full min-w-0">
          {novels.map((novel, idx) => (
            <NovelCard
              key={novel.id}
              novel={novel}
              priority={prioritizeFirst && idx === 0}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export const metadata: Metadata = {
  title: {
    absolute: "UNB Premium — Urdu Novels & Fiction Marketplace",
  },
  description:
    "Buy and read original Urdu novels directly from Pakistani authors. Pay securely via JazzCash, EasyPaisa, or Raast with instant digital access.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "UNB Premium — Urdu Novels & Fiction Marketplace",
    description:
      "Buy and read original Urdu novels directly from Pakistani authors. Pay securely via JazzCash, EasyPaisa, or Raast with instant digital access.",
    url: "/",
    type: "website",
    locale: "en_PK",
    alternateLocale: ["ur_PK"],
    images: [
      {
        url: `${siteConfig.url}/brand/og-image.png`,
        width: 1200,
        height: 630,
        alt: "UNB Premium — Urdu Novels & Fiction Marketplace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "UNB Premium — Urdu Novels & Fiction Marketplace",
    description:
      "Buy and read original Urdu novels directly from Pakistani authors. Pay securely via JazzCash, EasyPaisa, or Raast with instant digital access.",
    images: [`${siteConfig.url}/brand/og-image.png`],
  },
};

export default async function HomePage() {
  const [featuredNovels, newestNovels, genres] = await Promise.all([
    getFeaturedNovels(6),
    getNewestNovels(8),
    getPublicGenres(),
  ]);

  const showFeatured = featuredNovels.length > 0;
  const showFallbackNewest = !showFeatured && newestNovels.length > 0;
  const showNoNovelsEmpty = !showFeatured && newestNovels.length === 0;

  return (
    <div className="flex flex-col min-h-screen bg-bg text-text">
      {/* 1. COMPACT HERO SECTION (Warm Light Aesthetic) */}
      <section className="relative overflow-hidden bg-gradient-to-b from-bg to-surface-muted text-text py-10 sm:py-14 md:py-20 border-b border-border">
        {/* Subtle decorative geometric overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(var(--color-accent)_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-5 sm:space-y-7">
          {/* Primary Headings with Urdu Nastaliq Elegance */}
          <div className="space-y-3.5 max-w-4xl mx-auto">
            <UrduText
              as="h1"
              size="4xl"
              className="text-text text-center leading-[2.2] py-1 text-2xl sm:text-4xl md:text-5xl font-normal"
            >
              بہترین اردو ناولز اور فکشن کا پریمیم پلیٹ فارم
            </UrduText>

            {/* One Gold Accent Line */}
            <div className="h-1 w-20 sm:w-24 bg-accent rounded-full mx-auto" />

            <p className="font-serif text-base sm:text-lg md:text-xl text-text-muted max-w-xl mx-auto font-normal leading-relaxed text-center">
              Connecting readers directly with Pakistan&apos;s finest storytellers.
            </p>
            <UrduText
              size="base"
              className="text-text-muted text-center max-w-xl mx-auto font-normal py-0 leading-[2.2]"
            >
              پسندیدہ ناولز کے مفت ابواب پڑھیں، مصنفین کو سپورٹ کریں، اور آسان ادائیگی سے مکمل کہانی کا لطف اٹھائیں۔
            </UrduText>
          </div>

          {/* Focused 2-Tier Action CTAs visible on both mobile and desktop */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-1 max-w-xs sm:max-w-none mx-auto">
            <Link
              href="/novels"
              className="btn-primary w-full sm:w-auto text-xs sm:text-sm shadow-md"
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span className="inline-flex items-center gap-1.5">
                <span>Browse Novels</span>
                <span className="opacity-50 select-none" aria-hidden="true">·</span>
                <span dir="rtl" lang="ur" className="font-urdu text-xs sm:text-sm leading-normal">
                  ناولز دریافت کریں
                </span>
              </span>
            </Link>

            <Link
              href="/become-a-writer"
              className="btn-secondary w-full sm:w-auto text-xs sm:text-sm"
            >
              <Feather className="w-4 h-4 text-accent-strong shrink-0" />
              <span className="inline-flex items-center gap-1.5">
                <span>Publish as a Writer</span>
                <span className="opacity-50 select-none" aria-hidden="true">·</span>
                <span dir="rtl" lang="ur" className="font-urdu text-xs sm:text-sm leading-normal">
                  مصنف بنیں
                </span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* 2. CENTERED COMPACT TRUST STRIP (Direct Reader-to-Writer Payments) */}
      <section className="bg-surface border-b border-border py-3 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs text-text-muted text-center">
          <div className="inline-flex items-center justify-center gap-1.5 font-medium text-text">
            <ShieldCheck className="w-4 h-4 text-accent-strong shrink-0" />
            <span>100% Direct Reader-to-Writer Payments</span>
          </div>
          <span className="hidden sm:inline text-border select-none" aria-hidden="true">•</span>
          <div className="flex items-center justify-center gap-1.5 flex-wrap sm:flex-nowrap">
            {TRUST_PAYMENT_PILLS.map((method) => (
              <span
                key={method}
                className="px-2.5 py-0.5 rounded-md bg-surface-muted text-text font-medium border border-border text-xs whitespace-nowrap"
              >
                {method}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 3. PRIMARY NOVELS SHOWCASE (Smart Fallback — Featured or Newest Releases) */}
      {showFeatured && (
        <NovelShowcaseSection
          eyebrow="Curated Selection"
          title="Featured Novels"
          urduTitle="منتخب ناولز"
          viewAllHref="/novels?sort=featured"
          novels={featuredNovels}
          prioritizeFirst
        />
      )}

      {showFallbackNewest && (
        <NovelShowcaseSection
          eyebrow="Fresh Stories"
          title="New Releases"
          urduTitle="تازہ ترین ناولز"
          viewAllHref="/novels?sort=newest"
          novels={newestNovels}
          prioritizeFirst
        />
      )}

      {showNoNovelsEmpty && (
        <section className="py-10 sm:py-14 bg-bg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="p-10 sm:p-12 text-center bg-surface-muted/50 rounded-2xl border border-dashed border-border space-y-2.5">
              <BookMarked className="w-10 h-10 text-text-muted mx-auto" />
              <p className="text-sm font-medium text-text text-center">
                No novels published yet
              </p>
              <UrduText size="sm" className="text-text-muted text-center py-0">
                نئے ناولز جلد دستیاب ہوں گے۔
              </UrduText>
            </div>
          </div>
        </section>
      )}

      {/* 4. BROWSE BY GENRE */}
      {genres.length > 0 && (
        <section className="py-10 sm:py-14 bg-surface-muted/30 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 min-w-0">
            <div className="text-center space-y-1.5">
              <span className="text-xs font-semibold text-accent-strong uppercase tracking-wider">
                Taxonomy &amp; Themes
              </span>
              <h2 className="font-serif text-2xl md:text-3xl font-bold text-text">
                Explore by Genre
              </h2>
              <UrduText size="base" className="text-text-muted text-center py-0">
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
                    className="text-text text-center group-hover:text-primary font-normal py-0 leading-[2.2]"
                  >
                    {genre.name_urdu}
                  </UrduText>
                  <span className="text-xs font-medium text-text-muted group-hover:text-text">
                    {genre.name_english}
                  </span>
                  <span className="text-[10px] bg-surface-muted text-text-muted px-2 py-0.5 rounded-full mt-1 border border-border font-sans tabular-nums lining-nums">
                    {genre.published_novels_count}{" "}
                    {genre.published_novels_count === 1 ? "novel" : "novels"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5. NEW RELEASES (Shown only when Featured Novels occupied slot 3) */}
      {showFeatured && newestNovels.length > 0 && (
        <NovelShowcaseSection
          eyebrow="Fresh Stories"
          title="New Releases"
          urduTitle="تازہ ترین ناولز"
          viewAllHref="/novels?sort=newest"
          novels={newestNovels}
        />
      )}

      {/* 6. HOW DIRECT PAYMENT WORKS (Compact Mobile Stepper + 3-Col Desktop Grid) */}
      <section className="py-10 md:py-16 bg-surface-muted/40 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 md:space-y-10">
          <div className="text-center space-y-1.5 max-w-2xl mx-auto">
            <span className="text-xs font-semibold text-accent-strong uppercase tracking-wider">
              Transparency &amp; Security
            </span>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-text">
              How Direct Payment Works
            </h2>
            <UrduText size="base" className="text-text-muted text-center py-0">
              براہ راست ادائیگی کا شفاف اور محفوظ طریقہ کار
            </UrduText>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
            {PAYMENT_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.number}
                  className="bg-surface p-4 md:p-6 rounded-2xl border border-border shadow-card flex flex-row md:flex-col items-start md:items-center text-left md:text-center gap-3.5 md:gap-3"
                >
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <div
                      className={`w-10 h-10 md:w-12 md:h-12 rounded-xl border flex items-center justify-center ${step.iconContainerClass}`}
                    >
                      <Icon className={`w-5 h-5 md:w-6 md:h-6 ${step.iconClass}`} />
                    </div>
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-surface-muted border border-border text-[10px] font-sans font-bold tracking-wider text-text-muted tabular-nums lining-nums">
                      {step.number}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1 md:space-y-2">
                    <h3 className="font-serif text-base md:text-lg font-bold text-text leading-snug">
                      {step.title}
                    </h3>
                    <p className="text-xs text-text-muted leading-relaxed">
                      {step.description}
                    </p>
                    <p
                      dir="rtl"
                      lang="ur"
                      className="font-urdu text-sm text-text-muted mt-2 pt-0.5 leading-relaxed text-left md:text-center"
                    >
                      {step.urduLabel}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7. RECRUITMENT CALLOUT: FOR URDU WRITERS (Editorial Highlight Card) */}
      <section className="bg-bg py-10 md:py-16 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-primary text-primary-contrast p-6 sm:p-8 md:p-12 rounded-3xl border border-primary-contrast/15 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6 md:gap-10 text-center md:text-left">
            <div className="space-y-4 max-w-xl flex flex-col items-center md:items-start">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-primary-contrast/10 border border-primary-contrast/20 text-primary-contrast">
                <Feather className="w-3.5 h-3.5 shrink-0" />
                <span>For Urdu Writers</span>
              </span>

              <UrduText
                as="h2"
                size="2xl"
                className="text-primary-contrast text-center md:text-left leading-relaxed py-0 font-normal sm:text-3xl"
              >
                کیا آپ باصلاحیت افسانہ نگار یا ناول نگار ہیں؟
              </UrduText>

              <p className="text-sm text-primary-contrast/85 leading-relaxed">
                Join UNB Premium as an author. Receive direct reader payments into
                your Pakistani bank account or wallet with full creative control.
              </p>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-0.5">
                {WRITER_VALUE_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="px-2.5 py-1 rounded-full bg-primary-contrast/10 border border-primary-contrast/20 text-xs font-medium text-primary-contrast whitespace-nowrap"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            <div className="shrink-0 flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <Link
                href="/become-a-writer"
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-lg bg-surface text-primary hover:bg-surface-muted font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Feather className="w-4 h-4 shrink-0" />
                <span>Apply to Publish</span>
              </Link>
              <Link
                href="/how-it-works"
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-lg border border-primary-contrast/35 text-primary-contrast hover:bg-primary-contrast/10 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
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
