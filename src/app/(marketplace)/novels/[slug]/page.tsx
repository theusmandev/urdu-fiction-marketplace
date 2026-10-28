import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { UrduText } from "@/components/urdu/UrduText";
import { NovelAccessProvider } from "@/components/catalog/NovelAccessContext";
import { NovelAccessPanel } from "@/components/catalog/NovelAccessPanel";
import { NovelPaymentGuarantee } from "@/components/catalog/NovelPaymentGuarantee";
import { NovelToc } from "@/components/catalog/NovelToc";
import { TipCard } from "@/components/tips/TipCard";
import { ExpandableSynopsis } from "@/components/catalog/ExpandableSynopsis";
import {
  getPublicNovelBySlug,
  getPublicNovelChapters,
} from "@/lib/supabase/public";
import { resolveCoverUrl } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import {
  BookOpen,
  Feather,
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 sm:space-y-10 pb-28 md:pb-12">
        <NovelAccessProvider novelId={novel.id}>
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
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-12">
            {/* Left Column: Cover & Desktop Buy CTA (md: 4-5 cols) */}
            <div className="md:col-span-5 lg:col-span-4 space-y-6 flex flex-col items-center">
              {/* Cover Image (Rendered first on all screens) */}
              <div className="relative aspect-[2/3] w-full max-w-[180px] sm:max-w-[220px] md:max-w-[240px] mx-auto rounded-xl overflow-hidden bg-ivory-dark shadow-md border border-border/80 shrink-0">
                {/* Book Spine Detail */}
                <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/40 via-black/15 to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-y-0 left-3 w-px bg-white/20 z-10 pointer-events-none" />

                {resolveCoverUrl(novel.cover_url) ? (
                  <Image
                    src={resolveCoverUrl(novel.cover_url)!}
                    alt={novel.title_english || novel.title_urdu}
                    fill
                    priority
                    sizes="(max-width: 640px) 180px, (max-width: 768px) 220px, 240px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full p-4 sm:p-5 flex flex-col justify-between text-white bg-gradient-to-br from-[#17243A] via-[#1E293B] to-[#0F172A]">
                    <div className="text-right text-[9px] font-serif tracking-widest text-white/40">
                      ✦ UNB EDITORIAL ✦
                    </div>
                    <div className="my-auto text-center px-1">
                      <UrduText
                        as="h2"
                        size="xl"
                        className="text-white drop-shadow-md leading-[2.2] py-0.5 text-lg sm:text-xl line-clamp-2 font-normal"
                      >
                        {novel.title_urdu}
                      </UrduText>
                      {novel.title_english && (
                        <p className="font-serif text-[10px] sm:text-xs text-white/80 tracking-widest uppercase mt-1 line-clamp-1">
                          {novel.title_english}
                        </p>
                      )}
                    </div>
                    <div className="border-t border-white/20 pt-2 flex items-center justify-between text-[11px]">
                      <span className="font-serif text-white/80 truncate max-w-[55%]">
                        {novel.writer_pen_name_english || "Author"}
                      </span>
                      <UrduText as="span" size="xs" className="text-white/90 py-0 truncate max-w-[40%] font-normal">
                        {novel.writer_pen_name_urdu}
                      </UrduText>
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop Price & Purchase Action Card (State-Adaptive) */}
              <div className="hidden md:block w-full max-w-[280px] mx-auto">
                <NovelAccessPanel
                  novelId={novel.id}
                  novelSlug={novel.slug}
                  pricePkr={novel.price_pkr}
                  freePreviewChapterNumber={freeChapters[0]?.chapter_number}
                />
              </div>

              {/* Desktop Direct Payment Assurance Box (Rendered only for visitors) */}
              <NovelPaymentGuarantee />
            </div>

          {/* Right Column: Title, Metadata, Synopsis, Chapters (8 cols) */}
          <div className="md:col-span-7 lg:col-span-8 space-y-6 sm:space-y-8">
            {/* Title & Author Header (Appears directly after cover on mobile) */}
            <div className="space-y-3 sm:space-y-4 border-b border-border pb-6 text-center md:text-left">
              {/* Genre Badges */}
              {novel.genres && novel.genres.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  {novel.genres.map((g) => (
                    <Link
                      key={g.id}
                      href={`/genres/${g.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-medium bg-ivory text-secondary hover:text-navy border border-border px-3 py-1 rounded-full transition-colors min-h-[32px]"
                    >
                      <span>{g.name_english}</span>
                      <UrduText as="span" size="xs" className="text-accent py-0 font-normal">
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
                className="text-navy leading-[2.2] py-1 text-2xl sm:text-4xl font-normal"
              >
                {novel.title_urdu}
              </UrduText>

              {novel.title_english && (
                <p className="font-serif text-base sm:text-lg text-secondary tracking-wide uppercase font-medium">
                  {novel.title_english}
                </p>
              )}

              {/* Author Attribution Byline */}
              <div className="flex items-center justify-center md:justify-start gap-2 sm:gap-4 text-sm text-secondary pt-1 sm:pt-2">
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
                  <UrduText as="span" size="sm" className="text-accent py-0 font-normal">
                    ({novel.writer_pen_name_urdu})
                  </UrduText>
                </Link>
              </div>

              {/* Key Specifications Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 pt-2 sm:pt-3 text-left">
                <div className="bg-ivory/40 p-2.5 sm:p-3 rounded-xl border border-border/80">
                  <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <BookOpen className="w-3.5 h-3.5 text-accent" />
                    <span>Chapters</span>
                  </div>
                  <p className="font-bold text-navy mt-1 text-sm">
                    {novel.total_chapters}
                  </p>
                </div>

                <div className="bg-ivory/40 p-2.5 sm:p-3 rounded-xl border border-border/80">
                  <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <Globe className="w-3.5 h-3.5 text-accent" />
                    <span>Language</span>
                  </div>
                  <p className="font-bold text-navy mt-1 text-sm">
                    {novel.language || "Urdu / اردو"}
                  </p>
                </div>

                <div className="bg-ivory/40 p-2.5 sm:p-3 rounded-xl border border-border/80">
                  <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <Calendar className="w-3.5 h-3.5 text-accent" />
                    <span>Published</span>
                  </div>
                  <p className="font-bold text-navy mt-1 text-xs truncate">
                    {formattedDate}
                  </p>
                </div>

                <div className="bg-ivory/40 p-2.5 sm:p-3 rounded-xl border border-border/80">
                  <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <FileText className="w-3.5 h-3.5 text-accent" />
                    <span>Free Preview</span>
                  </div>
                  <p className="font-bold text-success mt-1 text-sm">
                    {freeChapters.length} {freeChapters.length === 1 ? "Chapter" : "Chapters"}
                  </p>
                </div>
              </div>

            </div>

            {/* Synopsis Section (Expandable) */}
            {novel.synopsis_urdu && (
              <div className="space-y-2.5">
                <h2 className="font-serif text-lg font-bold text-navy">
                  Synopsis / خلاصہِ ناول
                </h2>
                <ExpandableSynopsis synopsis={novel.synopsis_urdu} />
              </div>
            )}

            {/* Mobile Direct Payment Assurance Compact Card (Rendered only for visitors) */}
            <NovelPaymentGuarantee compact />

            {/* Extended Description Section (if any) */}
            {novel.description_urdu && (
              <div className="space-y-2.5">
                <h2 className="font-serif text-lg font-bold text-navy">
                  About this Novel / تفصیلات
                </h2>
                <div className="bg-surface p-4 sm:p-5 rounded-2xl border border-border">
                  <p
                    dir="rtl"
                    lang="ur"
                    className="font-urdu text-sm text-secondary leading-[2.3] text-right whitespace-pre-line font-normal"
                  >
                    {novel.description_urdu}
                  </p>
                </div>
              </div>
            )}

            {/* Table of Contents: Client-side Access State Overlays */}
            <div className="pt-2">
              <NovelToc
                novelSlug={novel.slug}
                pricePkr={novel.price_pkr}
                chapters={chapters}
              />
            </div>

            {/* Reader Appreciation (Tip Jar) */}
            <div className="pt-8 pb-4">
              <TipCard writerId={novel.writer_id} novelId={novel.id} />
            </div>
          </div>
        </div>

        {/* Sticky Bottom Action Bar on Phones (md:hidden) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border p-3 px-4 shadow-lg pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-lg mx-auto">
            <NovelAccessPanel
              novelId={novel.id}
              novelSlug={novel.slug}
              pricePkr={novel.price_pkr}
              freePreviewChapterNumber={freeChapters[0]?.chapter_number}
              compact
            />
          </div>
        </div>
      </NovelAccessProvider>
    </div>
  </>
);
}

