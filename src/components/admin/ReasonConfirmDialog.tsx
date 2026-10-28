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
    destructive: 'bg-danger hover:bg-danger-hover text-white',
    warning: 'bg-warning hover:bg-primary text-white',
    primary: 'bg-accent-admin hover:bg-accent-admin-dark text-white',
  };

  const iconStyles = {
    destructive: 'bg-danger-soft border-danger-border text-danger-text',
    warning: 'bg-warning-soft border-warning-border text-accent-strong',
    primary: 'bg-accent-admin-light border-accent-admin-border text-accent-admin',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconStyles[confirmVariant]}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-navy">{title}</h3>
            <p className="text-xs text-secondary mt-1">{description}</p>
          </div>
        </div>

        {requireReason && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-main flex items-center justify-between">
              <span>{reasonLabel}</span>
              <span className="text-xs text-danger-text font-semibold">* required</span>
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
              className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-ring-admin/40 focus:border-accent-admin resize-none disabled:opacity-50"
            />
            {error && <p className="text-[11px] text-danger-text font-medium">{error}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-main hover:bg-ivory border border-border transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading || (requireReason && reason.trim().length < 3)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${variantStyles[confirmVariant]}`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
