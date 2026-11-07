'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WriterAgreementContent } from '@/components/legal/WriterAgreementContent';
import { acceptWriterAgreementAction } from '@/app/actions/writer';
import { UrduText } from '@/components/urdu/UrduText';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Calendar,
} from 'lucide-react';

interface WriterAgreementClientProps {
  initialAcceptedAt: string | null;
  penName: string;
}

export function WriterAgreementClient({
  initialAcceptedAt,
  penName,
}: WriterAgreementClientProps) {
  const router = useRouter();
  const [acceptedAt, setAcceptedAt] = useState<string | null>(initialAcceptedAt);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAccept = () => {
    setError(null);
    startTransition(async () => {
      const res = await acceptWriterAgreementAction();
      if (!res.success) {
        setError(res.error || 'Failed to record acceptance. Please try again.');
      } else {
        const timestamp = res.data?.accepted_at || new Date().toISOString();
        setAcceptedAt(timestamp);
        router.refresh();
      }
    });
  };

  const formattedDate = acceptedAt
    ? new Date(acceptedAt).toLocaleDateString('en-PK', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Navigation Row */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/writer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-navy transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Writer Studio</span>
        </Link>

        {acceptedAt && (
          <span className="inline-flex items-center gap-1.5 text-xs text-secondary font-medium">
            <Calendar className="w-3.5 h-3.5 text-success" />
            <span>Active since {formattedDate}</span>
          </span>
        )}
      </div>

      {/* Top Status Banner */}
      {acceptedAt ? (
        <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-success-soft border border-success-border text-success-text shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-success/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-success" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs sm:text-sm">Agreement Accepted &amp; Active</span>
                <UrduText as="span" size="xs" className="font-urdu text-success-text/90 py-0">
                  معاہدہ منظور شدہ ہے
                </UrduText>
              </div>
              <p className="text-[11px] sm:text-xs text-success-text/80 truncate">
                Accepted by {penName} on {formattedDate}
              </p>
            </div>
          </div>
          <Link
            href="/writer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-success-border text-xs font-semibold hover:bg-success-soft text-success-text shrink-0 transition-colors shadow-2xs"
          >
            <span>Writer Studio</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-warning-soft border border-warning-border text-warning-text shadow-2xs">
          <AlertCircle className="w-5 h-5 text-warning-text shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs sm:text-sm">Action Required: Author Agreement</span>
              <UrduText as="span" size="xs" className="font-urdu text-warning-text py-0">
                معاہدے کی منظوری درکار ہے
              </UrduText>
            </div>
            <p className="text-xs text-warning-text/90 mt-0.5">
              Please review the operating terms and publishing rules below, then confirm your acceptance to ensure full account compliance.
            </p>
          </div>
        </div>
      )}

      {/* Main Agreement Content Card */}
      <div className="rounded-3xl border border-border/80 bg-surface p-6 sm:p-10 shadow-sm space-y-8">
        <WriterAgreementContent showHeader={true} />

        {/* Bottom Section: Acceptance State or Interactive Action */}
        <div className="pt-8 border-t border-border">
          {acceptedAt ? (
            <div className="p-6 rounded-2xl bg-success-soft border border-success-border text-success-text flex flex-col sm:flex-row items-center justify-between gap-5 shadow-2xs">
              <div className="space-y-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  <h3 className="font-bold text-sm sm:text-base text-success-text">
                    Agreement Accepted &amp; Active
                  </h3>
                  <UrduText as="span" size="sm" className="font-urdu text-success-text/90 py-0">
                    معاہدہ منظور شدہ ہے
                  </UrduText>
                </div>
                <p className="text-xs text-success-text/85 max-w-xl">
                  You accepted the UNB Premium Writer Platform Agreement on {formattedDate}. Your publishing privileges and payout terms remain active and compliant.
                </p>
              </div>

              <Link
                href="/writer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-semibold transition-colors shrink-0 shadow-xs min-h-[44px]"
              >
                <span>Back to Writer Studio</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="p-6 sm:p-8 rounded-2xl bg-surface-muted border border-border text-center space-y-4 shadow-2xs">
              {error && (
                <div className="p-3 rounded-xl bg-danger-soft border border-danger-border text-danger-text text-xs flex items-center justify-center gap-2 max-w-md mx-auto">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="max-w-md mx-auto space-y-1">
                <h3 className="font-bold text-base text-navy">Confirm Agreement Acceptance</h3>
                <UrduText as="p" size="xs" className="text-secondary py-0">
                  کیا آپ یو این بی پریمیم کے مصنفین کے ضابطہ اخلاق اور شرائط سے متفق ہیں؟
                </UrduText>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-dark text-navy font-bold text-sm transition-all shadow-sm hover:shadow-md disabled:opacity-50 min-h-[48px] cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Recording acceptance...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>I Accept the Writer Agreement • میں اس معاہدے سے متفق ہوں</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

