'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AlertTriangle, AlertCircle, Info, HelpCircle, X } from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';

export type ConfirmVariant = 'danger' | 'warning' | 'primary' | 'info';

export interface ConfirmOptions {
  title: string;
  titleUrdu?: string;
  message: string;
  messageUrdu?: string;
  confirmLabel?: string;
  confirmLabelUrdu?: string;
  cancelLabel?: string;
  cancelLabelUrdu?: string;
  variant?: ConfirmVariant;
  isAlert?: boolean;
}

export type AlertOptions = Omit<ConfirmOptions, 'isAlert' | 'cancelLabel' | 'cancelLabelUrdu'>;

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

interface DialogState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setDialogState({
        ...options,
        variant: options.variant || 'primary',
        confirmLabel: options.confirmLabel || (options.variant === 'danger' ? 'Confirm Delete' : 'Confirm'),
        cancelLabel: options.cancelLabel || 'Cancel',
        resolve,
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string): Promise<void> => {
    return new Promise<void>((resolve) => {
      const normalized: ConfirmOptions =
        typeof options === 'string'
          ? {
              title: 'Notice',
              titleUrdu: 'اطلاع',
              message: options,
              variant: 'info',
            }
          : {
              ...options,
              variant: options.variant || 'info',
            };

      setDialogState({
        ...normalized,
        confirmLabel: normalized.confirmLabel || 'OK',
        confirmLabelUrdu: normalized.confirmLabelUrdu || 'ٹھیک ہے',
        isAlert: true,
        resolve: () => resolve(),
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (dialogState) {
      dialogState.resolve(true);
      setDialogState(null);
    }
  }, [dialogState]);

  const handleCancel = useCallback(() => {
    if (dialogState) {
      dialogState.resolve(false);
      setDialogState(null);
    }
  }, [dialogState]);

  // Focus management and escape key listener
  useEffect(() => {
    if (!dialogState) return;

    // Focus cancel button by default for destructive actions, otherwise confirm
    if (dialogState.variant === 'danger' && cancelButtonRef.current) {
      cancelButtonRef.current.focus();
    } else if (confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogState, handleCancel]);

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}

      {dialogState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-desc"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={handleCancel}
        >
          <div
            className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Icon, Title, and Close Button */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-xl border shrink-0 ${
                    dialogState.variant === 'danger'
                      ? 'bg-danger-soft border-danger-border text-danger-text'
                      : dialogState.variant === 'warning'
                      ? 'bg-warning-soft border-warning-border text-warning-text'
                      : dialogState.variant === 'info'
                      ? 'bg-info-soft border-info-border text-info-text'
                      : 'bg-accent-soft border-border text-accent-strong'
                  }`}
                >
                  {dialogState.variant === 'danger' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : dialogState.variant === 'warning' ? (
                    <AlertCircle className="w-5 h-5" />
                  ) : dialogState.variant === 'info' ? (
                    <Info className="w-5 h-5" />
                  ) : (
                    <HelpCircle className="w-5 h-5" />
                  )}
                </div>

                <div className="space-y-0.5">
                  <h3 id="confirm-dialog-title" className="font-serif text-base sm:text-lg font-bold text-text">
                    {dialogState.title}
                  </h3>
                  {dialogState.titleUrdu && (
                    <UrduText as="p" size="xs" className="text-text-muted font-normal py-0">
                      {dialogState.titleUrdu}
                    </UrduText>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCancel}
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message Body */}
            <div className="space-y-1.5 text-xs text-text-muted leading-relaxed">
              <p id="confirm-dialog-desc">{dialogState.message}</p>
              {dialogState.messageUrdu && (
                <UrduText as="p" size="xs" className="text-text-muted py-0 font-normal leading-normal">
                  {dialogState.messageUrdu}
                </UrduText>
              )}
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              {!dialogState.isAlert && (
                <button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-text hover:bg-surface-muted border border-border transition-colors min-h-[44px] cursor-pointer"
                >
                  <span>{dialogState.cancelLabel}</span>
                  {dialogState.cancelLabelUrdu && (
                    <UrduText as="span" size="xs" className="ml-1 text-text-muted py-0 font-normal">
                      • {dialogState.cancelLabelUrdu}
                    </UrduText>
                  )}
                </button>
              )}

              <button
                ref={confirmButtonRef}
                type="button"
                onClick={handleConfirm}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] shadow-xs cursor-pointer ${
                  dialogState.variant === 'danger'
                    ? 'bg-danger hover:bg-danger-hover text-white'
                    : dialogState.variant === 'warning'
                    ? 'bg-warning hover:bg-warning-hover text-white'
                    : dialogState.variant === 'info'
                    ? 'bg-info hover:bg-info-hover text-white'
                    : 'bg-primary hover:bg-primary-hover text-primary-contrast'
                }`}
              >
                <span>{dialogState.confirmLabel}</span>
                {dialogState.confirmLabelUrdu && (
                  <UrduText as="span" size="xs" className="ml-1 py-0 font-normal opacity-90">
                    • {dialogState.confirmLabelUrdu}
                  </UrduText>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}

