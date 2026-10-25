'use client';

import React, { useState, useTransition, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, User, AtSign, AlertCircle, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { registerUser, checkUsernameAvailability } from '@/app/actions/auth';
import { usernameRegex } from '@/lib/auth/schemas';

export interface RegisterFormProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export function RegisterForm({ searchParams }: RegisterFormProps) {
  const resolvedParams = use(searchParams);
  const router = useRouter();
  const nextParam = typeof resolvedParams.next === 'string' ? resolvedParams.next : null;

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'available' | 'taken' | 'invalid'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Real-time password strength rules
  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const handleUsernameBlur = async () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) {
      setUsernameStatus('idle');
      return;
    }

    if (!usernameRegex.test(trimmed)) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameChecking(true);
    try {
      const res = await checkUsernameAvailability(trimmed);
      setUsernameStatus(res.available ? 'available' : 'taken');
    } catch {
      setUsernameStatus('idle');
    } finally {
      setUsernameChecking(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('username', username);
    formData.append('email', email);
    formData.append('password', password);

    startTransition(async () => {
      const result = await registerUser(formData);

      if (!result.success) {
        setError(result.error || 'Failed to register account.');
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else if (result.message) {
        setSuccessMessage(result.message);
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
            <span className="font-urdu text-4xl tracking-tight text-amber-500">
              یو این بی پریمیم
            </span>
            <span className="block text-xs uppercase tracking-widest text-stone-400 font-sans mt-0.5">
              UNB Premium
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-stone-400">
            Already have an account?{' '}
            <Link
              href={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : '/login'}
              className="font-medium text-amber-500 hover:text-amber-400 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        {successMessage ? (
          <div className="rounded-xl border border-emerald-800/80 bg-emerald-950/60 p-6 text-center space-y-4">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Verification Email Sent</h2>
            <p className="text-sm text-emerald-200/90 leading-relaxed">
              {successMessage}
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <span>Proceed to Sign in</span>
                <ArrowRight className="h-4 w-4" />
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
              {/* Full Name */}
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-stone-300">
                  Full Name
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-500">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ahmed Khan"
                    disabled={isPending}
                    className="block w-full rounded-lg border border-stone-700 bg-stone-950/80 py-2.5 pl-10 pr-3 text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm disabled:opacity-50"
                  />
                </div>
                {fieldErrors.fullName && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.fullName[0]}</p>
                )}
              </div>

              {/* Username with Realtime Availability */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="username" className="block text-sm font-medium text-stone-300">
                    Username
                  </label>
                  {usernameChecking && (
                    <span className="text-xs text-amber-400 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Checking...
                    </span>
                  )}
                  {!usernameChecking && usernameStatus === 'available' && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Available
                    </span>
                  )}
                  {!usernameChecking && usernameStatus === 'taken' && (
                    <span className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Unavailable
                    </span>
                  )}
                  {!usernameChecking && usernameStatus === 'invalid' && (
                    <span className="text-xs text-amber-400">Lowercase letters, numbers, _</span>
                  )}
                </div>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-500">
                    <AtSign className="h-4 w-4" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.toLowerCase());
                      setUsernameStatus('idle');
                    }}
                    onBlur={handleUsernameBlur}
                    placeholder="ahmed_khan"
                    disabled={isPending}
                    className="block w-full rounded-lg border border-stone-700 bg-stone-950/80 py-2.5 pl-10 pr-3 text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm disabled:opacity-50"
                  />
                </div>
                {fieldErrors.username && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.username[0]}</p>
                )}
              </div>

              {/* Email */}
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
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.email[0]}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-stone-300">
                  Password
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

                {/* Password strength visual guidelines */}
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-stone-400 bg-stone-950/50 p-2.5 rounded-lg border border-stone-800">
                  <span className={rules.length ? 'text-emerald-400' : 'text-stone-500'}>
                    ✓ At least 8 characters
                  </span>
                  <span className={rules.upper ? 'text-emerald-400' : 'text-stone-500'}>
                    ✓ 1 uppercase letter
                  </span>
                  <span className={rules.lower ? 'text-emerald-400' : 'text-stone-500'}>
                    ✓ 1 lowercase letter
                  </span>
                  <span className={rules.number ? 'text-emerald-400' : 'text-stone-500'}>
                    ✓ 1 number
                  </span>
                  <span className={`col-span-2 ${rules.special ? 'text-emerald-400' : 'text-stone-500'}`}>
                    ✓ 1 special character (!@#$%^&*)
                  </span>
                </div>

                {fieldErrors.password && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.password[0]}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isPending || usernameStatus === 'taken'}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-900/20 hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-stone-900 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
