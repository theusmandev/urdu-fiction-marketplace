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
      <div
        className={`relative transition-all duration-300 ${
          !expanded && isLong ? "max-h-28 overflow-hidden" : ""
        }`}
      >
        <UrduText
          as="p"
          size="base"
          className="text-main leading-[2.4] text-right font-normal"
        >
          {synopsis}
        </UrduText>

        {!expanded && isLong && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface via-surface/80 to-transparent pointer-events-none" />
        )}
      </div>

      {isLong && (
        <div className="pt-2 text-center border-t border-border/40 mt-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="min-h-[44px] px-4 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-dark transition-colors cursor-pointer"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <span>کم پڑھیں / Show less</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>مزید پڑھیں / Read more</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
