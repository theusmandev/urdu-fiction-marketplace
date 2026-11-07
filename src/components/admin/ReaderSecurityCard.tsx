'use client';

import React, { useState, useTransition } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { toggleWatermarkAction } from '@/app/actions/admin';
import { UrduText } from '@/components/urdu/UrduText';

interface ReaderSecurityCardProps {
  initialEnabled: boolean;
}

export function ReaderSecurityCard({ initialEnabled }: ReaderSecurityCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleToggle = (nextState: boolean) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await toggleWatermarkAction(nextState);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to update watermark setting');
      } else {
        setEnabled(nextState);
        setSuccessMsg(
          nextState
            ? 'Anti-piracy watermark overlay has been enabled globally across all readers.'
            : 'Anti-piracy watermark overlay has been disabled globally.'
        );
      }
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-6 shadow-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-main">Anti-Piracy Reader Watermark</h2>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  enabled
                    ? 'bg-success-soft text-success border-success-border font-semibold'
                    : 'bg-surface-muted text-muted border-border font-medium'
                }`}
              >
                {enabled ? 'Active / فعال' : 'Paused / غیر فعال'}
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed max-w-xl">
              Dynamically overlays a subtle, semi-transparent reader identification watermark (order reference & non-sensitive reader hash) onto copyrighted Urdu novel manuscripts to deter screenshotting and illicit distribution.
            </p>
          </div>
        </div>

        {/* Instant Toggle Control */}
        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
          {isPending && <Loader2 className="w-4 h-4 animate-spin text-accent-admin" />}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              disabled={isPending}
              checked={enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              className="sr-only peer"
              aria-label="Toggle anti-piracy watermark"
            />
            <div className="w-12 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-warning peer-disabled:opacity-50" />
          </label>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-danger-border bg-danger-soft text-danger-text text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-danger-text" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs hover:opacity-80 p-1"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl border border-success-border bg-success-soft text-success-text text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-xs hover:opacity-80 p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Live Preview Box & Urdu Explanatory Note */}
      <div className="rounded-xl border border-border bg-surface-muted p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-main flex items-center gap-1.5">
            {enabled ? <Eye className="w-3.5 h-3.5 text-accent-strong" /> : <EyeOff className="w-3.5 h-3.5 text-muted" />}
            <span>Watermark Display Preview</span>
          </span>
          <span className="text-[10px] font-mono text-muted">Strictly bounded to novel text</span>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-border bg-surface p-4 text-center select-none">
          {enabled ? (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-warning-border/40 bg-warning-soft/30 font-mono text-xs text-accent-strong tracking-wider">
                <span>ORD-83921</span>
                <span>•</span>
                <span>#4E9B12</span>
              </div>
              <p className="text-[11px] text-muted">
                Watermark pattern tiles unobtrusively behind manuscript Urdu text and terminates strictly before the "Say Thanks" tip jar and bottom navigation controls.
              </p>
            </div>
          ) : (
            <div className="py-2 space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs text-muted font-medium">
                <ShieldAlert className="w-4 h-4 text-muted" />
                <span>Watermark layer is globally suppressed</span>
              </div>
              <p className="text-[11px] text-muted">
                Readers will view pure manuscript text without any diagonal tracking identifier overlay.
              </p>
            </div>
          )}
        </div>

        <div className="pt-1 flex items-center justify-between text-xs text-muted">
          <UrduText size="xs" className="text-muted leading-relaxed">
            {enabled
              ? 'یہ واٹر مارک صرف ناول کے متن پر ظاہر ہوتا ہے اور ٹپ کارڈ یا بٹنوں پر اثر انداز نہیں ہوتا۔'
              : 'واٹر مارک کو عارضی طور پر غیر فعال کر دیا گیا ہے۔'}
          </UrduText>
          <span className="text-[10px] text-muted font-mono shrink-0 ml-3">
            Target: &lt;article&gt;
          </span>
        </div>
      </div>
    </div>
  );
}

