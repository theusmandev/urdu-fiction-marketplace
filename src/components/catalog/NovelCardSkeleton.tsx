import React from "react";

export function NovelCardSkeleton() {
  return (
    <div className="bg-surface rounded-xl sm:rounded-2xl border border-border/80 shadow-xs flex flex-col overflow-hidden animate-pulse">
      {/* 2:3 Aspect Ratio Cover Skeleton */}
      <div className="relative aspect-[2/3] w-full bg-slate-200" />

      {/* Card Body Skeleton */}
      <div className="p-2.5 sm:p-3.5 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-2">
          {/* Urdu Title line 1 */}
          <div className="h-4 bg-slate-200 rounded w-4/5" />
          {/* Urdu Title line 2 */}
          <div className="h-4 bg-slate-200 rounded w-3/5" />
          {/* English Title */}
          <div className="h-2.5 bg-slate-100 rounded w-1/2 mt-1" />
          {/* Author */}
          <div className="h-3 bg-slate-100 rounded w-2/3 mt-2" />
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-border flex items-center justify-between">
          <div className="h-3 bg-slate-100 rounded w-1/3" />
          <div className="h-4 bg-slate-200 rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}
