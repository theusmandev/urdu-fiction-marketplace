'use client';

import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { TipCard } from './TipCard';
import { TIP_CARD_COPY } from '@/lib/copy/tips';

interface WriterProfileTipButtonProps {
  writerId: string;
  className?: string;
}

export function WriterProfileTipButton({
  writerId,
  className = '',
}: WriterProfileTipButtonProps) {
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [sessionUser, setSessionUser] = useState<{ id: string; role: string | null } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session?.user) {
        const role =
          session.user.user_metadata?.role ||
          session.user.app_metadata?.role ||
          'reader';
        setSessionUser({ id: session.user.id, role });
      } else {
        setSessionUser(null);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const firstFocusable = dialogRef.current.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href]'
        );
        firstFocusable?.focus();
      }
    }, 50);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, handleClose]);

  // Client hydration checks
  // 1. If signed in user is the writer themselves -> show owner private note
  if (isMounted && sessionUser?.id === writerId) {
    return (
      <div
        data-testid="owner-tip-note"
        className={`inline-flex flex-wrap items-center gap-2 px-3.5 py-2 rounded-xl border border-warning-border/60  bg-warning-soft/50  text-xs text-warning-text  ${className}`}
      >
        <Heart className="w-3.5 h-3.5 text-accent-strong dark:text-accent-strong shrink-0" />
        <span>Readers see a &ldquo;Say thanks&rdquo; button here.</span>
        <Link
          href="/writer/tips"
          className="font-medium underline hover:text-warning-text inline-flex items-center gap-1"
        >
          <span>Manage tip settings</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    );
  }

  // 2. If signed in user is an admin -> hide
  if (isMounted && sessionUser?.role === 'admin') {
    return null;
  }

  // 3. Visitor / Reader button (rendered during SSR and for non-owner users)
  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Say thanks to author / مصنف کا شکریہ ادا کریں"
        className="inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-full bg-primary hover:bg-primary-hover text-primary-contrast font-medium transition-all min-h-[44px] shadow-sm hover:shadow-md hover:opacity-95 active:scale-[0.99] touch-manipulation cursor-pointer w-full sm:w-auto"
      >
        <span className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
          <Heart className="w-3.5 h-3.5 fill-accent text-accent shrink-0" />
        </span>
        <span className="font-semibold text-sm tracking-wide shrink-0">
          Say Thanks
        </span>
        <span className="h-4 w-px bg-current/25 mx-1 shrink-0" aria-hidden="true" />
        <span
          dir="rtl"
          lang="ur"
          className="font-urdu text-base leading-none pb-0.5 shrink-0"
        >
          {TIP_CARD_COPY.titleUrdu}
        </span>
      </button>

      {isOpen && isMounted && typeof document !== 'undefined' &&
        createPortal(
          <div
            role="presentation"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleClose();
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Say thanks to author"
              className="w-full max-h-[92vh] sm:max-h-[88vh] sm:max-w-xl min-w-0 overflow-y-auto overscroll-contain focus:outline-hidden"
              tabIndex={-1}
            >
              <TipCard
                writerId={writerId}
                isModal
                onClose={handleClose}
                className="rounded-t-3xl sm:rounded-3xl shadow-2xl"
              />
            </div>
          </div>,
          document.body
        )
      }
    </div>
  );
}
