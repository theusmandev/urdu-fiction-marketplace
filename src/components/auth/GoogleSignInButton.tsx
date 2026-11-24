'use client';

import React, { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { sanitizeRedirectPath } from '@/lib/auth/safe-redirect';

export interface GoogleSignInButtonProps {
  enabled: boolean;
  nextParam?: string | null;
  className?: string;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.94H1.27v3.14C3.25 21.27 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.26c-.25-.72-.38-1.49-.38-2.26s.13-1.54.38-2.26V6.6H1.27C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.4l4.01-3.14z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.73 1.27 6.6l4.01 3.14c.95-2.84 3.6-4.99 6.72-4.99z"
      />
    </svg>
  );
}

export function GoogleSignInButton({ enabled, nextParam, className }: GoogleSignInButtonProps) {
  // Feature flag guard: If not enabled from server, render NOTHING (zero UI/runtime change)
  if (!enabled) {
    return null;
  }

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      let redirectTo = `${window.location.origin}/auth/callback`;

      // Append sanitized relative redirect param ONLY if a safe internal path was received
      if (nextParam && typeof nextParam === 'string') {
        const trimmed = nextParam.trim();
        if (
          trimmed.startsWith('/') &&
          !trimmed.startsWith('//') &&
          !trimmed.startsWith('/\\') &&
          !trimmed.startsWith('\\')
        ) {
          const safeNext = sanitizeRedirectPath(trimmed, '');
          if (safeNext) {
            const callbackUrl = new URL(redirectTo);
            callbackUrl.searchParams.set('next', safeNext);
            redirectTo = callbackUrl.toString();
          }
        }
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (signInError) {
        setIsLoading(false);
        setError('Unable to initiate Google sign-in. Please try again or use email sign-in.');
      }
    } catch {
      setIsLoading(false);
      setError('Unable to initiate Google sign-in. Please try again or use email sign-in.');
    }
  };

  return (
    <div className={`space-y-4 ${className || ''}`}>
      {error && (
        <div className="rounded-xl bg-danger-soft border border-danger-border p-4 flex items-start gap-3 text-danger-text text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-danger-text mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        aria-label="Continue with Google"
        className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface hover:bg-surface-muted px-4 py-3 text-sm font-semibold text-navy shadow-xs hover:shadow-sm transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-accent-strong shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold whitespace-nowrap">Connecting to Google...</span>
          </>
        ) : (
          <>
            <GoogleIcon className="w-5 h-5 shrink-0" />
            <span className="text-sm font-semibold whitespace-nowrap">Continue with Google</span>
          </>
        )}
      </button>

      {/* Crisp Horizontal Flexbox Divider */}
      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
