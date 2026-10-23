'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ReasonConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  confirmText?: string;
  confirmVariant?: 'destructive' | 'warning' | 'primary';
  requireReason?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ReasonConfirmDialog({
  isOpen,
  title,
  description,
  reasonLabel = 'Justification / Reason (Mandatory)',
  reasonPlaceholder = 'Please enter a clear reason for this action...',
  confirmText = 'Confirm Action',
  confirmVariant = 'destructive',
  requireReason = true,
  onConfirm,
  onCancel,
  isLoading = false,
}: ReasonConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (requireReason && (!reason || reason.trim().length < 3)) {
      setError('A reason of at least 3 characters is strictly required.');
      return;
    }
    setError(null);
    await onConfirm(reason.trim());
  };

  const variantStyles = {
    destructive: 'bg-rose-600 hover:bg-rose-500 text-white',
    warning: 'bg-amber-600 hover:bg-amber-500 text-white',
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400 mt-1">{description}</p>
          </div>
        </div>

        {requireReason && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>{reasonLabel}</span>
              <span className="text-[10px] text-rose-400 font-mono">* required</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder={reasonPlaceholder}
              disabled={isLoading}
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none disabled:opacity-50"
            />
            {error && <p className="text-[11px] text-rose-400 font-medium">{error}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700/80 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading || (requireReason && reason.trim().length < 3)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none ${variantStyles[confirmVariant]}`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
