import React from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FreePreviewReaderClient } from "@/components/catalog/FreePreviewReaderClient";
import {
  getPublicNovelBySlug,
  getFreePreviewChapter,
  getPublicNovelChapters,
} from "@/lib/supabase/public";
import { siteConfig } from "@/config/site";

export const revalidate = 120; // 2 minutes ISR revalidation

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
  const description = `Read free preview of chapter ${chapter.chapter_number} from ${novel.title_urdu} by ${novel.writer_pen_name_english}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `${siteConfig.url}/novels/${novel.slug}/read/${chapter.chapter_number}`,
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

  return (
    <FreePreviewReaderClient
      novel={novel}
      chapter={chapter}
      allChapters={allChapters}
    />
  );
}
