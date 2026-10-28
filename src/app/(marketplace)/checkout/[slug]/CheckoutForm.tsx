'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import { formatPKR, resolveCoverUrl } from '@/lib/utils';
import { createOrderAction } from '@/app/actions/checkout';
import type { CheckoutOptionsResponse, PaymentMethodType } from '@/types/database';
import {
  CreditCard,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Lock,
  ArrowLeft,
  CheckCircle2,
  BookOpen,
  HelpCircle,
} from 'lucide-react';

interface CheckoutFormProps {
  options: CheckoutOptionsResponse;
}

function getMethodLabel(type: PaymentMethodType, bankName: string | null): string {
  switch (type) {
    case 'jazzcash':
      return 'JazzCash Mobile Account';
    case 'easypaisa':
      return 'Easypaisa Mobile Account';
    case 'raast':
      return 'Raast Instant Payment';
    case 'bank_iban':
      return bankName ? `Bank Transfer (${bankName})` : 'Direct Bank Transfer';
    default:
      return 'Direct Bank Transfer';
  }
}

export function CheckoutForm({ options }: CheckoutFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedMethodId, setSelectedMethodId] = useState<string>(
    options.payment_methods[0]?.id || ''
  );
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { novel, payment_methods: paymentMethods } = options;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedMethodId) {
      setError('Please select a payment method to proceed.');
      return;
    }

    if (!termsAccepted) {
      setError('You must agree to the direct payment terms and refund policy to place an order.');
      return;
    }

    startTransition(async () => {
      const res = await createOrderAction({
        novelId: novel.id,
        paymentMethodId: selectedMethodId,
        termsAccepted: true,
      });

      if (!res.success) {
        setError(res.error || 'Failed to place order. Please try again.');
        return;
      }

      if (res.data?.orderNumber) {
        router.push(`/orders/${res.data.orderNumber}`);
      }
    });
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      {/* Back button */}
      <div>
        <Link
          href={`/novels/${novel.slug}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-accent transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Novel Details</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form & Payment Methods (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div>
            <h1 className="text-2xl font-bold font-serif tracking-tight text-navy flex items-center gap-2.5">
              <CreditCard className="w-6 h-6 text-accent" />
              <span>Direct Writer Checkout</span>
            </h1>
            <p className="mt-1 text-xs text-secondary">
              Select your preferred Pakistani payment channel to initiate your purchase.
            </p>
          </div>

          {/* Payment Model Explanation Banner */}
          <div className="rounded-2xl bg-amber-50/80 border border-amber-200 p-4 sm:p-5 space-y-2">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-amber-950">
                  Direct Reader-to-Writer Payment
                </h2>
                <p className="text-xs text-amber-900 leading-relaxed">
                  You pay the writer directly. Access unlocks after the writer verifies your payment.
                  The platform never receives your money.
                </p>
                <div className="pt-1">
                  <UrduText as="p" size="xs" className="text-amber-950 font-medium leading-[2.2]">
                    آپ رقم براہِ راست مصنف کے اکاؤنٹ میں بھیجتے ہیں۔ مصنف کی تصدیق کے بعد ناول تک رسائی حاصل ہو گی۔
                  </UrduText>
                </div>
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Payment Method Selector */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-navy block">
                Choose Author Payment Account
              </label>

              <div className="space-y-2.5">
                {paymentMethods.map((method) => {
                  const isSelected = selectedMethodId === method.id;
                  return (
                    <label
                      key={method.id}
                      className={`block p-4 rounded-xl border transition-all cursor-pointer shadow-sm ${
                        isSelected
                          ? 'bg-amber-50/80 border-accent shadow-sm ring-1 ring-accent/30'
                          : 'bg-surface border-border hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="payment_method"
                          value={method.id}
                          checked={isSelected}
                          onChange={() => setSelectedMethodId(method.id)}
                          className="mt-1 h-4 w-4 text-accent border-border focus:ring-accent"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-navy">
                              {getMethodLabel(method.method_type, method.bank_name)}
                            </span>
                            <span className="text-[11px] font-mono text-accent font-semibold bg-surface-muted px-2 py-0.5 rounded border border-border">
                              {method.masked_account}
                            </span>
                          </div>
                          <p className="text-[11px] text-secondary mt-0.5">
                            Account Title: <span className="text-navy font-semibold">{method.account_title}</span>
                          </p>
                          {method.instructions_note && (
                            <p className="text-[10px] text-muted mt-1 italic">
                              Note: {method.instructions_note}
                            </p>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <p className="text-[11px] text-secondary flex items-center gap-1.5 mt-2">
                <Lock className="w-3.5 h-3.5 text-secondary" />
                <span>
                  Full account numbers and IBANs are revealed on your order invoice upon placing the order.
                </span>
              </p>
            </div>

            {/* Terms and Refund Policy Agreement */}
            <div className="pt-2 border-t border-border">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded text-accent border-border focus:ring-accent"
                />
                <span className="text-xs text-secondary leading-relaxed">
                  I understand that I am transferring funds directly to the author’s personal account. I have read and agree to the{' '}
                  <Link href="/terms" target="_blank" className="text-accent underline hover:text-accent-dark font-semibold">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/refund-policy" target="_blank" className="text-accent underline hover:text-accent-dark font-semibold">
                    Refund & Dispute Policy
                  </Link>
                  .
                </span>
              </label>
            </div>

            {/* Submit Action */}
            <div>
              <button
                type="submit"
                disabled={isPending || !selectedMethodId || !termsAccepted}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-navy bg-accent hover:bg-accent-dark active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer min-h-[44px]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating Order...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Create Order ({formatPKR(novel.price_pkr)})</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Sticky Mobile Submit Action Bar */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border p-3 px-4 shadow-lg pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
              <div className="min-w-0">
                <div className="text-[10px] text-secondary">Total Due</div>
                <div className="font-serif text-base font-bold text-navy leading-tight truncate">
                  {formatPKR(novel.price_pkr)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const formSubmitBtn = document.querySelector('form button[type="submit"]') as HTMLButtonElement | null;
                  formSubmitBtn?.click();
                }}
                disabled={isPending || !selectedMethodId || !termsAccepted}
                className="flex-1 max-w-[210px] min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs text-navy bg-accent hover:bg-accent-dark active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating Order...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Create Order</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Order Summary Card (5 cols) */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 rounded-2xl bg-surface border border-border p-6 space-y-6 shadow-card">
            <h2 className="text-xs font-bold uppercase tracking-wider text-secondary pb-3 border-b border-border">
              Order Summary
            </h2>

            {/* Novel Info */}
            <div className="flex gap-4">
              {(() => {
                const cover = resolveCoverUrl(novel.cover_image_url || novel.cover_url);
                return cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt={novel.title_english}
                    className="w-20 h-28 object-cover rounded-xl border border-border shrink-0"
                  />
                ) : (
                  <div className="w-20 h-28 rounded-xl bg-surface-muted border border-border flex items-center justify-center text-secondary shrink-0">
                    <BookOpen className="w-8 h-8" />
                  </div>
                );
              })()}

              <div className="space-y-1 min-w-0">
                <h3 className="text-sm font-bold text-navy truncate">{novel.title_english}</h3>
                <UrduText as="h4" size="sm" className="text-accent truncate leading-[2.2]">
                  {novel.title_urdu}
                </UrduText>
                <p className="text-xs text-secondary pt-1">
                  By <span className="text-navy font-semibold">{novel.writer_pen_name}</span>
                </p>
                <div className="pt-2">
                  <span className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-surface-muted border border-border text-secondary">
                    Full Novel Access
                  </span>
                </div>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="space-y-2 pt-4 border-t border-border text-xs">
              <div className="flex justify-between text-secondary">
                <span>Novel Price</span>
                <span className="font-mono text-navy font-semibold">{formatPKR(novel.price_pkr)}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Fees</span>
                <span className="text-emerald-700 font-semibold font-mono">None (PKR 0)</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-navy pt-2 border-t border-border">
                <span>Total Amount Due</span>
                <span className="text-navy text-base font-mono">{formatPKR(novel.price_pkr)}</span>
              </div>
            </div>

            {/* Safe Notice */}
            <div className="rounded-xl bg-surface-muted p-3.5 border border-border text-[11px] text-secondary space-y-1">
              <div className="font-semibold text-navy flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                <span>Buyer Protection</span>
              </div>
              <p>
                All purchases are recorded on the platform financial ledger. You can open a dispute if
                the author does not verify your verified bank transfer.
              </p>
            </div>

            {/* Need Help Paying? */}
            <div className="rounded-xl bg-surface-muted p-3.5 border border-border text-[11px] text-secondary space-y-1">
              <div className="font-semibold text-navy flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-accent" />
                <span>Need help paying?</span>
              </div>
              <p className="leading-relaxed">
                Follow our step-by-step{' '}
                <Link href="/how-to-pay" className="text-accent hover:underline font-semibold">
                  Payment Guide
                </Link>
                , read{' '}
                <Link href="/how-it-works" className="text-accent hover:underline font-semibold">
                  How Direct Payment Works
                </Link>
                , check our{' '}
                <Link href="/faq" className="text-accent hover:underline font-semibold">
                  FAQ
                </Link>
                , or review the{' '}
                <Link href="/refund-policy" className="text-accent hover:underline font-semibold">
                  Refund Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
