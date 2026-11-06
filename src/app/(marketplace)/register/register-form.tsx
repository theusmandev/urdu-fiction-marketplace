'use client';

import React, { useState, useTransition, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, User, AtSign, AlertCircle, CheckCircle2, ArrowRight, Loader2, Eye, EyeOff, Info } from 'lucide-react';
import { registerUser, checkUsernameAvailability } from '@/app/actions/auth';
import { usernameRegex } from '@/lib/auth/schemas';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { UrduText } from '@/components/urdu/UrduText';

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
  const [showPassword, setShowPassword] = useState(false);

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
      const trimmedEmail = email.trim();
      const result = await registerUser(formData);

      if (!result.success) {
        setError(result.error || 'Failed to register account.');
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else if (result.message) {
        try {
          if (trimmedEmail) {
            localStorage.setItem('unb_last_auth_email', trimmedEmail);
          }
        } catch {}
        setSuccessMessage(result.message);
      } else if (result.redirectTo) {
        try {
          if (trimmedEmail) {
            localStorage.setItem('unb_last_auth_email', trimmedEmail);
          }
        } catch {}
        router.push(result.redirectTo);
        router.refresh();
      }
    });
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-3 py-8 sm:px-6 sm:py-12 lg:px-8 bg-ivory text-main">
      <div className="w-full max-w-md space-y-6 sm:space-y-8 rounded-2xl border border-border bg-surface p-5 sm:p-8 shadow-card">
        <div className="text-center">
          <Link href="/" className="inline-block hover:opacity-95 transition-opacity" aria-label="UNB Premium — home">
            <BrandLogo variant="full" size={88} className="mx-auto" />
          </Link>
          <h1 className="mt-5 text-2xl font-bold font-serif tracking-tight text-navy">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-secondary">
            Already have an account?{' '}
            <Link
              href={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : '/login'}
              className="font-semibold text-accent hover:text-accent-dark transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        {successMessage ? (
          <div className="rounded-2xl border border-success-border bg-success-soft p-6 sm:p-7 text-center space-y-5 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-success/15 border border-success-border/60 text-success flex items-center justify-center mx-auto shadow-2xs">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            {/* English Confirmation Header */}
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold font-serif text-success-text">
                Verification Email Sent
              </h2>
              <p className="text-sm text-success-text leading-relaxed max-w-md mx-auto">
                {successMessage}
              </p>
            </div>

            {/* Prominent Urdu Guidance Box */}
            <div className="rounded-xl bg-surface/90 border border-success-border/60 p-4 sm:p-5 text-center space-y-3.5 shadow-2xs">
              <UrduText
                as="h3"
                size="lg"
                className="font-bold text-success-text py-0 leading-[2.2]"
              >
                تصدیقی ای میل بھیج دی گئی ہے!
              </UrduText>

              <UrduText
                as="p"
                size="sm"
                className="text-text font-normal leading-[2.2] py-0 max-w-md mx-auto"
              >
                آپ کا اکاؤنٹ بن گیا ہے! لاگ اِن کرنے سے پہلے براہِ کرم اپنی ای میل (Gmail / Inbox) کھولیں اور ہماری بھیجی گئی ای میل میں موجود تصدیقی لنک پر کلک کر کے اپنا اکاؤنٹ ایکٹیویٹ کریں۔
              </UrduText>

              <div
                dir="rtl"
                className="rounded-lg bg-success-soft/80 border border-success-border/60 px-3.5 py-2.5 text-right flex items-start gap-2.5"
              >
                <Info className="w-4 h-4 text-success shrink-0 mt-1" />
                <UrduText
                  as="p"
                  size="xs"
                  className="text-success-text font-medium leading-[2.0] py-0 flex-1"
                >
                  نوٹ: اگر ای میل سامنے نظر نہ آئے تو اپنا Spam یا Promotions فولڈر ضرور چیک کریں۔
                </UrduText>
              </div>
            </div>

            {/* Action CTA Button */}
            <div className="pt-1">
              <Link
                href={
                  email.trim()
                    ? `/login?email=${encodeURIComponent(email.trim())}${nextParam ? `&next=${encodeURIComponent(nextParam)}` : ''}`
                    : nextParam
                    ? `/login?next=${encodeURIComponent(nextParam)}`
                    : '/login'
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-success px-5 py-2.5 text-sm font-semibold text-white hover:bg-success-hover transition-colors shadow-sm min-h-[44px]"
              >
                <span>Proceed to Sign in / <span className="font-urdu">لاگ اِن کریں</span></span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl bg-danger-soft border border-danger-border p-4 flex items-start gap-3 text-danger-text text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 text-danger-text mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {/* Full Name */}
              <div>
                <label htmlFor="fullName" className="block text-sm font-semibold text-secondary">
                  Full Name
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ahmed Khan"
                    disabled={isPending}
                    className="block w-full rounded-xl border border-border bg-surface-muted py-2.5 pl-10 pr-3 text-navy placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring text-base sm:text-sm min-h-[44px] disabled:opacity-50 transition-colors"
                  />
                </div>
                {fieldErrors.fullName && (
                  <p className="mt-1 text-xs text-danger-text">{fieldErrors.fullName[0]}</p>
                )}
              </div>

              {/* Username with Realtime Availability */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="username" className="block text-sm font-semibold text-secondary">
                    Username
                  </label>
                  {usernameChecking && (
                    <span className="text-xs text-accent flex items-center gap-1 font-medium">
                      <Loader2 className="h-3 w-3 animate-spin" /> Checking...
                    </span>
                  )}
                  {!usernameChecking && usernameStatus === 'available' && (
                    <span className="text-xs text-success flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="h-3 w-3" /> Available
                    </span>
                  )}
                  {!usernameChecking && usernameStatus === 'taken' && (
                    <span className="text-xs text-danger-text flex items-center gap-1 font-semibold">
                      <AlertCircle className="h-3 w-3" /> Unavailable
                    </span>
                  )}
                  {!usernameChecking && usernameStatus === 'invalid' && (
                    <span className="text-xs text-warning-text">Lowercase letters, numbers, _</span>
                  )}
                </div>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
                    <AtSign className="h-4 w-4" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="nickname"
                    required
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.toLowerCase());
                      setUsernameStatus('idle');
                    }}
                    onBlur={handleUsernameBlur}
                    placeholder="ahmed_khan"
                    disabled={isPending}
                    className="block w-full rounded-xl border border-border bg-surface-muted py-2.5 pl-10 pr-3 text-navy placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring text-base sm:text-sm min-h-[44px] disabled:opacity-50 transition-colors"
                  />
                </div>
                {fieldErrors.username && (
                  <p className="mt-1 text-xs text-danger-text">{fieldErrors.username[0]}</p>
                )}
              </div>

              {/* Email */}
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
                    autoComplete="username email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    disabled={isPending}
                    className="block w-full rounded-xl border border-border bg-surface-muted py-2.5 pl-10 pr-3 text-navy placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring text-base sm:text-sm min-h-[44px] disabled:opacity-50 transition-colors"
                  />
                </div>
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-danger-text">{fieldErrors.email[0]}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-secondary">
                  Password
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isPending}
                    className="block w-full rounded-xl border border-border bg-surface-muted py-2.5 pl-10 pr-10 text-navy placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring text-base sm:text-sm min-h-[44px] disabled:opacity-50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-secondary hover:text-navy focus:outline-none transition-colors cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>

                {/* Password strength visual guidelines */}
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-secondary bg-surface-muted p-2.5 rounded-xl border border-border">
                  <span className={rules.length ? 'text-success-text font-semibold' : 'text-muted'}>
                    ✓ At least 8 characters
                  </span>
                  <span className={rules.upper ? 'text-success-text font-semibold' : 'text-muted'}>
                    ✓ 1 uppercase letter
                  </span>
                  <span className={rules.lower ? 'text-success-text font-semibold' : 'text-muted'}>
                    ✓ 1 lowercase letter
                  </span>
                  <span className={rules.number ? 'text-success-text font-semibold' : 'text-muted'}>
                    ✓ 1 number
                  </span>
                  <span className={`col-span-2 ${rules.special ? 'text-success-text font-semibold' : 'text-muted'}`}>
                    ✓ 1 special character (!@#$%^&*)
                  </span>
                </div>

                {fieldErrors.password && (
                  <p className="mt-1 text-xs text-danger-text">{fieldErrors.password[0]}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isPending || usernameStatus === 'taken'}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-navy shadow-sm hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-all cursor-pointer min-h-[44px]"
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
