import React from "react";

export function NovelCardSkeleton() {
  return (
    <div className="bg-surface h-full flex flex-col overflow-hidden rounded-2xl border border-border/80 shadow-xs animate-pulse">
      {/* 2:3 Aspect Ratio Cover Skeleton - locked shrink-0 */}
      <div className="relative w-full aspect-[2/3] shrink-0 overflow-hidden bg-stone-100" />

      {/* Card Body Skeleton */}
      <div className="p-3.5 flex-1 flex flex-col justify-between gap-3 min-w-0">
        <div className="space-y-1.5 min-w-0">
          <div className="h-4 bg-slate-200 rounded w-4/5" />
          <div className="h-2.5 bg-slate-100 rounded w-1/2" />
          <div className="h-3 bg-slate-100 rounded w-2/3 mt-1.5" />
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-border flex items-center justify-between min-w-0">
          <div className="h-3 bg-slate-100 rounded w-1/3" />
          <div className="h-4 bg-slate-200 rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}
