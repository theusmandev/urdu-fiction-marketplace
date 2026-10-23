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
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href={`/novels/${novel.slug}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-amber-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Novel Details</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form & Payment Methods (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <CreditCard className="w-6 h-6 text-amber-500" />
              <span>Direct Writer Checkout</span>
            </h1>
            <p className="mt-1 text-xs text-stone-400">
              Select your preferred Pakistani payment channel to initiate your purchase.
            </p>
          </div>

          {/* Payment Model Explanation Banner */}
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 sm:p-5 space-y-2">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Direct Reader-to-Writer Payment
                </h2>
                <p className="text-xs text-stone-300 leading-relaxed">
                  You pay the writer directly. Access unlocks after the writer verifies your payment.
                  The platform never receives your money.
                </p>
                <div className="pt-1">
                  <UrduText as="p" size="xs" className="text-amber-300/90 leading-[2.2]">
                    آپ رقم براہِ راست مصنف کے اکاؤنٹ میں بھیجتے ہیں۔ مصنف کی تصدیق کے بعد ناول تک رسائی حاصل ہو گی۔
                  </UrduText>
                </div>
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 flex items-start gap-3 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Payment Method Selector */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block">
                Choose Author Payment Account
              </label>

              <div className="space-y-2.5">
                {paymentMethods.map((method) => {
                  const isSelected = selectedMethodId === method.id;
                  return (
                    <label
                      key={method.id}
                      className={`block p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-500/30'
                          : 'bg-stone-900 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="payment_method"
                          value={method.id}
                          checked={isSelected}
                          onChange={() => setSelectedMethodId(method.id)}
                          className="mt-1 h-4 w-4 text-amber-500 border-stone-700 focus:ring-amber-500 focus:ring-offset-stone-900"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white">
                              {getMethodLabel(method.method_type, method.bank_name)}
                            </span>
                            <span className="text-[11px] font-mono text-amber-400 font-semibold bg-stone-800/80 px-2 py-0.5 rounded">
                              {method.masked_account}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-400 mt-0.5">
                            Account Title: <span className="text-stone-200">{method.account_title}</span>
                          </p>
                          {method.instructions_note && (
                            <p className="text-[10px] text-stone-500 mt-1 italic">
                              Note: {method.instructions_note}
                            </p>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <p className="text-[11px] text-stone-500 flex items-center gap-1.5 mt-2">
                <Lock className="w-3.5 h-3.5 text-stone-400" />
                <span>
                  Full account numbers and IBANs are revealed on your order invoice upon placing the order.
                </span>
              </p>
            </div>

            {/* Terms and Refund Policy Agreement */}
            <div className="pt-2 border-t border-stone-800">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded text-amber-500 border-stone-700 focus:ring-amber-500 focus:ring-offset-stone-900"
                />
                <span className="text-xs text-stone-300 leading-relaxed">
                  I understand that I am transferring funds directly to the author’s personal account. I have read and agree to the{' '}
                  <Link href="/terms" target="_blank" className="text-amber-400 underline hover:text-amber-300">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/refund-policy" target="_blank" className="text-amber-400 underline hover:text-amber-300">
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
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-stone-950 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/10 cursor-pointer"
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
        </div>

        {/* Right Column: Order Summary Card (5 cols) */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 rounded-2xl bg-stone-900 border border-stone-800 p-6 space-y-6 shadow-xl">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 pb-3 border-b border-stone-800">
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
                    className="w-20 h-28 object-cover rounded-xl border border-stone-800 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-28 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-600 shrink-0">
                    <BookOpen className="w-8 h-8" />
                  </div>
                );
              })()}

              <div className="space-y-1 min-w-0">
                <h3 className="text-sm font-bold text-white truncate">{novel.title_english}</h3>
                <UrduText as="h4" size="sm" className="text-amber-400 truncate leading-[2.2]">
                  {novel.title_urdu}
                </UrduText>
                <p className="text-xs text-stone-400 pt-1">
                  By <span className="text-stone-200 font-semibold">{novel.writer_pen_name}</span>
                </p>
                <div className="pt-2">
                  <span className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-stone-800 text-stone-300">
                    Full Novel Access
                  </span>
                </div>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="space-y-2 pt-4 border-t border-stone-800 text-xs">
              <div className="flex justify-between text-stone-400">
                <span>Novel Price</span>
                <span>{formatPKR(novel.price_pkr)}</span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span>Platform Fee</span>
                <span className="text-emerald-400 font-medium">Free (PKR 0)</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-stone-800/60">
                <span>Total Amount Due</span>
                <span className="text-amber-400 text-base">{formatPKR(novel.price_pkr)}</span>
              </div>
            </div>

            {/* Safe Notice */}
            <div className="rounded-xl bg-stone-950/60 p-3.5 border border-stone-800/80 text-[11px] text-stone-400 space-y-1">
              <div className="font-semibold text-stone-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                <span>Buyer Protection</span>
              </div>
              <p>
                All purchases are recorded on the platform financial ledger. You can open a dispute if
                the author does not verify your verified bank transfer.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
