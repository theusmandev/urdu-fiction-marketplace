import React from "react";
import Link from "next/link";
import Image from "next/image";
import { UrduText } from "@/components/urdu/UrduText";
import { formatPKR, resolveCoverUrl } from "@/lib/utils";
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
      className="group relative bg-surface h-full flex flex-col overflow-hidden rounded-2xl border border-border hover:border-primary/50 focus-within:ring-2 focus-within:ring-ring shadow-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
    >
      {/* Constrained 2:3 Aspect Ratio Cover Container - locked shrink-0 */}
      <div className="relative w-full aspect-[2/3] shrink-0 overflow-hidden bg-surface-muted">
        {/* Book Spine Visual Styling */}
        <div className="absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/30 via-black/10 to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 left-2.5 w-px bg-white/20 z-10 pointer-events-none" />

        {/* Real Cover Image or Curated Calligraphic Fallback */}
        {resolveCoverUrl(novel.cover_url) ? (
          <Image
            src={resolveCoverUrl(novel.cover_url)!}
            alt={novel.title_english || novel.title_urdu}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
            className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105 pointer-events-none"
            itemProp="image"
          />
        ) : (
          <div className="w-full h-full p-3 sm:p-4 flex flex-col justify-between text-white relative bg-gradient-to-br from-[#17243A] via-[#1E293B] to-[#0F172A] transition-transform duration-500 ease-out group-hover:scale-105 pointer-events-none">
            <div className="absolute top-2 right-2 text-white/30 text-[8px] sm:text-[9px] font-serif tracking-widest uppercase select-none pointer-events-none">
              ✦ UNB ✦
            </div>

            {/* Center Calligraphic Title */}
            <div className="my-auto text-center z-10 px-1 pointer-events-none">
              <UrduText
                as="h3"
                size="base"
                className="text-white drop-shadow-md py-0.5 leading-[2.0] sm:leading-[2.1] text-base sm:text-lg line-clamp-1 font-normal"
                itemProp="name"
              >
                {novel.title_urdu}
              </UrduText>
              {novel.title_english && (
                <p className="font-serif text-[10px] text-white/80 tracking-wider uppercase mt-0.5 font-medium line-clamp-1">
                  {novel.title_english}
                </p>
              )}
            </div>

            {/* Bottom Author Tag */}
            <div className="border-t border-white/20 pt-1.5 z-10 flex items-center justify-between text-[10px] pointer-events-none">
              <span className="font-serif text-white/80 truncate max-w-[55%]">
                {novel.writer_pen_name_english || novel.writer_username || "Author"}
              </span>
              <UrduText as="span" size="xs" className="text-white/90 py-0 truncate max-w-[40%] font-normal">
                {novel.writer_pen_name_urdu}
              </UrduText>
            </div>
          </div>
        )}

        {/* Top Badges Overlay */}
        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-1.5 pointer-events-none z-20">
          {novel.is_featured && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-accent-soft text-accent-strong border border-border px-2 py-0.5 rounded-full shadow-xs shrink-0">
              <Sparkles className="w-2.5 h-2.5" />
              <span>Featured</span>
            </span>
          )}
          {novel.genres && novel.genres.length > 0 && (
            <span className="text-[10px] font-medium bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded-full ml-auto max-w-[75%] truncate">
              {novel.genres[0].name_english}
            </span>
          )}
        </div>
      </div>

      {/* Card Body - Equal height flex child */}
      <div className="flex-1 flex flex-col justify-between p-3.5 min-w-0 gap-2">
        <div className="space-y-1 min-w-0">
          <Link
            href={`/novels/${novel.slug}`}
            className="group-hover:text-primary transition-colors block after:absolute after:inset-0 after:z-10 focus:outline-none min-w-0"
            aria-label={`View novel ${novel.title_english || novel.title_urdu}`}
          >
            <UrduText
              as="h2"
              size="base"
              className="text-text group-hover:text-primary leading-[2.2] py-0 line-clamp-1 text-base sm:text-lg transition-colors font-normal"
            >
              {novel.title_urdu}
            </UrduText>
            <p className="font-serif text-xs text-text-muted group-hover:text-text tracking-wider uppercase line-clamp-1 transition-colors min-h-[1rem]">
              {novel.title_english || "\u00A0"}
            </p>
          </Link>

          {/* Author Byline */}
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-text-muted pt-0.5 relative z-20 pointer-events-none min-w-0">
            <Link
              href={
                novel.writer_username
                  ? `/writers/${novel.writer_username}`
                  : `/novels/${novel.slug}`
              }
              className="hover:text-text transition-colors flex items-center gap-1 min-w-0 flex-1 pointer-events-auto"
            >
              <Feather className="w-3 h-3 text-accent-strong shrink-0" />
              <span className="font-medium truncate">
                {novel.writer_pen_name_english || novel.writer_username || "Author"}
              </span>
            </Link>
            {novel.writer_pen_name_urdu && (
              <Link
                href={
                  novel.writer_username
                    ? `/writers/${novel.writer_username}`
                    : `/novels/${novel.slug}`
                }
                className="hover:text-text transition-colors shrink-0 ml-1 pointer-events-auto max-w-[45%]"
              >
                <UrduText as="span" size="xs" className="text-text-muted hover:text-text py-0 truncate block font-normal">
                  {novel.writer_pen_name_urdu}
                </UrduText>
              </Link>
            )}
          </div>
        </div>

        {/* Footer: Chapter count & Price */}
        <div className="pt-2 mt-1 border-t border-border flex items-center justify-between text-xs pointer-events-none min-w-0">
          <div className="flex items-center gap-1 text-text-muted text-[11px] sm:text-xs min-w-0">
            <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-accent-strong shrink-0" />
            <span className="truncate">
              {novel.total_chapters}{" "}
              <span className="hidden sm:inline">
                {novel.total_chapters === 1 ? "Chapter" : "Chapters"}
              </span>
              <span className="sm:hidden">
                {novel.total_chapters === 1 ? "Ch" : "Chs"}
              </span>
            </span>
          </div>

          <div className="shrink-0">
            {novel.price_pkr < 50 ? (
              <span className="font-serif text-[10px] font-semibold text-danger-text bg-danger-soft px-1.5 py-0.5 rounded-full border border-danger-border">
                Unavailable
              </span>
            ) : (
              <span className="font-serif text-xs sm:text-sm font-bold text-primary">
                {formatPKR(novel.price_pkr)}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
