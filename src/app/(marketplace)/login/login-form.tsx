'use client';

import React, { useState, useTransition, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, AlertCircle, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { loginUser } from '@/app/actions/auth';

export interface LoginFormProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export function LoginForm({ searchParams }: LoginFormProps) {
  const resolvedParams = use(searchParams);
  const router = useRouter();

  const nextParam = typeof resolvedParams.next === 'string' ? resolvedParams.next : null;
  const errorCode = typeof resolvedParams.error === 'string' ? resolvedParams.error : null;
  const messageCode = typeof resolvedParams.message === 'string' ? resolvedParams.message : null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const getSystemError = () => {
    if (errorCode === 'account_deactivated') {
      return 'Your account has been deactivated. Please contact support at support@unbpremium.pk.';
    }
    if (errorCode === 'auth_callback_failed') {
      return 'Authentication link expired or invalid. Please request a new link.';
    }
    if (errorCode === 'insufficient_permissions') {
      return 'You do not have administrative privileges to access that section.';
    }
    return null;
  };

  const systemError = getSystemError();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append('email', email);
    formData.append('password', password);

    startTransition(async () => {
      const result = await loginUser(formData, nextParam);

      if (!result.success) {
        setError(result.error || 'Failed to log in. Please verify your credentials.');
      } else if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
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
            Sign in to your account
          </h1>
          <p className="mt-2 text-sm text-secondary">
            Or{' '}
            <Link
              href={nextParam ? `/register?next=${encodeURIComponent(nextParam)}` : '/register'}
              className="font-semibold text-accent hover:text-accent-dark transition-colors"
            >
              create a new reader account
            </Link>
          </p>
        </div>

        {/* System Message Notifications */}
        {systemError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-rose-800 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
            <span>{systemError}</span>
          </div>
        )}

        {messageCode === 'password_updated' && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3 text-emerald-800 text-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
            <span>Your password was reset successfully. Please log in with your new password.</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-rose-800 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
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

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-semibold text-secondary">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-accent hover:text-accent-dark transition-colors min-h-[36px] flex items-center"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isPending}
                  className="block w-full rounded-xl border border-border bg-surface-muted py-2.5 pl-10 pr-3 text-navy placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent text-base sm:text-sm min-h-[44px] disabled:opacity-50 transition-colors"
                />
              </div>
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
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
