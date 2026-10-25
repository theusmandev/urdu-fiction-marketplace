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
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-stone-950">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-stone-800 bg-stone-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <span className="font-urdu text-4xl tracking-tight text-amber-500">
              یو این بی پریمیم
            </span>
            <span className="block text-xs uppercase tracking-widest text-stone-400 font-sans mt-0.5">
              UNB Premium
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-stone-400">
            Enter your registered email address and we will send you instructions to reset your password.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-xl border border-emerald-800/80 bg-emerald-950/60 p-6 text-center space-y-4">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Check Your Inbox</h2>
            <p className="text-sm text-emerald-200/90 leading-relaxed">
              {message}
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-amber-500 hover:text-amber-400 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Return to sign in</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg bg-red-950/60 border border-red-800/80 p-4 flex items-start gap-3 text-red-200 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-stone-300">
                  Email address
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-500">
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
                    className="block w-full rounded-lg border border-stone-700 bg-stone-950/80 py-2.5 pl-10 pr-3 text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm disabled:opacity-50"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-900/20 hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-stone-900 disabled:opacity-50 transition-all cursor-pointer"
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
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-400 hover:text-white transition-colors"
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
