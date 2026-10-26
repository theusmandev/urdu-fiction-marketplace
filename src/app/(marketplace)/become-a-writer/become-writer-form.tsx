'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { applyAsWriterAction } from '@/app/actions/profile';
import { Feather, AlertCircle, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { WriterProfileRow } from '@/types/database';

interface BecomeWriterFormProps {
  existingProfile?: WriterProfileRow | null;
}

export function BecomeWriterForm({ existingProfile }: BecomeWriterFormProps) {
  const router = useRouter();
  const [penNameUrdu, setPenNameUrdu] = useState(existingProfile?.pen_name_urdu || '');
  const [penNameEnglish, setPenNameEnglish] = useState(existingProfile?.pen_name_english || '');
  const [bioUrdu, setBioUrdu] = useState(existingProfile?.bio_urdu || '');
  const [bioEnglish, setBioEnglish] = useState(existingProfile?.bio_english || '');
  const [acceptAgreement, setAcceptAgreement] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isReapplying = existingProfile?.status === 'rejected';

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!acceptAgreement) {
      setError('You must accept the Writer Platform Agreement to proceed.');
      return;
    }

    const formData = new FormData();
    formData.append('penNameUrdu', penNameUrdu);
    formData.append('penNameEnglish', penNameEnglish);
    formData.append('bioUrdu', bioUrdu);
    formData.append('bioEnglish', bioEnglish);
    formData.append('acceptAgreement', 'true');

    startTransition(async () => {
      const result = await applyAsWriterAction(formData);

      if (!result.success) {
        setError(result.error || 'Failed to submit writer application.');
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else {
        setSuccess(true);
        router.refresh();
      }
    });
  };

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center space-y-4 shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="text-xl font-bold font-serif text-emerald-950">Application Submitted!</h2>
        <p className="text-sm text-emerald-800 leading-relaxed max-w-md mx-auto">
          Your author application has been submitted for review. Once approved by our team, your author dashboard will be activated.
        </p>
        <div className="pt-2">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <span>Return to Account</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isReapplying && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-900 text-sm">
          <strong className="font-bold block mb-1">Reapplying for Author Status</strong>
          Please update your pen name or bio information below and resubmit for editorial review.
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-rose-800 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pen Name Urdu */}
        <div>
          <label htmlFor="penNameUrdu" className="block text-sm font-semibold text-secondary">
            Urdu Pen Name (قلمی نام اردو) <span className="text-rose-500">*</span>
          </label>
          <input
            id="penNameUrdu"
            type="text"
            required
            dir="rtl"
            value={penNameUrdu}
            onChange={(e) => setPenNameUrdu(e.target.value)}
            placeholder="مثلاً: نمرہ احمد"
            disabled={isPending}
            className="font-urdu mt-1 block w-full rounded-xl border border-border bg-surface-muted py-2.5 px-3 text-navy placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent text-base leading-[2.2] min-h-[44px] disabled:opacity-50 transition-colors"
          />
          {fieldErrors.penNameUrdu && (
            <p className="mt-1 text-xs text-rose-600">{fieldErrors.penNameUrdu[0]}</p>
          )}
        </div>

        {/* Pen Name English */}
        <div>
          <label htmlFor="penNameEnglish" className="block text-sm font-semibold text-secondary">
            English Pen Name (Roman/English) <span className="text-rose-500">*</span>
          </label>
          <input
            id="penNameEnglish"
            type="text"
            required
            value={penNameEnglish}
            onChange={(e) => setPenNameEnglish(e.target.value)}
            placeholder="e.g. Nimra Ahmed"
            disabled={isPending}
            className="mt-1 block w-full rounded-xl border border-border bg-surface-muted py-2.5 px-3 text-navy placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent text-base sm:text-sm min-h-[44px] disabled:opacity-50 transition-colors"
          />
          {fieldErrors.penNameEnglish && (
            <p className="mt-1 text-xs text-rose-600">{fieldErrors.penNameEnglish[0]}</p>
          )}
        </div>

        {/* Bio Urdu */}
        <div className="md:col-span-2">
          <label htmlFor="bioUrdu" className="block text-sm font-semibold text-secondary">
            Author Bio in Urdu (مختصر تعارف اردو)
          </label>
          <textarea
            id="bioUrdu"
            rows={3}
            dir="rtl"
            value={bioUrdu}
            onChange={(e) => setBioUrdu(e.target.value)}
            placeholder="اپنے ادبی سفر اور اندازِ تحریر کے بارے میں چند جملے..."
            disabled={isPending}
            className="font-urdu mt-1 block w-full rounded-xl border border-border bg-surface-muted py-2.5 px-3 text-navy placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent text-base leading-[2.2] disabled:opacity-50 transition-colors"
          />
        </div>

        {/* Bio English */}
        <div className="md:col-span-2">
          <label htmlFor="bioEnglish" className="block text-sm font-semibold text-secondary">
            Author Bio in English (Optional)
          </label>
          <textarea
            id="bioEnglish"
            rows={2}
            value={bioEnglish}
            onChange={(e) => setBioEnglish(e.target.value)}
            placeholder="A brief introduction to your literary background..."
            disabled={isPending}
            className="mt-1 block w-full rounded-xl border border-border bg-surface-muted py-2.5 px-3 text-navy placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent text-base sm:text-sm disabled:opacity-50 transition-colors"
          />
        </div>
      </div>

      {/* Agreement Checkbox */}
      <div className="pt-2 border-t border-border">
        <label className="flex items-start gap-3 cursor-pointer py-1">
          <input
            type="checkbox"
            required
            checked={acceptAgreement}
            onChange={(e) => setAcceptAgreement(e.target.checked)}
            disabled={isPending}
            className="mt-1 h-5 w-5 rounded border-border bg-white text-accent focus:ring-accent cursor-pointer shrink-0"
          />
          <span className="text-xs text-secondary leading-normal">
            I confirm that all published Urdu stories are my original work, and I agree to the{' '}
            <Link
              href="/writer/agreement"
              target="_blank"
              className="text-accent hover:text-accent-dark underline underline-offset-2 font-semibold"
            >
              Writer Platform Agreement
            </Link>{' '}
            (including direct bank verification rules and the 20% platform commission schedule).
          </span>
        </label>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending || !acceptAgreement}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-navy shadow-sm hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 transition-all cursor-pointer min-h-[44px] w-full sm:w-auto"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Submitting Application...</span>
            </>
          ) : (
            <>
              <Feather className="h-4 w-4" />
              <span>{isReapplying ? 'Resubmit Author Application' : 'Submit Author Application'}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
