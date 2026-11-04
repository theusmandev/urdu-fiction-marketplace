'use client';

import React from 'react';
import Link from 'next/link';
import { Trophy, BookOpen, Feather, ChevronRight, ShoppingBag, DollarSign, Wallet } from 'lucide-react';
import type { DashboardLeaderboardNovel, DashboardLeaderboardWriter } from '@/types/database';

interface Props {
  novels: DashboardLeaderboardNovel[];
  writers: DashboardLeaderboardWriter[];
}

function formatPkr(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return 'PKR 0';
  }
  return `PKR ${Math.round(Number(val)).toLocaleString('en-PK')}`;
}

export function DashboardLeaderboards({ novels, writers }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. TOP BESTSELLING NOVELS */}
      <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <Trophy className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-main">Top Bestselling Novels</h3>
              <p className="text-xs text-muted">Ranked by gross sales volume in period</p>
            </div>
          </div>
          <Link
            href="/admin/novels"
            className="text-xs font-semibold text-accent-admin hover:underline flex items-center gap-1 shrink-0"
          >
            <span>All Novels</span>
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {novels.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted border border-dashed border-border rounded-xl bg-surface-elevated">
            No novel sales recorded in this timeframe.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {novels.map((novel, idx) => (
              <div
                key={novel.novel_id}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 font-mono ${
                      idx === 0
                        ? 'bg-accent/20 text-accent-strong border border-accent/30'
                        : idx === 1
                        ? 'bg-surface-elevated text-main border border-border'
                        : idx === 2
                        ? 'bg-info-soft text-info-text border border-info-border'
                        : 'bg-surface text-muted border border-border'
                    }`}
                  >
                    #{idx + 1}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-baseline gap-2 truncate">
                      <span className="font-bold text-xs text-main truncate">
                        {novel.title_en}
                      </span>
                      {novel.title_ur && (
                        <span
                          className="font-urdu text-muted text-[13px] leading-none shrink-0"
                          dir="rtl"
                        >
                          {novel.title_ur}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted flex items-center gap-1">
                      <Feather className="w-3 h-3 text-muted shrink-0" />
                      <span className="truncate">{novel.writer_name}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-0.5">
                  <div className="text-xs font-bold text-main font-mono">
                    {formatPkr(novel.gmv_pkr)}
                  </div>
                  <div className="text-[11px] text-muted font-mono flex items-center justify-end gap-1">
                    <ShoppingBag className="w-3 h-3 text-muted" />
                    <span>{novel.copies_sold.toLocaleString()} sold</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. TOP PERFORMING AUTHORS */}
      <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <Feather className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-main">Top Performing Authors</h3>
              <p className="text-xs text-muted">Authors generating highest marketplace volume</p>
            </div>
          </div>
          <Link
            href="/admin/writers"
            className="text-xs font-semibold text-accent-admin hover:underline flex items-center gap-1 shrink-0"
          >
            <span>All Authors</span>
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {writers.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted border border-dashed border-border rounded-xl bg-surface-elevated">
            No author sales recorded in this timeframe.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {writers.map((writer, idx) => (
              <div
                key={writer.writer_id}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 font-mono ${
                      idx === 0
                        ? 'bg-accent/20 text-accent-strong border border-accent/30'
                        : idx === 1
                        ? 'bg-surface-elevated text-main border border-border'
                        : idx === 2
                        ? 'bg-info-soft text-info-text border border-info-border'
                        : 'bg-surface text-muted border border-border'
                    }`}
                  >
                    #{idx + 1}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-baseline gap-2 truncate">
                      <span className="font-bold text-xs text-main truncate">
                        {writer.pen_name_en}
                      </span>
                      {writer.pen_name_ur && (
                        <span
                          className="font-urdu text-muted text-[13px] leading-none shrink-0"
                          dir="rtl"
                        >
                          {writer.pen_name_ur}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-muted shrink-0" />
                        {writer.published_novels_count} novels
                      </span>
                      <span>•</span>
                      <span>{writer.copies_sold} copies</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-0.5">
                  <div className="text-xs font-bold text-main font-mono">
                    {formatPkr(writer.gmv_pkr)}
                  </div>
                  <div className="text-[11px] text-success-text font-mono flex items-center justify-end gap-1">
                    <Wallet className="w-3 h-3" />
                    <span>Net: {formatPkr(writer.writer_net_pkr)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

