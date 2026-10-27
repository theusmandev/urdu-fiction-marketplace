'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Heart,
  Sparkles,
  HelpCircle,
  AlertCircle,
  Loader2,
  X,
  RotateCw,
  ArrowRight,
  Info,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { UrduText } from '@/components/urdu/UrduText';
import { HowTipsWorkModal } from './HowTipsWorkModal';
import { TIP_CARD_COPY, PRESET_LABELS, HOW_TIPS_WORK } from '@/lib/copy/tips';
import { validateTipAmount, validateTipMessage } from '@/lib/tips/validation';
import { resolveTipCardState, type TipCardState } from '@/lib/tips/state';
import type { TipOptionsPayload } from '@/types/database';

interface TipCardProps {
  writerId?: string | null;
  novelId?: string | null;
  chapterId?: string | null;
  className?: string;
  isModal?: boolean;
  onClose?: () => void;
  onTipCreated?: (tipNumber: string) => void;
}

export function TipCard({
  writerId = null,
  novelId = null,
  chapterId = null,
  className = '',
  isModal = false,
  onClose,
  onTipCreated,
}: TipCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [cardState, setCardState] = useState<TipCardState>({ status: 'loading' });

  // Form state
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [readerMessage, setReaderMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!isMounted) return;

        const currentUserId = session?.user?.id || null;
        const userRole =
          session?.user?.user_metadata?.role ||
          session?.user?.app_metadata?.role ||
          (session?.user ? 'reader' : null);

        const { data, error } = await supabase.rpc('get_tip_options', {
          p_writer_id: writerId || null,
          p_novel_id: novelId || null,
          p_chapter_id: chapterId || null,
        });

        if (!isMounted) return;

        if (error) {
          console.error('[TipCard:get_tip_options]', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
        }

        const payload = data as unknown as TipOptionsPayload | null;

        const resolved = resolveTipCardState({
          isUserSignedIn: Boolean(session?.user),
          currentUserId,
          userRole,
          targetWriterId: writerId || payload?.writer_id || null,
          payload,
          queryError: error ? { code: error.code, message: error.message } : null,
          currentPath: pathname || '/tips/new',
        });

        setCardState(resolved);
        setLoading(false);

        if (resolved.status === 'ready') {
          const presets = resolved.options.preset_amounts || [100, 250, 500];
          setSelectedAmount((prev) => (prev ? prev : presets[0] || 100));

          if (resolved.options.payment_methods && resolved.options.payment_methods.length > 0) {
            setSelectedMethodId((prev) => (prev ? prev : resolved.options.payment_methods![0].id));
          }
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        console.error('[TipCard:loadTipOptions] Unexpected error:', err);
        const msg = err instanceof Error ? err.message : 'Failed to connect to platform';
        setCardState({
          status: 'error',
          message: msg,
          messageUrdu: 'سرور سے رابطہ قائم نہیں ہو سکا۔ برائے مہربانی دوبارہ کوشش کریں۔',
        });
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [writerId, novelId, chapterId, pathname, refreshKey]);

  const handleRetry = () => {
    setLoading(true);
    setErrorMessage(null);
    setRefreshKey((k) => k + 1);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div
        className={`w-full max-w-xl mx-auto rounded-2xl border border-amber-200/40 dark:border-amber-900/30 bg-amber-50/20 dark:bg-amber-950/10 p-6 animate-pulse min-h-[160px] ${className}`}
        aria-hidden="true"
      >
        <div className="h-5 bg-amber-200/40 dark:bg-amber-800/20 rounded w-1/3 mb-4" />
        <div className="h-4 bg-amber-200/30 dark:bg-amber-800/10 rounded w-2/3 mb-6" />
        <div className="flex gap-2">
          <div className="h-10 bg-amber-200/40 dark:bg-amber-800/20 rounded-xl w-24" />
          <div className="h-10 bg-amber-200/40 dark:bg-amber-800/20 rounded-xl w-24" />
          <div className="h-10 bg-amber-200/40 dark:bg-amber-800/20 rounded-xl w-24" />
        </div>
      </div>
    );
  }

  // Author viewing own profile/novel
  if (cardState.status === 'author_own_profile') {
    return (
      <div
        className={`w-full max-w-xl mx-auto rounded-2xl border border-amber-300/60 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 p-5 sm:p-6 shadow-xs text-main space-y-3 ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold text-sm">
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Author View • مصنف کا منظر</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-secondary hover:text-main min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-secondary leading-relaxed">{cardState.message}</p>
        <UrduText as="p" size="xs" className="text-secondary/90 py-0">
          {cardState.messageUrdu}
        </UrduText>
        <div className="pt-1">
          <Link
            href={cardState.settingsHref}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold transition-colors min-h-[44px]"
          >
            <span>Open Tip Settings</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // Admin browsing as admin
  if (cardState.status === 'admin_hidden') {
    return (
      <div
        className={`w-full max-w-xl mx-auto rounded-2xl border border-border/80 bg-surface p-4 text-xs text-secondary flex items-center justify-between ${className}`}
      >
        <span>{cardState.message}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-secondary hover:text-main min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // Sign in required
  if (cardState.status === 'sign_in_required') {
    return (
      <div
        className={`w-full max-w-xl mx-auto rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-[#fdfbf7] dark:bg-[#1a1714] p-6 shadow-xs text-main space-y-4 text-center ${className}`}
      >
        {onClose && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-secondary hover:text-main min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="w-12 h-12 rounded-2xl bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 flex items-center justify-center mx-auto shadow-xs">
          <Heart className="w-6 h-6 fill-amber-600/30" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-base text-main">{TIP_CARD_COPY.title}</h3>
          <p className="text-xs text-secondary">{cardState.message}</p>
          <UrduText as="p" size="xs" className="text-secondary/90 py-0">
            {cardState.messageUrdu}
          </UrduText>
        </div>
        <Link
          href={cardState.loginUrl}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold transition-colors min-h-[44px] shadow-xs"
        >
          <span>Sign In to Say Thanks</span>
          <span className="font-urdu text-sm py-0">لاگ ان کریں</span>
        </Link>
      </div>
    );
  }

  // Informational business state (disabled by writer, platform paused, ineligible, limit reached)
  if (
    cardState.status === 'disabled_by_writer' ||
    cardState.status === 'kill_switch_active' ||
    cardState.status === 'writer_ineligible' ||
    cardState.status === 'no_payment_methods' ||
    cardState.status === 'rate_limited' ||
    cardState.status === 'daily_cap_exceeded'
  ) {
    return (
      <div
        className={`w-full max-w-xl mx-auto rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-[#fdfbf7] dark:bg-[#1a1714] p-5 sm:p-6 shadow-xs text-main space-y-3 ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold text-sm">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Notice • اطلاع</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-secondary hover:text-main min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-secondary leading-relaxed">{cardState.message}</p>
        <UrduText as="p" size="xs" className="text-secondary/90 py-0">
          {cardState.messageUrdu}
        </UrduText>
      </div>
    );
  }

  // Query/Network error with retry button
  if (cardState.status === 'error') {
    return (
      <div
        className={`w-full max-w-xl mx-auto rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 p-5 sm:p-6 shadow-xs text-main space-y-3 ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200 font-semibold text-sm">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>Unable to Load • خرابی</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-secondary hover:text-main min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">{cardState.message}</p>
        <UrduText as="p" size="xs" className="text-rose-800/80 dark:text-rose-300/80 py-0">
          {cardState.messageUrdu}
        </UrduText>
        <div className="pt-2">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface border border-rose-300 hover:bg-rose-50 text-rose-900 dark:text-rose-200 text-xs font-semibold transition-colors min-h-[44px] cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Try Again • دوبارہ کوشش کریں</span>
          </button>
        </div>
      </div>
    );
  }

  // Ready State: Interactive Tip Form
  if (cardState.status !== 'ready') {
    return null;
  }

  const options = cardState.options;
  const minAmount = options.min_amount_pkr ?? 20;
  const maxAmount = options.max_amount_pkr ?? 5000;
  const presets: number[] = options.preset_amounts || [100, 250, 500];

  const handleSelectPreset = (amount: number) => {
    setIsCustom(false);
    setSelectedAmount(amount);
    setCustomInput('');
    setErrorMessage(null);
  };

  const handleSelectCustom = () => {
    setIsCustom(true);
    setSelectedAmount(null);
    setErrorMessage(null);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setCustomInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      setSelectedAmount(num);
    } else {
      setSelectedAmount(null);
    }
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const effectiveAmount = isCustom ? parseInt(customInput, 10) : selectedAmount;

    if (!effectiveAmount) {
      setErrorMessage(TIP_CARD_COPY.errors.amountRequired);
      return;
    }

    const amountValidation = validateTipAmount(effectiveAmount, minAmount, maxAmount);
    if (!amountValidation.valid) {
      setErrorMessage(amountValidation.error || TIP_CARD_COPY.errors.amountRequired);
      return;
    }

    if (!selectedMethodId) {
      setErrorMessage('Please select a payment method.');
      return;
    }

    const messageValidation = validateTipMessage(readerMessage);
    if (!messageValidation.valid) {
      setErrorMessage(messageValidation.error || 'Invalid message length.');
      return;
    }

    setIsSubmitting(true);

    try {
      const targetWriterId = writerId || options.writer_id;
      if (!targetWriterId) {
        setErrorMessage('Writer could not be identified.');
        setIsSubmitting(false);
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase.rpc('create_tip', {
        p_writer_id: targetWriterId,
        p_amount_pkr: effectiveAmount,
        p_payment_method_id: selectedMethodId,
        p_novel_id: novelId || null,
        p_chapter_id: chapterId || null,
        p_message: readerMessage.trim() || null,
        p_is_anonymous: isAnonymous,
      });

      if (error) {
        console.error('[TipCard:create_tip]', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        setErrorMessage(error.message || TIP_CARD_COPY.errors.failedToCreate);
        setIsSubmitting(false);
        return;
      }

      const res = data as unknown as { success: boolean; tip_number?: string; error?: string };
      if (!res || !res.tip_number) {
        setErrorMessage(res?.error || TIP_CARD_COPY.errors.failedToCreate);
        setIsSubmitting(false);
        return;
      }

      if (onTipCreated) {
        onTipCreated(res.tip_number);
      } else {
        router.push(`/tips/${res.tip_number}`);
      }
    } catch (err: unknown) {
      console.error('[TipCard:submitTip] Unexpected error:', err);
      const msg = err instanceof Error ? err.message : TIP_CARD_COPY.errors.failedToCreate;
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  const paddingClasses = isModal ? 'p-4 sm:p-5' : 'p-5 sm:p-7';

  return (
    <>
      <div
        className={`w-full max-w-xl mx-auto rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-[#fdfbf7] dark:bg-[#1a1714] ${paddingClasses} shadow-xs text-main transition-all ${className}`}
        id="tip-card"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-xs">
              <Heart className="w-5 h-5 fill-amber-600/30 dark:fill-amber-400/30" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h3 className="font-semibold text-base sm:text-lg text-main">
                  {TIP_CARD_COPY.title}
                </h3>
                <UrduText as="span" size="sm" className="text-secondary py-0">
                  {TIP_CARD_COPY.titleUrdu}
                </UrduText>
              </div>
              <UrduText as="p" size="xs" className="text-secondary/90 py-0">
                {TIP_CARD_COPY.taglineUrdu}
              </UrduText>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1 text-xs text-secondary hover:text-main transition-colors py-1 px-2 rounded-lg hover:bg-amber-100/40 dark:hover:bg-amber-900/20 min-h-[44px]"
              title={HOW_TIPS_WORK.title}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">How it works</span>
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-secondary hover:text-main min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Preset Buttons */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-2">
              Select appreciation amount (PKR)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {presets.map((preset: number) => {
                const meta = PRESET_LABELS[preset as keyof typeof PRESET_LABELS];
                const isSelected = !isCustom && selectedAmount === preset;

                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border text-center transition-all min-h-[54px] ${
                      isSelected
                        ? 'border-amber-500 bg-amber-100/60 dark:bg-amber-900/40 text-amber-950 dark:text-amber-100 font-semibold shadow-xs'
                        : 'border-border/60 bg-surface/70 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 text-main'
                    }`}
                  >
                    <span className="text-xs font-medium">{meta?.name || 'Tip'}</span>
                    <span className="text-sm font-semibold">PKR {preset}</span>
                    {meta?.nameUrdu && (
                      <UrduText as="span" size="xs" className="text-[10px] text-secondary py-0">
                        {meta.nameUrdu}
                      </UrduText>
                    )}
                  </button>
                );
              })}

              {/* Custom amount chip */}
              <button
                type="button"
                onClick={handleSelectCustom}
                className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border text-center transition-all min-h-[54px] ${
                  isCustom
                    ? 'border-amber-500 bg-amber-100/60 dark:bg-amber-900/40 text-amber-950 dark:text-amber-100 font-semibold shadow-xs'
                    : 'border-border/60 bg-surface/70 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 text-main'
                }`}
              >
                <span className="text-xs font-medium">{TIP_CARD_COPY.customLabel}</span>
                <span className="text-xs text-secondary font-mono">Other</span>
                <UrduText as="span" size="xs" className="text-[10px] text-secondary py-0">
                  {TIP_CARD_COPY.customLabelUrdu}
                </UrduText>
              </button>
            </div>

            {/* Custom Amount Input Field */}
            {isCustom && (
              <div className="mt-3 p-3 rounded-xl bg-surface/80 border border-amber-300/80 dark:border-amber-800/80 space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-xs text-secondary">
                  <span>Enter amount</span>
                  <span>
                    Min: {minAmount} • Max: {maxAmount} PKR
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-secondary font-mono">
                    PKR
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={customInput}
                    onChange={handleCustomChange}
                    placeholder={`e.g. ${presets[0] || 100}`}
                    className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-border bg-surface text-main font-semibold text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/30"
                    autoFocus
                  />
                </div>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-2">
              Pay directly to author via
            </label>
            <div className="space-y-2">
              {options.payment_methods?.map((pm: NonNullable<TipOptionsPayload['payment_methods']>[number]) => {
                const isSelected = selectedMethodId === pm.id;
                return (
                  <label
                    key={pm.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 text-main'
                        : 'border-border/60 bg-surface/70 hover:bg-amber-50/30 text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment_method"
                        value={pm.id}
                        checked={isSelected}
                        onChange={() => setSelectedMethodId(pm.id)}
                        className="text-amber-600 focus:ring-amber-500/30"
                      />
                      <div>
                        <span className="text-xs font-semibold capitalize text-main">
                          {pm.bank_name || pm.method_type.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-secondary ml-2 font-mono">
                          {pm.masked_label}
                        </span>
                        {pm.instructions_note && (
                          <span className="block text-[11px] text-secondary mt-0.5">
                            {pm.instructions_note}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Reader Message (Optional Note) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-secondary">
                Optional note of encouragement
              </label>
              <span className="text-[11px] text-secondary font-mono">
                {readerMessage.length} / 300
              </span>
            </div>
            <textarea
              dir="auto"
              value={readerMessage}
              onChange={(e) => setReaderMessage(e.target.value.slice(0, 300))}
              placeholder="Add a warm word of appreciation... / مصنف کے لیے حوصلہ افزا پیغام لکھیں"
              rows={2}
              className="w-full p-3 rounded-xl border border-border/60 bg-surface/70 text-sm font-urdu leading-[2.2] text-start focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 resize-none"
            />
          </div>

          {/* Anonymous Option */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none min-h-[44px]">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-4 h-4 rounded border-border text-amber-600 focus:ring-amber-500/30"
            />
            <span className="text-xs text-secondary">
              {TIP_CARD_COPY.anonymousOption}
            </span>
          </label>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Honest Disclosure Line */}
          <div className="p-3 rounded-xl bg-amber-100/40 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/20 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs text-amber-950 dark:text-amber-200 font-medium">
                {TIP_CARD_COPY.honestLine}
              </p>
              <UrduText as="p" size="xs" className="text-[11px] text-amber-900/80 dark:text-amber-300/80 py-0">
                {TIP_CARD_COPY.honestLineUrdu}
              </UrduText>
            </div>
          </div>

          {/* Action Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-6 rounded-xl bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 text-white font-medium transition-colors flex items-center justify-center gap-2 min-h-[48px] shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Preparing instructions...</span>
              </>
            ) : (
              <>
                <span>{TIP_CARD_COPY.continueButton}</span>
                <span className="text-white/60"> • </span>
                <span className="font-urdu text-sm py-0 inline">
                  {TIP_CARD_COPY.continueButtonUrdu}
                </span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* How Tips Work Modal */}
      <HowTipsWorkModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
