'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Info,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import type { WriterAnnouncementVariant } from '@/types/database';

export interface WriterAnnouncementData {
  enabled: boolean;
  variant: WriterAnnouncementVariant;
  title_en?: string | null;
  title_ur?: string | null;
  body_en?: string | null;
  body_ur?: string | null;
  link_url?: string | null;
  link_label?: string | null;
  dismissible?: boolean;
  updated_at?: string | null;
}

interface Props {
  announcement: WriterAnnouncementData;
}

const STORAGE_KEY = 'unb_dismissed_writer_announcement';

const VARIANT_CONFIG: Record<
  WriterAnnouncementVariant,
  {
    containerClass: string;
    badgeClass: string;
    icon: React.ReactNode;
    badgeEn: string;
    badgeUr: string;
  }
> = {
  info: {
    containerClass: 'bg-info-soft/40 border-info-border text-info-text',
    badgeClass: 'bg-info-soft text-info-text border-info-border',
    icon: <Info className="w-4 h-4 text-info-text shrink-0" />,
    badgeEn: 'Notice',
    badgeUr: 'اطلاع',
  },
  feature: {
    containerClass: 'bg-accent-writer-soft/40 border-accent-writer-border text-accent-writer-strong',
    badgeClass: 'bg-accent-writer-soft text-accent-writer border-accent-writer-border',
    icon: <Sparkles className="w-4 h-4 text-accent-writer shrink-0" />,
    badgeEn: 'New Feature',
    badgeUr: 'نئی سہولت',
  },
  warning: {
    containerClass: 'bg-warning-soft/40 border-warning-border text-warning-text',
    badgeClass: 'bg-warning-soft text-warning-text border-warning-border',
    icon: <AlertTriangle className="w-4 h-4 text-warning-text shrink-0" />,
    badgeEn: 'Important Notice',
    badgeUr: 'اہم اطلاع',
  },
  success: {
    containerClass: 'bg-success-soft/40 border-success-border text-success-text',
    badgeClass: 'bg-success-soft text-success-text border-success-border',
    icon: <CheckCircle2 className="w-4 h-4 text-success-text shrink-0" />,
    badgeEn: 'Update',
    badgeUr: 'تازہ ترین',
  },
};

export function WriterAnnouncementBanner({ announcement }: Props) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const {
    enabled,
    variant = 'info',
    title_en = '',
    title_ur = '',
    body_en = '',
    body_ur = '',
    link_url = '',
    link_label = '',
    dismissible = true,
    updated_at = '',
  } = announcement || {};

  // Check dismissal in localStorage based on updated_at timestamp fingerprint
  useEffect(() => {
    setMounted(true);
    if (!dismissible || !updated_at) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === updated_at) {
        setIsDismissed(true);
      }
    } catch {
      // LocalStorage access errors handled gracefully
    }
  }, [dismissible, updated_at]);

  function handleDismiss() {
    setIsDismissed(true);
    if (!dismissible || !updated_at) return;
    try {
      localStorage.setItem(STORAGE_KEY, updated_at);
    } catch {
      // LocalStorage access errors handled gracefully
    }
  }

  // Hide if not enabled or dismissed
  if (!enabled || isDismissed) {
    return null;
  }

  const hasEnglish = Boolean((title_en && title_en.trim()) || (body_en && body_en.trim()));
  const hasUrdu = Boolean((title_ur && title_ur.trim()) || (body_ur && body_ur.trim()));

  // Hide if there's no textual content in either language
  if (!hasEnglish && !hasUrdu) {
    return null;
  }

  const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.info;
  const isExternalLink = link_url ? /^https?:\/\//i.test(link_url) : false;
  const ctaText = link_label?.trim() || (hasUrdu && !hasEnglish ? 'تفصیلات دیکھیں' : 'View Details / تفصیلات');

  return (
    <div
      role="region"
      aria-label="Writer Announcement"
      className={`relative rounded-2xl border p-4 sm:p-5 shadow-xs transition-all ${config.containerClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Main Banner Content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Header Badge */}
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-surface/80 border border-border/40 shadow-2xs">
              {config.icon}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase border ${config.badgeClass}`}
            >
              <span>{config.badgeEn}</span>
              <span className="opacity-50">/</span>
              <span className="font-urdu leading-none">{config.badgeUr}</span>
            </span>
          </div>

          {/* Bilingual Message Grid */}
          <div
            className={`gap-4 sm:gap-6 ${
              hasEnglish && hasUrdu
                ? 'grid grid-cols-1 md:grid-cols-2 md:items-start md:divide-x md:divide-border/60'
                : 'block'
            }`}
          >
            {/* English Content */}
            {hasEnglish && (
              <div className="space-y-1 pr-0 md:pr-4">
                {title_en && (
                  <h3 className="text-sm sm:text-base font-bold text-main tracking-tight">
                    {title_en}
                  </h3>
                )}
                {body_en && (
                  <p className="text-xs sm:text-sm text-muted leading-relaxed">
                    {body_en}
                  </p>
                )}
              </div>
            )}

            {/* Urdu Content (Nastaliq, RTL) */}
            {hasUrdu && (
              <div
                dir="rtl"
                className={`space-y-1 ${
                  hasEnglish ? 'pt-2 md:pt-0 md:pl-4 border-t md:border-t-0 border-border/40' : ''
                }`}
              >
                {title_ur && (
                  <h3 className="font-urdu text-base sm:text-lg font-bold text-main leading-[2.2]">
                    {title_ur}
                  </h3>
                )}
                {body_ur && (
                  <p className="font-urdu text-xs sm:text-sm text-muted leading-[2.4]">
                    {body_ur}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* CTA Button */}
          {link_url && (
            <div className="pt-1">
              {isExternalLink ? (
                <a
                  href={link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-surface border border-border hover:bg-surface-muted text-main transition-colors shadow-2xs group"
                >
                  <span>{ctaText}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-main transition-colors" />
                </a>
              ) : (
                <Link
                  href={link_url}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-surface border border-border hover:bg-surface-muted text-main transition-colors shadow-2xs group"
                >
                  <span>{ctaText}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted group-hover:translate-x-0.5 transition-transform" />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        {dismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss announcement"
            className="p-1 rounded-lg text-muted hover:text-main hover:bg-surface/60 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

