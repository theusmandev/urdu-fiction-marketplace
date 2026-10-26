import React from "react";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { formatPKR } from "@/lib/utils";
import { 
  BookOpen, 
  Feather, 
  Sparkles
} from "lucide-react";

export interface NovelSummary {
  id: string;
  slug: string;
  titleUrdu: string;
  titleEn: string;
  authorNameUrdu: string;
  authorNameEn: string;
  synopsisUrdu: string;
  genreEn: string;
  genreUrdu: string;
  pricePKR: number;
  totalChapters: number;
  rating: number;
  hasFreePreview: boolean;
  coverGradient: string;
}

interface NovelCardProps {
  novel: NovelSummary;
  priority?: boolean;
}

export function NovelCard({ novel }: NovelCardProps) {
  return (
    <article className="group relative bg-surface h-full flex flex-col overflow-hidden rounded-2xl border border-border/80 hover:border-accent/50 focus-within:ring-2 focus-within:ring-accent/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer">
      
      {/* Constrained 2:3 Aspect Ratio Cover Container - locked shrink-0 */}
      <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden bg-stone-100">
        {/* Editorial Book Spine Visual Styling */}
        <div className="absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/25 via-black/10 to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 left-2.5 w-px bg-white/20 z-10 pointer-events-none" />

        {/* Artistic Cover Art (Gradient/Texture + Calligraphy) */}
        <div
          className={`w-full h-full p-3 sm:p-4 flex flex-col justify-between text-white relative transition-transform duration-500 ease-out group-hover:scale-105 pointer-events-none ${novel.coverGradient}`}
        >
          {/* Subtle Islamic/Geometric Corner Ornamentation */}
          <div className="absolute top-2 right-2 text-white/30 text-[8px] sm:text-[9px] font-serif select-none pointer-events-none">
            ✦ UNB ✦
          </div>

          {/* Top Badges */}
          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-1.5 pointer-events-none z-20">
            {novel.hasFreePreview && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white/90 backdrop-blur-sm text-navy px-2 py-0.5 rounded-full shadow-xs">
                <Sparkles className="w-2.5 h-2.5 text-accent" />
                <span>Free Preview</span>
              </span>
            )}
            <span className="text-[10px] font-medium bg-black/40 backdrop-blur-sm text-white/90 px-2 py-0.5 rounded-full ml-auto max-w-[75%] truncate">
              {novel.genreEn}
            </span>
          </div>

          {/* Center Calligraphic Title on Cover */}
          <div className="my-auto text-center z-10 px-1 pointer-events-none">
            <UrduText
              as="h2"
              size="base"
              className="text-white drop-shadow-md py-0.5 leading-[2.0] sm:leading-[2.1] text-base sm:text-lg line-clamp-1"
            >
              {novel.titleUrdu}
            </UrduText>
            <p className="font-serif text-[10px] text-white/80 tracking-wider uppercase mt-0.5 font-medium line-clamp-1">
              {novel.titleEn}
            </p>
          </div>

          {/* Bottom Cover Author Callout */}
          <div className="border-t border-white/20 pt-1.5 z-10 flex items-center justify-between text-[10px] pointer-events-none">
            <span className="font-serif text-white/80 truncate max-w-[55%]">{novel.authorNameEn}</span>
            <UrduText as="span" size="xs" className="text-white/90 py-0 truncate max-w-[40%] font-normal">
              {novel.authorNameUrdu}
            </UrduText>
          </div>
        </div>
      </div>

      {/* Card Content & Details (Compact without synopsis bloat) */}
      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2 min-w-0">
        
        {/* Title & Transliteration */}
        <div className="space-y-1">
          <Link
            href={`/novels/${novel.slug}`}
            className="group-hover:text-accent transition-colors block after:absolute after:inset-0 after:z-10 focus:outline-none"
            aria-label={`Read ${novel.titleEn || novel.titleUrdu}`}
          >
            <UrduText
              as="h3"
              size="base"
              className="font-bold text-navy group-hover:text-accent leading-[2.0] sm:leading-[2.1] py-0 line-clamp-1 text-base sm:text-lg transition-colors"
            >
              {novel.titleUrdu}
            </UrduText>
            <p className="font-serif text-xs text-secondary group-hover:text-navy/80 tracking-wider uppercase line-clamp-1 transition-colors">
              {novel.titleEn}
            </p>
          </Link>

          {/* Author Byline */}
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-secondary pt-0.5 relative z-20 pointer-events-none">
            <div className="flex items-center gap-1 min-w-0">
              <Feather className="w-3 h-3 text-accent shrink-0" />
              <span className="font-medium truncate">{novel.authorNameEn}</span>
            </div>
            <UrduText as="span" size="xs" className="text-secondary py-0 shrink-0 ml-1">
              {novel.authorNameUrdu}
            </UrduText>
          </div>
        </div>

        {/* Footer: Chapter count & Price */}
        <div className="pt-2 mt-1 border-t border-border flex items-center justify-between text-xs pointer-events-none">
          <div className="flex items-center gap-1 text-secondary text-[11px] sm:text-xs">
            <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-accent shrink-0" />
            <span className="truncate">
              {novel.totalChapters}{" "}
              <span className="hidden sm:inline">
                {novel.totalChapters === 1 ? "Chapter" : "Chapters"}
              </span>
              <span className="sm:hidden">
                {novel.totalChapters === 1 ? "Ch" : "Chs"}
              </span>
            </span>
          </div>

          <div className="shrink-0">
            <span className="font-serif text-xs sm:text-sm font-bold text-navy">
              {formatPKR(novel.pricePKR)}
            </span>
          </div>
        </div>

      </div>

    </article>
  );
}
