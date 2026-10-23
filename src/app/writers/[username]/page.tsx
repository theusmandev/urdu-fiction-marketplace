import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { NovelCard } from "@/components/catalog/NovelCard";
import {
  getPublicWriterByUsername,
  getNovelsByWriter,
} from "@/lib/supabase/public";
import { siteConfig } from "@/config/site";
import {
  BookOpen,
  ChevronRight,
  Home,
  CheckCircle2,
} from "lucide-react";

export const revalidate = 120; // 2 minutes ISR revalidation

interface WriterProfilePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: WriterProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const writer = await getPublicWriterByUsername(username);

  if (!writer) {
    return {
      title: "Author Not Found",
    };
  }

  const title = `${writer.pen_name_urdu} (${writer.pen_name_english}) — Author Profile`;
  const description =
    writer.bio_urdu ||
    `Read digital Urdu novels by Pakistani author ${writer.pen_name_english} (${writer.pen_name_urdu}). Support directly via JazzCash and EasyPaisa.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `${siteConfig.url}/writers/${writer.username}`,
      images: writer.avatar_url ? [{ url: writer.avatar_url }] : [],
    },
    alternates: {
      canonical: `${siteConfig.url}/writers/${writer.username}`,
    },
  };
}

export default async function WriterProfilePage({
  params,
}: WriterProfilePageProps) {
  const { username } = await params;
  const writer = await getPublicWriterByUsername(username);

  if (!writer) {
    notFound();
  }

  const novels = await getNovelsByWriter(writer.id);

  // JSON-LD Structured Data: Person & Breadcrumbs
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": `${siteConfig.url}/writers/${writer.username}#person`,
        name: writer.pen_name_english,
        alternateName: writer.pen_name_urdu,
        description: writer.bio_urdu || writer.bio_english || undefined,
        image: writer.avatar_url || undefined,
        url: `${siteConfig.url}/writers/${writer.username}`,
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
            name: "Authors",
            item: `${siteConfig.url}/writers`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: writer.pen_name_english || writer.pen_name_urdu,
            item: `${siteConfig.url}/writers/${writer.username}`,
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
        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumbs"
          className="flex items-center gap-2 text-xs text-secondary overflow-x-auto pb-1"
        >
          <Link href="/" className="hover:text-navy flex items-center gap-1 shrink-0">
            <Home className="w-3.5 h-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
          <Link href="/writers" className="hover:text-navy shrink-0">
            Authors
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
          <span className="text-navy font-semibold truncate">
            {writer.pen_name_english || writer.pen_name_urdu}
          </span>
        </nav>

        {/* Author Bio & Identity Header */}
        <div className="bg-surface p-6 sm:p-10 rounded-3xl border border-border shadow-sm flex flex-col md:flex-row items-start md:items-center gap-6 sm:gap-8">
          {writer.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={writer.avatar_url}
              alt={writer.pen_name_english}
              className="w-24 h-24 sm:w-28 sm:rotate-0 sm:h-28 rounded-2xl object-cover border-2 border-border shrink-0 shadow-md"
            />
          ) : (
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-navy text-accent font-serif font-bold text-3xl sm:text-4xl flex items-center justify-center border-2 border-navy-light shrink-0 shadow-md">
              {writer.pen_name_english.charAt(0)}
            </div>
          )}

          <div className="space-y-3 min-w-0 flex-1">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent-dark px-2.5 py-0.5 rounded-full border border-accent/30">
                  <CheckCircle2 className="w-3 h-3 text-accent" />
                  <span>Verified Pakistani Author</span>
                </span>
                <span className="text-xs text-secondary">
                  @{writer.username}
                </span>
              </div>

              <UrduText
                as="h1"
                size="3xl"
                className="text-navy font-bold leading-[2.2] py-0"
              >
                {writer.pen_name_urdu}
              </UrduText>

              <h2 className="font-serif text-lg font-semibold text-secondary">
                {writer.pen_name_english}
              </h2>
            </div>

            {writer.bio_urdu && (
              <p
                dir="rtl"
                lang="ur"
                className="font-urdu text-sm text-main leading-[2.3] text-right"
              >
                {writer.bio_urdu}
              </p>
            )}

            {writer.bio_english && (
              <p className="text-xs text-secondary leading-relaxed">
                {writer.bio_english}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-secondary pt-1">
              <div className="flex items-center gap-1.5 font-medium text-navy">
                <BookOpen className="w-3.5 h-3.5 text-accent" />
                <span>
                  {novels.length} {novels.length === 1 ? "Published Novel" : "Published Novels"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Novels Showcase by this Author */}
        <div className="space-y-6">
          <div className="border-b border-border pb-4 flex items-center justify-between">
            <h2 className="font-serif text-2xl font-bold text-navy">
              Published Novels by {writer.pen_name_english}
            </h2>
            <UrduText as="span" size="sm" className="text-secondary py-0">
              مصنف کے شائع شدہ ناولز
            </UrduText>
          </div>

          {novels.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {novels.map((novel) => (
                <NovelCard key={novel.id} novel={novel} />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center bg-ivory/50 rounded-2xl border border-dashed border-border text-xs text-secondary">
              No novels currently listed for this author.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
