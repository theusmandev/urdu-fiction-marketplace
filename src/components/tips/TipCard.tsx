'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Heart,
  HelpCircle,
  AlertCircle,
  Loader2,
  X,
  RotateCw,
  ArrowRight,
  Info,
  Coffee,
  CupSoda,
  Gift,
  SlidersHorizontal,
  CreditCard,
  PenLine,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { HowTipsWorkModal } from './HowTipsWorkModal';
import { TIP_CARD_COPY, PRESET_LABELS, HOW_TIPS_WORK } from '@/lib/copy/tips';
import { validateTipAmount, validateTipMessage } from '@/lib/tips/validation';
import {
  resolveTipCardState,
  formatPaymentMethodLabel,
  type TipCardState,
} from '@/lib/tips/state';
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
  const [isNoteExpanded, setIsNoteExpanded] = useState(false);
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
        data-reader-ui="true"
        className={`w-full max-w-xl mx-auto rounded-2xl border border-border/70 bg-surface/80 p-5 sm:p-6 animate-pulse min-h-[160px] reader-ui-chrome ${className}`}
        aria-hidden="true"
      >
        <div className="h-4 bg-surface-muted/60 rounded w-1/3 mb-4" />
        <div className="h-3 bg-surface-muted/40 rounded w-2/3 mb-5" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-11 bg-surface-muted/50 rounded-xl" />
          <div className="h-11 bg-surface-muted/50 rounded-xl" />
        </div>
      </div>
    );
  }

  // Author viewing own profile/novel
  if (cardState.status === 'author_own_profile') {
    return (
      <div
        data-reader-ui="true"
        className={`w-full max-w-xl mx-auto rounded-2xl border border-warning-border/60 bg-warning-soft/30 p-4 sm:p-5 shadow-xs text-text space-y-2.5 reader-ui-chrome ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-warning-text font-semibold text-xs sm:text-sm">
            <ShieldCheck className="w-4 h-4 text-accent-strong shrink-0" />
            <span>Author View • مصنف کا منظر</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-text-muted hover:text-text min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-text-muted leading-relaxed">{cardState.message}</p>
        <p dir="rtl" lang="ur" className="text-xs text-text-muted font-urdu leading-normal">
          {cardState.messageUrdu}
        </p>
        <div className="pt-1">
          <Link
            href={cardState.settingsHref}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition-colors min-h-[44px]"
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
        data-reader-ui="true"
        className={`w-full max-w-xl mx-auto rounded-2xl border border-border/80 bg-surface/80 p-4 text-xs text-text-muted flex items-center justify-between reader-ui-chrome ${className}`}
      >
        <span>{cardState.message}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
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
        data-reader-ui="true"
        className={`w-full max-w-xl mx-auto rounded-2xl border border-border/80 bg-surface/85 backdrop-blur-xs p-5 sm:p-6 shadow-xs text-text space-y-3.5 text-center reader-ui-chrome ${className}`}
      >
        {onClose && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-text-muted hover:text-text min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent-strong flex items-center justify-center mx-auto shadow-xs">
          <Heart className="w-4.5 h-4.5 fill-accent-strong/20" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2">
            <h3 className="font-semibold text-sm sm:text-base text-text">{TIP_CARD_COPY.title}</h3>
            <span className="text-border-subtle">•</span>
            <span dir="rtl" lang="ur" className="font-urdu text-xs text-text-muted">
              مصنف کو شکریہ کہیں
            </span>
          </div>
          <p className="text-xs text-text-muted">{cardState.message}</p>
        </div>
        <Link
          href={cardState.loginUrl}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition-colors min-h-[44px] shadow-xs cursor-pointer"
        >
          <span>Sign In to Say Thanks</span>
          <span className="text-white/60">•</span>
          <span dir="rtl" lang="ur" className="font-urdu text-xs">لاگ ان کریں</span>
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
        data-reader-ui="true"
        className={`w-full max-w-xl mx-auto rounded-2xl border border-border/80 bg-surface/85 backdrop-blur-xs p-4 sm:p-5 shadow-xs text-text space-y-2 reader-ui-chrome ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-accent-strong font-semibold text-xs sm:text-sm">
            <Info className="w-4 h-4 shrink-0" />
            <span>Notice • اطلاع</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-text-muted hover:text-text min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-text-muted leading-relaxed">{cardState.message}</p>
        <p dir="rtl" lang="ur" className="text-xs text-text-muted font-urdu leading-normal">
          {cardState.messageUrdu}
        </p>
      </div>
    );
  }

  // Query/Network error with retry button
  if (cardState.status === 'error') {
    return (
      <div
        data-reader-ui="true"
        className={`w-full max-w-xl mx-auto rounded-2xl border border-danger-border bg-danger-soft/40 p-4 sm:p-5 shadow-xs text-text space-y-2 reader-ui-chrome ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-danger-text font-semibold text-xs sm:text-sm">
            <AlertCircle className="w-4 h-4 text-danger-text shrink-0" />
            <span>Unable to Load • خرابی</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-text-muted hover:text-text min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-danger-text leading-relaxed">{cardState.message}</p>
        <div className="pt-1">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface border border-danger-border hover:bg-danger-soft text-danger-text text-xs font-semibold transition-colors min-h-[40px] cursor-pointer"
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

  const effectiveAmount = isCustom ? parseInt(customInput, 10) : selectedAmount;
  const hasValidAmount = typeof effectiveAmount === 'number' && !isNaN(effectiveAmount) && effectiveAmount > 0;
  const ctaLabel = hasValidAmount && effectiveAmount != null
    ? `Continue · PKR ${effectiveAmount.toLocaleString()}`
    : TIP_CARD_COPY.continueButton;

  const paymentMethods = options.payment_methods || [];
  const formattedMethods = paymentMethods.map((pm) => formatPaymentMethodLabel(pm));

  const paddingClasses = isModal ? 'p-4 sm:p-5' : 'p-4 sm:p-6';

  return (
    <>
      <div
        data-reader-ui="true"
        className={`w-full max-w-xl mx-auto min-w-0 rounded-2xl border border-border/80 bg-surface/85 backdrop-blur-xs ${paddingClasses} shadow-xs text-text transition-all reader-ui-chrome ${className}`}
        id="tip-card"
      >
        {/* 1. Clean, Airy Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-accent-soft text-accent-strong flex items-center justify-center shrink-0 shadow-xs">
              <Heart className="w-4 h-4 fill-accent-strong/20" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm sm:text-base text-text tracking-tight">
                  {TIP_CARD_COPY.title}
                </h3>
                <span className="text-border-subtle select-none hidden xs:inline" aria-hidden="true">•</span>
                <span dir="rtl" lang="ur" className="font-urdu text-xs text-text-muted">
                  مصنف کو شکریہ کہیں
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-text-muted leading-tight mt-0.5">
                Support the author directly
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted/60 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              title={HOW_TIPS_WORK.title}
              aria-label="How appreciation works"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-text-muted hover:text-text min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* 2. Sleek 2x2 Amount Preset Grid */}
          <div>
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
              {presets.slice(0, 3).map((preset: number, idx: number) => {
                const isSelected = !isCustom && selectedAmount === preset;
                const icons = [Coffee, CupSoda, Gift];
                const IconComponent = icons[idx % icons.length] || Coffee;
                const sublabels: Record<number, string> = {
                  100: 'Chai · چائے',
                  250: 'Coffee · کافی',
                  500: 'Tohfa · تحفہ',
                };
                const sublabel =
                  sublabels[preset] ||
                  (PRESET_LABELS[preset as keyof typeof PRESET_LABELS]
                    ? `${PRESET_LABELS[preset as keyof typeof PRESET_LABELS].name} · ${PRESET_LABELS[preset as keyof typeof PRESET_LABELS].nameUrdu}`
                    : 'Gift · تحفہ');

                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`flex items-center gap-2.5 p-2 sm:p-2.5 rounded-xl border text-start transition-all cursor-pointer min-h-[46px] ${
                      isSelected
                        ? 'border-accent-strong bg-accent-soft/40 text-text shadow-xs font-semibold'
                        : 'border-border/70 bg-surface/60 hover:bg-surface-muted/60 hover:border-border text-text-muted hover:text-text'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'bg-accent-strong text-white' : 'bg-surface-muted text-text-muted'
                      }`}
                    >
                      <IconComponent className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-semibold text-text leading-tight">
                        PKR {preset}
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-text-muted truncate mt-0.5 font-medium">
                        {sublabel}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Custom amount chip */}
              <button
                type="button"
                onClick={handleSelectCustom}
                className={`flex items-center gap-2.5 p-2 sm:p-2.5 rounded-xl border text-start transition-all cursor-pointer min-h-[46px] ${
                  isCustom
                    ? 'border-accent-strong bg-accent-soft/40 text-text shadow-xs font-semibold'
                    : 'border-border/70 bg-surface/60 hover:bg-surface-muted/60 hover:border-border text-text-muted hover:text-text'
                }`}
              >
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isCustom ? 'bg-accent-strong text-white' : 'bg-surface-muted text-text-muted'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-semibold text-text leading-tight">
                    Custom
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-text-muted truncate mt-0.5 font-medium">
                    دیگر رقم
                  </div>
                </div>
              </button>
            </div>

            {/* Custom Amount Input Field */}
            {isCustom && (
              <div className="mt-2 p-2.5 rounded-xl bg-surface-muted/40 border border-border/80 space-y-1 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-[11px] text-text-muted font-medium">
                  <span>Enter custom amount</span>
                  <span>
                    Min: {minAmount} • Max: {maxAmount} PKR
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-text-muted font-mono select-none">
                    PKR
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={customInput}
                    onChange={handleCustomChange}
                    placeholder={`e.g. 300`}
                    className="w-full pl-12 pr-3 py-1.5 rounded-lg border border-border bg-surface text-text font-semibold text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-ring/30"
                    autoFocus
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. Smart, Deduplicated Payment Method Row */}
          {formattedMethods.length > 0 && (
            <div>
              {formattedMethods.length === 1 ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-muted/40 border border-border/60 text-xs text-text-muted">
                  <CreditCard className="w-3.5 h-3.5 text-accent-strong shrink-0" />
                  <span className="font-medium text-text-muted">Direct to author:</span>
                  <span className="font-semibold text-text">
                    {formattedMethods[0].combined}
                  </span>
                  {paymentMethods[0]?.instructions_note && (
                    <span className="text-[11px] text-text-muted truncate hidden sm:inline">
                      ({paymentMethods[0].instructions_note})
                    </span>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium text-text-muted">
                    Pay directly via
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {paymentMethods.map((pm, idx) => {
                      const isSelected = selectedMethodId === pm.id;
                      const formatted = formattedMethods[idx];
                      return (
                        <label
                          key={pm.id}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer select-none transition-all min-h-[38px] ${
                            isSelected
                              ? 'border-accent-strong bg-accent-soft/30 text-text'
                              : 'border-border/60 bg-surface/60 hover:bg-surface-muted/40 text-text-muted'
                          }`}
                        >
                          <input
                            type="radio"
                            name="payment_method"
                            value={pm.id}
                            checked={isSelected}
                            onChange={() => setSelectedMethodId(pm.id)}
                            className="sr-only"
                          />
                          <span
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'border-accent-strong bg-accent-strong'
                                : 'border-border bg-surface'
                            }`}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                          <div className="min-w-0 flex-1 flex items-center gap-1.5 truncate text-xs">
                            <span className="font-semibold text-text truncate">
                              {formatted.provider}
                            </span>
                            <span className="text-border-subtle">•</span>
                            <span className="font-mono text-[11px] text-text-muted truncate">
                              {formatted.mask}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Collapsible Note + Compact Anonymous Toggle */}
          <div>
            <div className="flex items-center justify-between gap-3">
              {!isNoteExpanded ? (
                <button
                  type="button"
                  onClick={() => setIsNoteExpanded(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-strong hover:underline py-1 transition-colors cursor-pointer"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  <span>+ Add a note (optional)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!readerMessage) setIsNoteExpanded(false);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text py-1 transition-colors cursor-pointer"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  <span>Note for author</span>
                </button>
              )}

              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-text-muted hover:text-text py-1">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    isAnonymous
                      ? 'border-accent-strong bg-accent-strong text-white'
                      : 'border-text-muted/70 hover:border-accent-strong bg-surface'
                  }`}
                >
                  {isAnonymous && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </span>
                <span className="font-medium">{TIP_CARD_COPY.anonymousOption}</span>
              </label>
            </div>

            {isNoteExpanded && (
              <div className="mt-2 space-y-1 animate-in fade-in duration-150">
                <div className="flex justify-end">
                  <span className="text-[10px] text-text-muted font-mono">
                    {readerMessage.length} / 300
                  </span>
                </div>
                <textarea
                  dir="auto"
                  value={readerMessage}
                  onChange={(e) => setReaderMessage(e.target.value.slice(0, 300))}
                  placeholder="Write a warm note to encourage the author..."
                  rows={2}
                  className="w-full p-2.5 rounded-xl border border-border/80 bg-surface text-xs sm:text-sm text-text placeholder:text-text-muted/60 focus:outline-hidden focus:ring-2 focus:ring-ring/30 resize-none"
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-danger-soft border border-danger-border flex items-start gap-2 text-xs text-danger-text">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 5. Dynamic Primary CTA + Quiet Trust Footnote */}
          <div className="space-y-2 pt-0.5">
            <button
              type="submit"
              disabled={isSubmitting || !hasValidAmount}
              className="w-full py-2.5 px-5 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-xs sm:text-sm transition-all flex items-center justify-center gap-2 min-h-[44px] shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Preparing instructions...</span>
                </>
              ) : (
                <>
                  <span>{ctaLabel}</span>
                  <span className="text-white/60">•</span>
                  <span dir="rtl" lang="ur" className="font-urdu text-xs">
                    {TIP_CARD_COPY.continueButtonUrdu}
                  </span>
                </>
              )}
            </button>

            {/* Quiet Trust Footnote */}
            <div className="flex items-center justify-center gap-1.5 text-center text-[11px] text-text-muted/80">
              <ShieldCheck className="w-3.5 h-3.5 text-accent-strong shrink-0" />
              <span>100% goes directly to the author · No platform fee</span>
            </div>
          </div>
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
