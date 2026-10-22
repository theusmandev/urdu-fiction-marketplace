import React from "react";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { formatPKR } from "@/lib/utils";
import { 
  BookOpen, 
  Feather, 
  Sparkles,
  ArrowRight
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
    <article className="group relative bg-surface rounded-2xl border border-border/80 hover:border-accent/40 shadow-card hover:shadow-book-hover transition-all duration-300 flex flex-col overflow-hidden">
      
      {/* Aspect Ratio 2:3 Cover Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-ivory-dark">
        {/* Editorial Book Spine Visual Styling */}
        <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/25 via-black/10 to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 left-3 w-px bg-white/20 z-10 pointer-events-none" />

        {/* Artistic Cover Art (Gradient/Texture + Calligraphy) */}
        <div
          className={`w-full h-full p-6 flex flex-col justify-between text-white relative transition-transform duration-500 group-hover:scale-105 ${novel.coverGradient}`}
        >
          {/* Subtle Islamic/Geometric Corner Ornamentation */}
          <div className="absolute top-3 right-3 text-white/30 text-xs font-serif select-none pointer-events-none">
            ✦ UNB EDITORIAL ✦
          </div>

          {/* Top Badges */}
          <div className="flex items-center justify-between gap-2 z-10">
            {novel.hasFreePreview && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white/90 backdrop-blur-sm text-navy px-2.5 py-0.5 rounded-full shadow-sm">
                <Sparkles className="w-3 h-3 text-accent" />
                <span>Free Preview</span>
              </span>
            )}
            <span className="text-[11px] font-medium bg-black/40 backdrop-blur-sm text-white/90 px-2 py-0.5 rounded-full ml-auto">
              {novel.genreEn}
            </span>
          </div>

          {/* Center Calligraphic Title on Cover */}
          <div className="my-auto text-center z-10 px-2">
            <UrduText
              as="h2"
              size="2xl"
              className="text-white drop-shadow-md py-1 leading-[2.4]"
            >
              {novel.titleUrdu}
            </UrduText>
            <p className="font-serif text-xs text-white/80 tracking-widest uppercase mt-1 font-medium">
              {novel.titleEn}
            </p>
          </div>

          {/* Bottom Cover Author Callout */}
          <div className="border-t border-white/20 pt-2 z-10 flex items-center justify-between text-xs">
            <span className="font-serif text-white/80">{novel.authorNameEn}</span>
            <UrduText as="span" size="xs" className="text-white/90 py-0">
              {novel.authorNameUrdu}
            </UrduText>
          </div>
        </div>
      </div>

      {/* Card Content & Details */}
      <div className="p-5 flex-1 flex flex-col justify-between gap-3">
        
        {/* Title & Transliteration */}
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/novels/${novel.slug}`}
              className="group-hover:text-accent transition-colors block flex-1"
            >
              <UrduText
                as="h3"
                size="lg"
                className="font-semibold text-navy hover:text-accent leading-[2.2] py-0 line-clamp-1"
              >
                {novel.titleUrdu}
              </UrduText>
            </Link>
          </div>

          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-serif font-medium">{novel.titleEn}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-navy/70">
              <BookOpen className="w-3 h-3 text-accent" />
              <span>{novel.totalChapters} Chapters</span>
            </span>
          </div>
        </div>

        {/* Urdu Synopsis Excerpt (Ensuring ascenders/descenders are unclipped) */}
        <div className="py-1">
          <UrduText
            size="sm"
            className="text-main/75 line-clamp-2 leading-[2.3] py-0.5"
          >
            {novel.synopsisUrdu}
          </UrduText>
        </div>

        {/* Author byline */}
        <div className="flex items-center justify-between pt-2 border-t border-border/70 text-xs">
          <div className="flex items-center gap-1.5 text-secondary">
            <Feather className="w-3.5 h-3.5 text-accent" />
            <span>By</span>
            <span className="font-medium text-navy">{novel.authorNameEn}</span>
          </div>
          <UrduText as="span" size="xs" className="text-secondary py-0">
            {novel.authorNameUrdu}
          </UrduText>
        </div>

        {/* Price & Direct Purchase Button */}
        <div className="pt-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] text-secondary font-medium uppercase tracking-wide">
              Direct Price
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-serif text-xl font-bold text-navy">
                {formatPKR(novel.pricePKR)}
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">
                (100% to author)
              </span>
            </div>
          </div>

          <Link
            href={`/novels/${novel.slug}`}
            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg bg-navy hover:bg-navy-light text-white text-xs font-medium transition-all group-hover:bg-accent group-hover:text-navy shadow-sm"
          >
            <span>Read Novel</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

      </div>

    </article>
  );
}
