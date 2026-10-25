'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { resetPassword } from '@/app/actions/auth';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    match: password.length > 0 && password === confirmPassword,
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const formData = new FormData();
    formData.append('password', password);
    formData.append('confirmPassword', confirmPassword);

    startTransition(async () => {
      const result = await resetPassword(formData);

      if (!result.success) {
        setError(result.error || 'Failed to update password.');
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else if (result.redirectTo) {
        router.push(result.redirectTo);
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
            Set new password
          </h1>
          <p className="mt-2 text-sm text-stone-400">
            Please choose a strong, secure password for your account.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-950/60 border border-red-800/80 p-4 flex items-start gap-3 text-red-200 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-stone-300">
              New Password
            </label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isPending}
                className="block w-full rounded-lg border border-stone-700 bg-stone-950/80 py-2.5 pl-10 pr-3 text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm disabled:opacity-50"
              />
            </div>
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.password[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-stone-300">
              Confirm New Password
            </label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isPending}
                className="block w-full rounded-lg border border-stone-700 bg-stone-950/80 py-2.5 pl-10 pr-3 text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm disabled:opacity-50"
              />
            </div>
            {fieldErrors.confirmPassword && (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.confirmPassword[0]}</p>
            )}
          </div>

          {/* Strength validation checklist */}
          <div className="grid grid-cols-2 gap-1.5 text-[11px] text-stone-400 bg-stone-950/50 p-3 rounded-lg border border-stone-800">
            <span className={rules.length ? 'text-emerald-400 flex items-center gap-1' : 'text-stone-500'}>
              {rules.length ? <CheckCircle2 className="h-3 w-3" /> : '•'} 8+ characters
            </span>
            <span className={rules.upper ? 'text-emerald-400 flex items-center gap-1' : 'text-stone-500'}>
              {rules.upper ? <CheckCircle2 className="h-3 w-3" /> : '•'} 1 uppercase
            </span>
            <span className={rules.lower ? 'text-emerald-400 flex items-center gap-1' : 'text-stone-500'}>
              {rules.lower ? <CheckCircle2 className="h-3 w-3" /> : '•'} 1 lowercase
            </span>
            <span className={rules.number ? 'text-emerald-400 flex items-center gap-1' : 'text-stone-500'}>
              {rules.number ? <CheckCircle2 className="h-3 w-3" /> : '•'} 1 number
            </span>
            <span className={rules.special ? 'text-emerald-400 flex items-center gap-1' : 'text-stone-500'}>
              {rules.special ? <CheckCircle2 className="h-3 w-3" /> : '•'} 1 special char
            </span>
            <span className={rules.match ? 'text-emerald-400 flex items-center gap-1' : 'text-stone-500'}>
              {rules.match ? <CheckCircle2 className="h-3 w-3" /> : '•'} Passwords match
            </span>
          </div>

          <button
            type="submit"
            disabled={isPending || !rules.match}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-900/20 hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-stone-900 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Updating password...</span>
              </>
            ) : (
              <>
                <span>Update Password</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
