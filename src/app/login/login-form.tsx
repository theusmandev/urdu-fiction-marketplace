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
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-stone-950">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-stone-800 bg-stone-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <span className="font-urdu text-3xl font-bold tracking-tight text-amber-500">
              یو این بی پریمیم
            </span>
            <span className="block text-xs uppercase tracking-widest text-stone-400 font-sans mt-0.5">
              UNB Premium
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
            Sign in to your account
          </h1>
          <p className="mt-2 text-sm text-stone-400">
            Or{' '}
            <Link
              href={nextParam ? `/register?next=${encodeURIComponent(nextParam)}` : '/register'}
              className="font-medium text-amber-500 hover:text-amber-400 transition-colors"
            >
              create a new reader account
            </Link>
          </p>
        </div>

        {/* System Message Notifications */}
        {systemError && (
          <div className="rounded-lg bg-red-950/60 border border-red-800/80 p-4 flex items-start gap-3 text-red-200 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <span>{systemError}</span>
          </div>
        )}

        {messageCode === 'password_updated' && (
          <div className="rounded-lg bg-emerald-950/60 border border-emerald-800/80 p-4 flex items-start gap-3 text-emerald-200 text-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
            <span>Your password was reset successfully. Please log in with your new password.</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-950/60 border border-red-800/80 p-4 flex items-start gap-3 text-red-200 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
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

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-stone-300">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-amber-500 hover:text-amber-400 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-500">
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
                  className="block w-full rounded-lg border border-stone-700 bg-stone-950/80 py-2.5 pl-10 pr-3 text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm disabled:opacity-50"
                />
              </div>
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
