import React from "react";
import Link from "next/link";
import Image from "next/image";
import { UrduText } from "@/components/urdu/UrduText";
import { formatPKR } from "@/lib/utils";
import type { PublicNovel } from "@/types/database";
import { Sparkles, BookOpen, Feather } from "lucide-react";

interface NovelCardProps {
  novel: PublicNovel;
  priority?: boolean;
}

export function NovelCard({ novel, priority = false }: NovelCardProps) {
  return (
    <article
      itemScope
      itemType="https://schema.org/Book"
      className="group relative bg-surface rounded-2xl border border-border/80 hover:border-accent/40 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden"
    >
      {/* 2:3 Aspect Ratio Cover Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-ivory-dark">
        {/* Book Spine Visual Styling */}
        <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/30 via-black/10 to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 left-3 w-px bg-white/20 z-10 pointer-events-none" />

        {/* Real Cover Image or Curated Calligraphic Fallback */}
        {novel.cover_url ? (
          <Image
            src={novel.cover_url}
            alt={novel.title_english || novel.title_urdu}
            fill
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            itemProp="image"
          />
        ) : (
          <div className="w-full h-full p-6 flex flex-col justify-between text-white relative bg-gradient-to-br from-[#17243A] via-[#1E293B] to-[#0F172A] transition-transform duration-500 group-hover:scale-105">
            <div className="absolute top-3 right-3 text-white/30 text-[10px] font-serif tracking-widest uppercase select-none pointer-events-none">
              ✦ UNB EDITORIAL ✦
            </div>

            {/* Center Calligraphic Title */}
            <div className="my-auto text-center z-10 px-2">
              <UrduText
                as="h3"
                size="2xl"
                className="text-white drop-shadow-md py-1 leading-[2.4]"
                itemProp="name"
              >
                {novel.title_urdu}
              </UrduText>
              {novel.title_english && (
                <p className="font-serif text-xs text-white/80 tracking-widest uppercase mt-1 font-medium">
                  {novel.title_english}
                </p>
              )}
            </div>

            {/* Bottom Author Tag */}
            <div className="border-t border-white/20 pt-2 z-10 flex items-center justify-between text-xs">
              <span className="font-serif text-white/80">
                {novel.writer_pen_name_english || novel.writer_username || "Author"}
              </span>
              <UrduText as="span" size="xs" className="text-white/90 py-0">
                {novel.writer_pen_name_urdu}
              </UrduText>
            </div>
          </div>
        )}

        {/* Top Badges Overlay */}
        <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2 z-20 pointer-events-none">
          {novel.is_featured && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-accent text-navy px-2.5 py-0.5 rounded-full shadow-sm">
              <Sparkles className="w-3 h-3" />
              <span>Featured</span>
            </span>
          )}
          {novel.genres && novel.genres.length > 0 && (
            <span className="text-[10px] font-medium bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded-full ml-auto">
              {novel.genres[0].name_english}
            </span>
          )}
        </div>
      </div>

      {/* Card Content & Details */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-1.5">
          <Link
            href={`/novels/${novel.slug}`}
            className="group-hover:text-accent transition-colors block"
          >
            <UrduText
              as="h2"
              size="lg"
              className="text-navy group-hover:text-accent font-bold leading-[2.2] py-0 line-clamp-1"
            >
              {novel.title_urdu}
            </UrduText>
            {novel.title_english && (
              <p className="font-serif text-xs text-secondary tracking-wider uppercase line-clamp-1">
                {novel.title_english}
              </p>
            )}
          </Link>

          {/* Author Byline */}
          <div className="flex items-center justify-between text-xs text-secondary pt-0.5">
            <Link
              href={
                novel.writer_username
                  ? `/writers/${novel.writer_username}`
                  : `/novels/${novel.slug}`
              }
              className="hover:text-navy transition-colors flex items-center gap-1.5"
            >
              <Feather className="w-3 h-3 text-accent shrink-0" />
              <span className="font-medium truncate">
                {novel.writer_pen_name_english || novel.writer_username || "Author"}
              </span>
            </Link>
            <UrduText as="span" size="xs" className="text-secondary/90 py-0">
              {novel.writer_pen_name_urdu}
            </UrduText>
          </div>

          {/* Synopsis */}
          {novel.synopsis_urdu && (
            <p
              dir="rtl"
              lang="ur"
              className="font-urdu text-xs text-secondary/90 line-clamp-2 leading-[2] pt-1"
            >
              {novel.synopsis_urdu}
            </p>
          )}
        </div>

        {/* Footer: Chapter count & Price */}
        <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-secondary">
            <BookOpen className="w-3.5 h-3.5 text-accent" />
            <span>{novel.total_chapters} {novel.total_chapters === 1 ? "Chapter" : "Chapters"}</span>
          </div>

          <div>
            {novel.price_pkr < 50 ? (
              <span className="font-serif text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                Unavailable
              </span>
            ) : (
              <span className="font-serif text-base font-bold text-navy">
                {formatPKR(novel.price_pkr)}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
