'use client';

import React, { useState, useTransition } from 'react';
import {
  ALLOWED_SITE_PALETTES,
  PALETTES_CONFIG,
  type SitePalette,
  type PaletteMeta,
} from '@/lib/settings/palette';
import { setAdminPreviewCookie, clearAdminPreviewCookie } from './AdminPalettePreview';
import { adminSetSitePaletteAction } from '@/app/actions/admin';
import { UrduText } from '@/components/urdu/UrduText';
import {
  Palette,
  CheckCircle2,
  Sparkles,
  Eye,
  Globe,
  AlertCircle,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';

interface AdminAppearanceCardProps {
  currentPalette: SitePalette;
  lastUpdatedBy?: {
    name: string;
    username?: string | null;
  } | null;
  lastUpdatedAt?: string | null;
}

function formatDisplayDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-PK', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function AdminAppearanceCard({
  currentPalette: initialPalette,
  lastUpdatedBy,
  lastUpdatedAt,
}: AdminAppearanceCardProps) {
  const [activePalette, setActivePalette] = useState<SitePalette>(initialPalette);
  const [selectedPalette, setSelectedPalette] = useState<SitePalette>(initialPalette);
  const [adminNote, setAdminNote] = useState<string>('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastChangedTime, setLastChangedTime] = useState<string | null>(lastUpdatedAt || null);
  const [lastChangedActor, setLastChangedActor] = useState<{ name: string; username?: string | null } | null>(
    lastUpdatedBy || null
  );

  const selectedMeta = PALETTES_CONFIG[selectedPalette];

  const handlePreviewOnScreen = () => {
    setAdminPreviewCookie(selectedPalette);
    setSuccessMessage(`Previewing ${selectedMeta.name} on your screen. Use the floating bar below to exit or apply.`);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleConfirmApply = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsConfirmOpen(false);

    startTransition(async () => {
      const res = await adminSetSitePaletteAction(selectedPalette, adminNote);

      if (res.success && res.data) {
        setActivePalette(res.data.palette);
        setLastChangedTime(res.data.updatedAt);
        setLastChangedActor({ name: 'You (Administrator)' });
        clearAdminPreviewCookie();
        setAdminNote('');
        setSuccessMessage(
          `Site appearance successfully updated to "${PALETTES_CONFIG[res.data.palette].name}". All visitor pages will refresh with the new palette in a few seconds.`
        );
      } else {
        setErrorMessage(res.error || 'Failed to update site appearance palette.');
      }
    });
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-card space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-main">Site Appearance &amp; Color Scheme</h2>
              <p className="text-xs text-muted">
                Select from three curated light palettes with guaranteed WCAG AA contrast.
              </p>
            </div>
          </div>
        </div>

        {/* Last updated audit info */}
        {lastChangedTime && (
          <div className="text-left sm:text-right text-[11px] text-muted">
            <p>
              Last changed by{' '}
              <span className="font-semibold text-main">
                {lastChangedActor?.name || (lastChangedActor?.username ? `@${lastChangedActor.username}` : 'Administrator')}
              </span>
            </p>
            <p className="text-[10px] text-muted/80">{formatDisplayDate(lastChangedTime)}</p>
          </div>
        )}
      </div>

      {/* Notifications */}
      {successMessage && (
        <div
          role="status"
          className="p-3.5 rounded-xl border border-success-border bg-success-soft text-success-text text-xs flex items-center gap-2.5 animate-in fade-in"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-danger-border bg-danger-soft text-danger-text text-xs flex items-center gap-2.5 animate-in fade-in"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-danger-text" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Palette Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {ALLOWED_SITE_PALETTES.map((paletteId) => {
          const meta: PaletteMeta = PALETTES_CONFIG[paletteId];
          const isCurrentActive = activePalette === paletteId;
          const isSelected = selectedPalette === paletteId;

          return (
            <div
              key={paletteId}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => setSelectedPalette(paletteId)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setSelectedPalette(paletteId);
                }
              }}
              className={`relative rounded-2xl border-2 p-4 transition-all cursor-pointer flex flex-col justify-between gap-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                isSelected
                  ? 'border-primary bg-surface shadow-md ring-1 ring-primary/20'
                  : 'border-border bg-surface-muted/40 hover:border-border-strong hover:bg-surface'
              }`}
            >
              {/* Header inside card */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-main">{meta.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-muted">
                        Palette {meta.legacyCode}
                      </span>
                    </div>
                    <UrduText as="p" size="xs" className="text-accent-strong py-0 mt-0.5">
                      {meta.nameUrdu}
                    </UrduText>
                  </div>

                  {isCurrentActive ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success-soft text-success-text border border-success-border">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Live Site</span>
                    </span>
                  ) : isSelected ? (
                    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-contrast">
                      Selected
                    </span>
                  ) : null}
                </div>

                <p className="text-[11px] text-muted leading-relaxed">{meta.description}</p>
              </div>

              {/* Color Swatches */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Color Swatches</span>
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border border-border shadow-xs flex items-center justify-center text-[9px] font-mono"
                    style={{ backgroundColor: meta.swatches.bg }}
                    title={`Background: ${meta.swatches.bg}`}
                  >
                    bg
                  </div>
                  <div
                    className="w-8 h-8 rounded-lg border border-border shadow-xs flex items-center justify-center text-[9px] font-mono"
                    style={{ backgroundColor: meta.swatches.surface }}
                    title={`Surface: ${meta.swatches.surface}`}
                  >
                    card
                  </div>
                  <div
                    className="w-8 h-8 rounded-lg border border-border shadow-xs flex items-center justify-center text-[9px] font-mono text-white"
                    style={{ backgroundColor: meta.swatches.primary }}
                    title={`Primary: ${meta.swatches.primary}`}
                  >
                    pri
                  </div>
                  <div
                    className="w-8 h-8 rounded-lg border border-border shadow-xs flex items-center justify-center text-[9px] font-mono text-white"
                    style={{ backgroundColor: meta.swatches.accent }}
                    title={`Accent (Gold): ${meta.swatches.accent}`}
                  >
                    acc
                  </div>
                  <div
                    className="w-8 h-8 rounded-lg border border-border shadow-xs flex items-center justify-center text-[9px] font-mono text-white"
                    style={{ backgroundColor: meta.swatches.accentStrong }}
                    title={`Accent Strong (Text/Links): ${meta.swatches.accentStrong}`}
                  >
                    txt
                  </div>
                </div>
              </div>

              {/* Scoped Mini Mock: Renders strictly using that palette's CSS variables */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Live Mini Mock</span>
                <div
                  data-palette={paletteId}
                  className="p-3 rounded-xl border border-border bg-bg text-text shadow-xs space-y-2.5 transition-colors select-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-serif font-bold text-xs text-primary truncate">پیرِ کامل</span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-success-soft text-success-text border border-success-border shrink-0">
                      فروخت جاری
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                    <span className="font-mono text-[11px] font-bold text-accent-strong">PKR 500</span>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="btn-primary text-[10px] px-2.5 py-0.5 min-h-[26px] rounded-md shadow-xs"
                    >
                      خریدیں
                    </button>
                  </div>
                </div>
              </div>

              {/* Contrast verification status */}
              <div className="pt-2 border-t border-border/80 flex items-center justify-between text-[10px] text-muted">
                <span className="flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-success" />
                  <span>{meta.contrastSummary.status}</span>
                </span>
                <span className="font-mono font-semibold text-main">
                  {meta.contrastSummary.textOnBg}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Admin Note and Action Bar */}
      <div className="pt-4 border-t border-border space-y-4">
        <div>
          <label htmlFor="palette-admin-note" className="block text-xs font-semibold text-main mb-1">
            Change Justification Note <span className="font-normal text-muted">(Optional, recorded in audit logs)</span>
          </label>
          <input
            id="palette-admin-note"
            type="text"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="e.g. Seasonal appearance refresh for Eid / Winter catalog release"
            className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-border bg-surface text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs text-muted">
            Selected: <span className="font-bold text-main">{selectedMeta.name}</span>
            {selectedPalette === activePalette && (
              <span className="ml-1.5 text-success-text font-medium">(Currently Active)</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreviewOnScreen}
              className="btn-secondary text-xs px-3.5 py-2 min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-accent-strong" />
              <span>Preview on my screen</span>
            </button>

            <button
              type="button"
              onClick={() => setIsConfirmOpen(true)}
              disabled={isPending || selectedPalette === activePalette}
              className="btn-primary text-xs px-4 py-2 min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  <span>Apply to everyone</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                <h3 className="font-bold text-base text-main">Confirm Site Palette Switch</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="text-muted hover:text-main p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              This changes the look of the whole site for all visitors to{' '}
              <strong className="text-main">{selectedMeta.name}</strong>. You can switch back at any time.
            </p>

            {adminNote.trim() && (
              <div className="p-2.5 rounded-xl bg-surface-muted border border-border text-[11px]">
                <span className="font-semibold text-main">Recorded Note: </span>
                <span className="text-muted">{adminNote.trim()}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="btn-secondary text-xs px-3.5 py-2 min-h-[38px] rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                disabled={isPending}
                className="btn-primary text-xs px-4 py-2 min-h-[38px] flex items-center gap-1.5 rounded-xl shadow-sm"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm &amp; Switch Palette</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

