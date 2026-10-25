import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { NovelCard } from "@/components/catalog/NovelCard";
import {
  getPublicGenreBySlug,
  searchPublicNovels,
} from "@/lib/supabase/public";
import { siteConfig } from "@/config/site";
import { BookMarked, ChevronRight, Home, ArrowLeft } from "lucide-react";

export const revalidate = 120; // 2 minutes ISR revalidation

interface GenrePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: GenrePageProps): Promise<Metadata> {
  const { slug } = await params;
  const genre = await getPublicGenreBySlug(slug);

  if (!genre) {
    return {
      title: "Genre Not Found",
    };
  }

  const title = `${genre.name_english} (${genre.name_urdu}) — Urdu Novels`;
  const description = `Read and support independent Pakistani authors writing in ${genre.name_english} (${genre.name_urdu}). Direct reader-to-writer payment verification.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${siteConfig.url}/genres/${genre.slug}`,
    },
    alternates: {
      canonical: `${siteConfig.url}/genres/${genre.slug}`,
    },
  };
}

export default async function GenreDetailsPage({ params }: GenrePageProps) {
  const { slug } = await params;
  const genre = await getPublicGenreBySlug(slug);

  if (!genre) {
    notFound();
  }

  const { novels, totalCount } = await searchPublicNovels({
    genre: genre.slug,
    page: 1,
    limit: 24,
  });

  // JSON-LD Structured Data
  const jsonLd = {
    "@context": "https://schema.org",
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
        name: "Genres",
        item: `${siteConfig.url}/genres`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: genre.name_english,
        item: `${siteConfig.url}/genres/${genre.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Breadcrumb Navigation */}
        <nav
          aria-label="Breadcrumbs"
          className="flex items-center gap-2 text-xs text-secondary"
        >
          <Link href="/" className="hover:text-navy flex items-center gap-1">
            <Home className="w-3.5 h-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-secondary/40" />
          <Link href="/genres" className="hover:text-navy">
            Genres
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-secondary/40" />
          <span className="text-navy font-semibold">{genre.name_english}</span>
        </nav>

        {/* Genre Header Banner */}
        <div className="bg-gradient-to-r from-navy via-navy to-[#18263E] text-white p-8 md:p-12 rounded-3xl border border-white/10 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                Literary Category
              </span>
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-white">
                {genre.name_english}
              </h1>
              <p className="text-xs text-slate-300">
                {totalCount} {totalCount === 1 ? "published novel" : "published novels"} in this collection
              </p>
            </div>

            <div className="text-right">
              <UrduText
                as="h2"
                size="4xl"
                className="text-accent drop-shadow-md py-0 leading-[2.2]"
              >
                {genre.name_urdu}
              </UrduText>
            </div>
          </div>
        </div>

        {/* Novels Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-navy">
              Novels in {genre.name_english}
            </h2>
            <Link
              href={`/novels?genre=${genre.slug}`}
              className="text-xs font-medium text-accent hover:text-accent-dark"
            >
              Filter in Catalog →
            </Link>
          </div>

          {novels.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {novels.map((novel) => (
                <NovelCard key={novel.id} novel={novel} />
              ))}
            </div>
          ) : (
            <div className="p-16 text-center bg-ivory/50 rounded-2xl border border-dashed border-border space-y-3">
              <BookMarked className="w-12 h-12 text-secondary/60 mx-auto" />
              <h3 className="text-base font-bold text-navy">
                No novels published in this genre yet
              </h3>
              <UrduText size="sm" className="text-secondary py-0">
                اس صنف میں جلد نئے ناولز شامل کیے جائیں گے۔
              </UrduText>
              <div className="pt-2">
                <Link
                  href="/novels"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy bg-white hover:bg-ivory border border-border px-4 py-2 rounded-lg shadow-sm"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Browse All Novels</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
