"use client";

import React, { useState } from "react";
import { UrduText } from "@/components/urdu/UrduText";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableSynopsisProps {
  synopsis: string;
}

export function ExpandableSynopsis({ synopsis }: ExpandableSynopsisProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = synopsis.length > 220;

  return (
    <div className="bg-surface p-4 sm:p-5 rounded-2xl border border-border">
      {/* Integrated Section Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/70">
        <h2 className="text-base sm:text-lg font-bold text-navy flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <span className="font-serif text-base sm:text-lg whitespace-nowrap">Synopsis</span>
          <span className="text-secondary/40 hidden sm:inline select-none" aria-hidden="true">/</span>
          <span
            dir="rtl"
            lang="ur"
            className="font-urdu text-sm sm:text-base font-bold text-navy whitespace-nowrap leading-snug"
          >
            ناول کا خلاصہ
          </span>
        </h2>
      </div>

      <div
        className={`relative transition-all duration-300 ${
          !expanded && isLong ? "max-h-24 overflow-hidden" : ""
        }`}
      >
        <UrduText
          as="p"
          size="base"
          className="text-main leading-[2.3] text-right font-normal"
        >
          {synopsis}
        </UrduText>

        {!expanded && isLong && (
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface via-surface/90 to-transparent pointer-events-none" />
        )}
      </div>

      {isLong && (
        <div className="pt-2 text-center border-t border-border/40 mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/10 hover:bg-accent/20 text-accent-strong text-xs font-semibold transition-colors cursor-pointer min-h-[36px]"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <span>Show less</span>
                <span className="text-accent/40 select-none" aria-hidden="true">·</span>
                <span dir="rtl" lang="ur" className="font-urdu text-xs">کم پڑھیں</span>
                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              </>
            ) : (
              <>
                <span>Read more</span>
                <span className="text-accent/40 select-none" aria-hidden="true">·</span>
                <span dir="rtl" lang="ur" className="font-urdu text-xs">مزید پڑھیں</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
