import React from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FreePreviewReaderClient } from "@/components/catalog/FreePreviewReaderClient";
import {
  getPublicNovelBySlug,
  getFreePreviewChapter,
  getPublicNovelChapters,
  getPublicSupabase,
} from "@/lib/supabase/public";
import { siteConfig } from "@/config/site";
import { resolveCoverUrl } from "@/lib/utils";
import { JsonLd } from "@/components/seo/JsonLd";

export const revalidate = 120; // 2 minutes ISR revalidation

export async function generateStaticParams() {
  const supabase = getPublicSupabase();
  const { data: previews, error } = await supabase
    .from("public_free_preview_chapters")
    .select("novel_slug, chapter_number")
    .limit(50);

  if (error) {
    console.error("[generateStaticParams] public_free_preview_chapters query error:", error.code, error.message);
    return [];
  }

  if (!previews) return [];
  return previews.map((p) => ({
    slug: p.novel_slug,
    number: String(p.chapter_number),
  }));
}

interface ReaderPageProps {
  params: Promise<{ slug: string; number: string }>;
}

export async function generateMetadata({
  params,
}: ReaderPageProps): Promise<Metadata> {
  const { slug, number } = await params;
  const chapterNumber = parseInt(number, 10);

  if (isNaN(chapterNumber)) {
    return { title: "Chapter Not Found" };
  }

  const [novel, chapter] = await Promise.all([
    getPublicNovelBySlug(slug),
    getFreePreviewChapter(slug, chapterNumber),
  ]);

  if (!novel || !chapter) {
    return { title: "Free Preview Not Available" };
  }

  const title = `Chapter ${chapter.chapter_number}: ${chapter.title_urdu} — Free Preview — ${novel.title_urdu}`;
  const rawDescription = `Read free preview of chapter ${chapter.chapter_number} from ${novel.title_urdu} by ${novel.writer_pen_name_english}.`;
  const description =
    rawDescription.length > 155
      ? `${rawDescription.slice(0, 152).trim()}...`
      : rawDescription;

  const rawCover = resolveCoverUrl(novel.cover_url);
  const ogImageUrl = rawCover
    ? rawCover.startsWith("http")
      ? rawCover
      : `${siteConfig.url}${rawCover.startsWith("/") ? "" : "/"}${rawCover}`
    : `${siteConfig.url}/brand/og-image.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `${siteConfig.url}/novels/${novel.slug}/read/${chapter.chapter_number}`,
      locale: "en_PK",
      alternateLocale: ["ur_PK"],
      images: [
        {
          url: ogImageUrl,
          width: 600,
          height: 900,
          alt: `${novel.title_urdu} — Chapter ${chapter.chapter_number}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: `${siteConfig.url}/novels/${novel.slug}/read/${chapter.chapter_number}`,
    },
  };
}

export default async function FreePreviewReaderPage({
  params,
}: ReaderPageProps) {
  const { slug, number } = await params;
  const chapterNumber = parseInt(number, 10);

  if (isNaN(chapterNumber)) {
    redirect(`/novels/${slug}`);
  }

  const [novel, chapter, allChapters] = await Promise.all([
    getPublicNovelBySlug(slug),
    getFreePreviewChapter(slug, chapterNumber),
    getPublicNovelChapters(slug),
  ]);

  // If novel doesn't exist at all -> 404
  if (!novel) {
    notFound();
  }

  // Security Invariant: If chapter is paid, unpublished, or doesn't exist,
  // redirect strictly to novel details page. Never expose or query paid content here.
  if (!chapter) {
    redirect(`/novels/${novel.slug}`);
  }

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
        name: "Novels",
        item: `${siteConfig.url}/novels`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: novel.title_urdu,
        item: `${siteConfig.url}/novels/${novel.slug}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: `Chapter ${chapter.chapter_number}`,
        item: `${siteConfig.url}/novels/${novel.slug}/read/${chapter.chapter_number}`,
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <FreePreviewReaderClient
        novel={novel}
        chapter={chapter}
        allChapters={allChapters}
      />
    </>
  );
}
