'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { forgotPassword } from '@/app/actions/auth';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append('email', email);

    startTransition(async () => {
      const result = await forgotPassword(formData);
      if (!result.success) {
        setError(result.error || 'Failed to send reset instructions.');
      } else {
        setSubmitted(true);
        setMessage(result.message || 'If an account exists, a reset link has been dispatched.');
      }
    });
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-ivory text-main">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-surface p-8 shadow-card">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <span className="font-urdu text-4xl tracking-tight text-accent">
              یو این بی پریمیم
            </span>
            <span className="block text-xs uppercase tracking-widest text-secondary font-sans mt-0.5 font-bold">
              UNB Premium
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold font-serif tracking-tight text-navy">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-secondary">
            Enter your registered email address and we will send you instructions to reset your password.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-4 shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h2 className="text-lg font-bold font-serif text-emerald-950">Check Your Inbox</h2>
            <p className="text-sm text-emerald-800 leading-relaxed">
              {message}
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:text-accent-dark transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Return to sign in</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-rose-800 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-secondary">
                  Email address
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    disabled={isPending}
                    className="block w-full rounded-xl border border-border bg-surface-muted py-2.5 pl-10 pr-3 text-navy placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent text-base sm:text-sm min-h-[44px] disabled:opacity-50 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-navy shadow-sm hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 transition-all cursor-pointer min-h-[44px]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Sending instructions...</span>
                  </>
                ) : (
                  <>
                    <span>Send Reset Link</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 text-sm font-medium text-secondary hover:text-navy transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to login</span>
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
