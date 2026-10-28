'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useMarketplaceSession } from '@/components/layout/useMarketplaceSession';
import {
  isSitePalette,
  PALETTES_CONFIG,
  type SitePalette,
  ADMIN_PALETTE_PREVIEW_COOKIE,
} from '@/lib/settings/palette';
import { adminSetSitePaletteAction } from '@/app/actions/admin';
import { Sparkles, X, Check, Loader2 } from 'lucide-react';

interface AdminPalettePreviewProps {
  /** Optional role override from shells where role is already known */
  role?: string | null;
}

function getPreviewCookie(): SitePalette | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_PALETTE_PREVIEW_COOKIE}=([^;]+)`));
  const val = match ? decodeURIComponent(match[1]) : null;
  return isSitePalette(val) ? val : null;
}

export function clearAdminPreviewCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${ADMIN_PALETTE_PREVIEW_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  window.dispatchEvent(new Event('unb_palette_preview_change'));
}

export function setAdminPreviewCookie(palette: SitePalette) {
  if (typeof document === 'undefined') return;
  // 1 hour expiration, SameSite=Lax
  document.cookie = `${ADMIN_PALETTE_PREVIEW_COOKIE}=${encodeURIComponent(palette)}; path=/; max-age=3600; SameSite=Lax`;
  window.dispatchEvent(new Event('unb_palette_preview_change'));
}

export function AdminPalettePreview({ role }: AdminPalettePreviewProps) {
  const sessionUser = useMarketplaceSession();
  const effectiveRole = role || sessionUser?.role;
  const isAdmin = effectiveRole === 'admin';

  const [previewPalette, setPreviewPalette] = useState<SitePalette | null>(null);
  const [originalPalette, setOriginalPalette] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    function checkPreviewState() {
      const cookieVal = getPreviewCookie();

      // Security check: Only admins can activate preview
      if (!isAdmin) {
        if (cookieVal) {
          clearAdminPreviewCookie();
        }
        setPreviewPalette(null);
        return;
      }

      if (cookieVal) {
        // Record original server-rendered palette on first activation
        if (!originalPalette) {
          const rootPal = document.documentElement.getAttribute('data-palette') || 'ivory_ink';
          setOriginalPalette(rootPal);
        }
        setPreviewPalette(cookieVal);
        document.documentElement.setAttribute('data-palette', cookieVal);
      } else {
        setPreviewPalette(null);
      }
    }

    checkPreviewState();

    window.addEventListener('unb_palette_preview_change', checkPreviewState);
    return () => {
      window.removeEventListener('unb_palette_preview_change', checkPreviewState);
    };
  }, [isAdmin, originalPalette]);

  if (!isAdmin || !previewPalette) {
    return null;
  }

  const meta = PALETTES_CONFIG[previewPalette];

  const handleExitPreview = () => {
    clearAdminPreviewCookie();
    if (originalPalette) {
      document.documentElement.setAttribute('data-palette', originalPalette);
    }
    setPreviewPalette(null);
  };

  const handleApplyToEveryone = () => {
    if (!previewPalette) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const res = await adminSetSitePaletteAction(
        previewPalette,
        `Applied via screen preview bar (${meta.name})`
      );

      if (res.success) {
        setSuccessMessage('Site palette applied to everyone! Pages will refresh in a few seconds.');
        clearAdminPreviewCookie();
        setOriginalPalette(previewPalette);
        setTimeout(() => {
          setPreviewPalette(null);
          setSuccessMessage(null);
        }, 3000);
      } else {
        setErrorMessage(res.error || 'Failed to update site palette.');
      }
    });
  };

  return (
    <aside
      aria-label="Admin Palette Preview Bar"
      className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-xl animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      <div className="bg-surface/95 backdrop-blur-md border-2 border-accent shadow-2xl rounded-2xl p-3 sm:px-4 sm:py-3 text-text flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-accent-soft text-accent-strong flex items-center justify-center shrink-0 border border-accent/30">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-accent-strong">
                Admin Preview Mode
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
            </div>
            <p className="text-xs text-text font-medium truncate">
              Previewing <span className="font-bold text-accent-strong">{meta.name}</span>
              <span className="hidden md:inline text-text-muted"> (visible only to you)</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={handleApplyToEveryone}
            disabled={isPending}
            className="btn-primary text-xs px-3.5 py-1.5 min-h-[38px] flex items-center gap-1.5 rounded-xl cursor-pointer shadow-sm"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Applying...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Apply to everyone</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleExitPreview}
            disabled={isPending}
            className="btn-secondary text-xs px-3 py-1.5 min-h-[38px] flex items-center gap-1 rounded-xl cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit preview</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="mt-2 p-2.5 bg-success-soft border border-success-border text-success-text text-xs rounded-xl shadow-md text-center font-medium">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="mt-2 p-2.5 bg-danger-soft border border-danger-border text-danger-text text-xs rounded-xl shadow-md text-center font-medium">
          {errorMessage}
        </div>
      )}
    </aside>
  );
}

