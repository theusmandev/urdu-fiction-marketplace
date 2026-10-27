'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Sparkles, HelpCircle, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { UrduText } from '@/components/urdu/UrduText';
import { HowTipsWorkModal } from './HowTipsWorkModal';
import { TIP_CARD_COPY, PRESET_LABELS, HOW_TIPS_WORK } from '@/lib/copy/tips';
import { validateTipAmount, validateTipMessage } from '@/lib/tips/validation';
import type { TipOptionsPayload } from '@/types/database';

interface TipCardProps {
  writerId?: string | null;
  novelId?: string | null;
  chapterId?: string | null;
  className?: string;
  onTipCreated?: (tipNumber: string) => void;
}

export function TipCard({
  writerId = null,
  novelId = null,
  chapterId = null,
  className = '',
  onTipCreated,
}: TipCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<TipOptionsPayload | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

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

  useEffect(() => {
    let isMounted = true;

    async function loadTipOptions() {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          if (isMounted) setLoading(false);
          return; // Signed-out readers do not see tip card
        }

        const currentUserId = session.user.id;
        if (isMounted) {
          setUserId(currentUserId);
          setUserRole(session.user.user_metadata?.role || 'reader');
        }

        // Rule: Writer cannot tip themselves
        if (writerId && currentUserId === writerId) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase.rpc('get_tip_options', {
          p_writer_id: writerId || null,
          p_novel_id: novelId || null,
          p_chapter_id: chapterId || null,
        });

        if (error) {
          console.error('get_tip_options error:', error);
          if (isMounted) setLoading(false);
          return;
        }

        const payload = data as unknown as TipOptionsPayload;
        if (!payload || !payload.tips_enabled || !payload.writer_enabled || !payload.can_tip) {
          if (isMounted) setLoading(false);
          return;
        }

        if (payload.writer_id && payload.writer_id === currentUserId) {
          if (isMounted) setLoading(false);
          return;
        }

        if (isMounted) {
          setOptions(payload);
          const presets = payload.preset_amounts || [100, 250, 500];
          setSelectedAmount(presets[0] || 100);

          if (payload.payment_methods && payload.payment_methods.length > 0) {
            setSelectedMethodId(payload.payment_methods[0].id);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load tip options:', err);
        if (isMounted) setLoading(false);
      }
    }

    loadTipOptions();

    return () => {
      isMounted = false;
    };
  }, [writerId, novelId, chapterId]);

  // If loading, render minimal skeleton preserving layout
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

  // If tips cannot be shown for this writer or user
  if (!options || !userId || userId === writerId || userRole === 'admin') {
    return null;
  }

  const minAmount = options.min_amount_pkr ?? 20;
  const maxAmount = options.max_amount_pkr ?? 5000;
  const presets = options.preset_amounts || [100, 250, 500];

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
        console.error('create_tip error:', error);
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
      console.error('Failed to submit tip:', err);
      const msg = err instanceof Error ? err.message : TIP_CARD_COPY.errors.failedToCreate;
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        className={`w-full max-w-xl mx-auto rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-[#fdfbf7] dark:bg-[#1a1714] p-5 sm:p-7 shadow-xs text-main transition-all ${className}`}
        id="tip-card"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-xs">
              <Heart className="w-5 h-5 fill-amber-600/30 dark:fill-amber-400/30" />
            </div>
            <div>
              <div className="flex items-center gap-2">
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

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1 text-xs text-secondary hover:text-main transition-colors py-1 px-2 rounded-lg hover:bg-amber-100/40 dark:hover:bg-amber-900/20 min-h-[44px]"
            title={HOW_TIPS_WORK.title}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">How it works</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Preset Buttons */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-2">
              Select appreciation amount (PKR)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {presets.map((preset) => {
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
                <UrduText as="span" size="xs" className="text-[10px] text-secondary py-0">
                  {TIP_CARD_COPY.customLabelUrdu}
                </UrduText>
              </button>
            </div>

            {/* Custom Input */}
            {isCustom && (
              <div className="mt-3">
                <div className="relative rounded-xl border border-amber-300 dark:border-amber-800 bg-surface overflow-hidden focus-within:ring-2 focus-within:ring-amber-500/30">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-secondary">
                    PKR
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={customInput}
                    onChange={handleCustomChange}
                    placeholder={`Between ${minAmount} and ${maxAmount}`}
                    className="w-full pl-12 pr-4 py-2.5 text-sm bg-transparent outline-hidden min-h-[44px]"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-secondary mt-1">
                  Min PKR {minAmount} • Max PKR {maxAmount}
                </p>
              </div>
            )}
          </div>

          {/* Payment Method Selector (if multiple accounts available) */}
          {options.payment_methods && options.payment_methods.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">
                Author&apos;s receiving account
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {options.payment_methods.map((method) => {
                  const isSelected = selectedMethodId === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedMethodId(method.id)}
                      className={`text-left p-3 rounded-xl border text-xs transition-all min-h-[44px] flex items-center justify-between ${
                        isSelected
                          ? 'border-amber-500 bg-amber-100/50 dark:bg-amber-900/30 font-medium'
                          : 'border-border/60 bg-surface/50 hover:bg-surface'
                      }`}
                    >
                      <span className="capitalize">{method.masked_label}</span>
                      {isSelected && <span className="text-amber-700 dark:text-amber-400 font-bold">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reader Appreciation Message */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-secondary">
                Optional note of encouragement
              </label>
              <span className="text-[11px] text-secondary">
                {readerMessage.length} / 300
              </span>
            </div>
            <textarea
              value={readerMessage}
              onChange={(e) => setReaderMessage(e.target.value.slice(0, 300))}
              placeholder="Add a warm word of appreciation... / مصنف کے لیے حوصلہ افزا پیغام لکھیں"
              rows={2}
              className="w-full p-3 rounded-xl border border-border/60 bg-surface/70 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 resize-none"
            />
          </div>

          {/* Anonymous Option */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
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
                <UrduText as="span" size="sm" className="py-0 inline">
                  {TIP_CARD_COPY.continueButtonUrdu}
                </UrduText>
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
