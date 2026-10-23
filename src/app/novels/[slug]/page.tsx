import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { UrduText } from "@/components/urdu/UrduText";
import { BuyNovelButton } from "@/components/catalog/BuyNovelButton";
import {
  getPublicNovelBySlug,
  getPublicNovelChapters,
} from "@/lib/supabase/public";
import { formatPKR } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import {
  BookOpen,
  Feather,
  ShieldCheck,
  Lock,
  Sparkles,
  ChevronRight,
  Home,
  Calendar,
  Globe,
  FileText,
} from "lucide-react";

export const revalidate = 120; // 2 minutes ISR revalidation

interface NovelPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: NovelPageProps): Promise<Metadata> {
  const { slug } = await params;
  const novel = await getPublicNovelBySlug(slug);

  if (!novel) {
    return {
      title: "Novel Not Found",
    };
  }

  const title = `${novel.title_urdu} (${novel.title_english || "Urdu Novel"}) — ${novel.writer_pen_name_english || novel.writer_pen_name_urdu}`;
  const description =
    novel.synopsis_urdu ||
    `Read ${novel.title_urdu} by ${novel.writer_pen_name_english}. Support Pakistani authors directly via JazzCash, EasyPaisa, or Bank Transfer.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "book",
      url: `${siteConfig.url}/novels/${novel.slug}`,
      images: novel.cover_url
        ? [{ url: novel.cover_url, width: 600, height: 900, alt: novel.title_urdu }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: novel.cover_url ? [novel.cover_url] : [],
    },
    alternates: {
      canonical: `${siteConfig.url}/novels/${novel.slug}`,
    },
  };
}

export default async function NovelDetailsPage({ params }: NovelPageProps) {
  const { slug } = await params;
  const novel = await getPublicNovelBySlug(slug);

  if (!novel) {
    notFound();
  }

  const chapters = await getPublicNovelChapters(novel.slug);
  const freeChapters = chapters.filter((c) => c.is_free_preview);

  const formattedDate = novel.published_at
    ? new Date(novel.published_at).toLocaleDateString("en-PK", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Recently Published";

  // JSON-LD Structured Data: Book & Product
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Book",
        "@id": `${siteConfig.url}/novels/${novel.slug}#book`,
        name: novel.title_urdu,
        alternateName: novel.title_english,
        inLanguage: "ur",
        author: {
          "@type": "Person",
          name: novel.writer_pen_name_english || novel.writer_pen_name_urdu,
          alternateName: novel.writer_pen_name_urdu,
          url: novel.writer_username
            ? `${siteConfig.url}/writers/${novel.writer_username}`
            : undefined,
        },
        image: novel.cover_url || undefined,
        description: novel.synopsis_urdu,
        numberOfPages: novel.total_chapters,
      },
      {
        "@type": "Product",
        "@id": `${siteConfig.url}/novels/${novel.slug}#product`,
        name: novel.title_english || novel.title_urdu,
        image: novel.cover_url || undefined,
        description: novel.synopsis_urdu,
        offers: {
          "@type": "Offer",
          price: novel.price_pkr,
          priceCurrency: "PKR",
          availability: "https://schema.org/InStock",
          url: `${siteConfig.url}/novels/${novel.slug}`,
          seller: {
            "@type": "Person",
            name: novel.writer_pen_name_english || novel.writer_pen_name_urdu,
          },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: siteConfig.url,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Novels",
            item: `${siteConfig.url}/novels`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: novel.title_urdu,
            item: `${siteConfig.url}/novels/${novel.slug}`,
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        {/* Breadcrumb Navigation */}
        <nav
          aria-label="Breadcrumbs"
          className="flex items-center gap-2 text-xs text-secondary overflow-x-auto pb-1"
        >
          <Link href="/" className="hover:text-navy flex items-center gap-1 shrink-0">
            <Home className="w-3.5 h-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
          <Link href="/novels" className="hover:text-navy shrink-0">
            Novels
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
          <span className="text-navy font-semibold truncate">{novel.title_urdu}</span>
        </nav>

        {/* Primary Hero Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12">
          {/* Left Column: 2:3 Cover Image & Buy CTA (4 cols) */}
          <div className="md:col-span-5 lg:col-span-4 space-y-6">
            <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-ivory-dark shadow-2xl border border-border/80">
              {/* Book Spine Detail */}
              <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/40 via-black/15 to-transparent z-10 pointer-events-none" />
              <div className="absolute inset-y-0 left-4 w-px bg-white/20 z-10 pointer-events-none" />

              {novel.cover_url ? (
                <Image
                  src={novel.cover_url}
                  alt={novel.title_english || novel.title_urdu}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 380px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full p-8 flex flex-col justify-between text-white bg-gradient-to-br from-[#17243A] via-[#1E293B] to-[#0F172A]">
                  <div className="text-right text-xs font-serif tracking-widest text-white/40">
                    ✦ UNB EDITORIAL ✦
                  </div>
                  <div className="my-auto text-center">
                    <UrduText
                      as="h2"
                      size="3xl"
                      className="text-white drop-shadow-lg leading-[2.4] py-1"
                    >
                      {novel.title_urdu}
                    </UrduText>
                    {novel.title_english && (
                      <p className="font-serif text-xs text-white/80 tracking-widest uppercase mt-2">
                        {novel.title_english}
                      </p>
                    )}
                  </div>
                  <div className="border-t border-white/20 pt-3 flex items-center justify-between text-xs">
                    <span className="font-serif text-white/80">
                      {novel.writer_pen_name_english || "Author"}
                    </span>
                    <UrduText as="span" size="xs" className="text-white/90 py-0">
                      {novel.writer_pen_name_urdu}
                    </UrduText>
                  </div>
                </div>
              )}
            </div>

            {/* Price & Purchase Action Card */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-secondary">Price / قیمت:</span>
                <div>
                  {novel.price_pkr === 0 ? (
                    <span className="text-xl font-bold text-emerald-600">
                      Free / مفت
                    </span>
                  ) : (
                    <span className="font-serif text-2xl font-bold text-navy">
                      {formatPKR(novel.price_pkr)}
                    </span>
                  )}
                </div>
              </div>

              {/* Buy Novel Button Component */}
              <BuyNovelButton
                novelId={novel.id}
                novelSlug={novel.slug}
                pricePkr={novel.price_pkr}
              />

              {/* Free Previews Callout if Available */}
              {freeChapters.length > 0 && (
                <div className="pt-2">
                  <Link
                    href={`/novels/${novel.slug}/read/${freeChapters[0].chapter_number}`}
                    className="w-full flex items-center justify-center gap-2 bg-accent/20 hover:bg-accent/30 text-navy font-semibold py-2.5 px-4 rounded-xl transition-colors text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span>Start Free Reading (Chapter {freeChapters[0].chapter_number})</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Direct Payment Assurance Box */}
            <div className="bg-ivory/60 p-4 rounded-xl border border-border text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-navy">
                <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
                <span>Direct Writer Payment Guarantee</span>
              </div>
              <p className="text-secondary leading-relaxed text-[11px]">
                You pay the writer directly into their verified JazzCash, EasyPaisa,
                Raast, or Bank IBAN. Access to all locked chapters is granted as soon
                as the author verifies receipt. The platform holds zero customer funds.
              </p>
            </div>
          </div>

          {/* Right Column: Title, Metadata, Synopsis, Chapters (8 cols) */}
          <div className="md:col-span-7 lg:col-span-8 space-y-8">
            {/* Title & Author Header */}
            <div className="space-y-4 border-b border-border pb-6">
              {/* Genre Badges */}
              {novel.genres && novel.genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {novel.genres.map((g) => (
                    <Link
                      key={g.id}
                      href={`/genres/${g.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-medium bg-ivory text-secondary hover:text-navy border border-border px-3 py-1 rounded-full transition-colors"
                    >
                      <span>{g.name_english}</span>
                      <UrduText as="span" size="xs" className="text-accent py-0">
                        {g.name_urdu}
                      </UrduText>
                    </Link>
                  ))}
                </div>
              )}

              {/* Urdu Title in Large Nastaliq */}
              <UrduText
                as="h1"
                size="4xl"
                className="text-navy font-bold leading-[2.2] py-1"
              >
                {novel.title_urdu}
              </UrduText>

              {novel.title_english && (
                <p className="font-serif text-lg text-secondary tracking-wide uppercase font-medium">
                  {novel.title_english}
                </p>
              )}

              {/* Author Attribution Byline */}
              <div className="flex items-center gap-4 text-sm text-secondary pt-2">
                <span>By / مصنف:</span>
                <Link
                  href={
                    novel.writer_username
                      ? `/writers/${novel.writer_username}`
                      : "#"
                  }
                  className="inline-flex items-center gap-2 text-navy hover:text-accent font-semibold transition-colors"
                >
                  <Feather className="w-4 h-4 text-accent" />
                  <span>
                    {novel.writer_pen_name_english || novel.writer_username || "Author"}
                  </span>
                  <UrduText as="span" size="sm" className="text-accent py-0">
                    ({novel.writer_pen_name_urdu})
                  </UrduText>
                </Link>
              </div>

              {/* Key Specifications Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                <div className="bg-ivory/40 p-3 rounded-xl border border-border/80">
                  <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <BookOpen className="w-3.5 h-3.5 text-accent" />
                    <span>Chapters</span>
                  </div>
                  <p className="font-bold text-navy mt-1 text-sm">
                    {novel.total_chapters}
                  </p>
                </div>

                <div className="bg-ivory/40 p-3 rounded-xl border border-border/80">
                  <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <Globe className="w-3.5 h-3.5 text-accent" />
                    <span>Language</span>
                  </div>
                  <p className="font-bold text-navy mt-1 text-sm">
                    {novel.language || "Urdu / اردو"}
                  </p>
                </div>

                <div className="bg-ivory/40 p-3 rounded-xl border border-border/80">
                  <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <Calendar className="w-3.5 h-3.5 text-accent" />
                    <span>Published</span>
                  </div>
                  <p className="font-bold text-navy mt-1 text-xs truncate">
                    {formattedDate}
                  </p>
                </div>

                <div className="bg-ivory/40 p-3 rounded-xl border border-border/80">
                  <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <FileText className="w-3.5 h-3.5 text-accent" />
                    <span>Free Preview</span>
                  </div>
                  <p className="font-bold text-emerald-600 mt-1 text-sm">
                    {freeChapters.length} {freeChapters.length === 1 ? "Chapter" : "Chapters"}
                  </p>
                </div>
              </div>
            </div>

            {/* Synopsis Section */}
            {novel.synopsis_urdu && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-lg font-bold text-navy">
                    Synopsis / خلاصہِ ناول
                  </h2>
                </div>
                <div className="bg-surface p-5 rounded-2xl border border-border">
                  <p
                    dir="rtl"
                    lang="ur"
                    className="font-urdu text-base text-main leading-[2.4] text-right"
                  >
                    {novel.synopsis_urdu}
                  </p>
                </div>
              </div>
            )}

            {/* Extended Description Section */}
            {novel.description_urdu && (
              <div className="space-y-3">
                <h2 className="font-serif text-lg font-bold text-navy">
                  About this Novel / تفصیلات
                </h2>
                <div className="bg-surface p-5 rounded-2xl border border-border">
                  <p
                    dir="rtl"
                    lang="ur"
                    className="font-urdu text-sm text-secondary leading-[2.3] text-right whitespace-pre-line"
                  >
                    {novel.description_urdu}
                  </p>
                </div>
              </div>
            )}

            {/* Table of Contents & Chapter List */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-xl font-bold text-navy">
                    Table of Contents / ابواب کی فہرست
                  </h2>
                  <p className="text-xs text-secondary">
                    Free preview chapters can be read without purchasing. Paid chapters unlock upon writer payment verification.
                  </p>
                </div>
              </div>

              {chapters.length > 0 ? (
                <div className="bg-surface rounded-2xl border border-border divide-y divide-border overflow-hidden">
                  {chapters.map((ch) => {
                    const isPreview = ch.is_free_preview;
                    return (
                      <div
                        key={ch.id}
                        className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                          isPreview ? "hover:bg-ivory/50" : "bg-slate-50/50"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-8 h-8 rounded-lg bg-ivory text-secondary flex items-center justify-center font-serif text-xs font-semibold shrink-0">
                            {ch.chapter_number}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <UrduText
                                as="span"
                                size="sm"
                                className="font-semibold text-navy leading-[2.2] py-0 truncate"
                              >
                                {ch.title_urdu}
                              </UrduText>
                            </div>
                            <span className="text-[11px] text-secondary">
                              {ch.word_count} words
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {isPreview ? (
                            <Link
                              href={`/novels/${novel.slug}/read/${ch.chapter_number}`}
                              className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Read Free Preview</span>
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-secondary bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                              <Lock className="w-3.5 h-3.5 text-secondary" />
                              <span>Paid Chapter</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center bg-ivory/30 rounded-xl border border-dashed border-border text-xs text-secondary">
                  No published chapters available yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
