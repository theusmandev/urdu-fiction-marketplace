import React from 'react';
import Link from 'next/link';
import { ShieldCheck, CheckCircle2, ArrowLeft } from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';

export default function WriterAgreementPage() {
  return (
    <div className="min-h-screen bg-ivory text-main py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8 rounded-2xl border border-border bg-surface p-8 md:p-12 shadow-card">
        <div className="border-b border-border pb-6">
          <Link
            href="/become-a-writer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-dark mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to application</span>
          </Link>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-accent" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-serif text-navy tracking-tight">
                Writer Platform Agreement
              </h1>
              <UrduText size="sm" className="text-accent mt-1 leading-[2.2]">
                مصنفین کے لیے ضابطہ اخلاق اور معاہدہ شراکت
              </UrduText>
            </div>
          </div>
        </div>

        <div className="space-y-6 text-sm text-secondary leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-navy flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              1. Direct Reader-to-Writer Payout Model
            </h2>
            <p>
              UNB Premium connects Urdu fiction authors directly with verified readers. Readers deposit payments directly to your provided Pakistani bank or mobile wallet accounts (JazzCash, EasyPaisa, Raast). You receive 100% of reader payments directly upon deposit verification.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-navy flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              2. Platform Commission & Accrual Threshold
            </h2>
            <p>
              The platform records an automated 20% platform commission (or agreed custom rate) on each verified sale. You agree to settle accrued commissions with the platform once your balance reaches the unpaid limit of PKR 5,000. Orders remain active and uninterrupted while within this limit.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-navy flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              3. Copyright & Original Authorship
            </h2>
            <p>
              You warrant that all published Urdu stories, serialized novels, and literary content submitted under your pen name are your original intellectual property. Plagiarism, unlicensed adaptations, or copyright infringement will result in immediate suspension and entitlement revocation.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-navy flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              4. Verification Obligations
            </h2>
            <p>
              You agree to inspect bank receipts submitted by readers in good faith within 24–48 hours. Falsely confirming unreceived funds or unfairly rejecting valid reader deposits constitutes a breach of platform integrity and may trigger administrative dispute intervention.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-navy flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              5. Reader Appreciation Gifts (&quot;Tips&quot;) — Draft, Pending Legal Review
            </h2>
            <p>
              Eligible authors may opt in to accept voluntary reader appreciation gifts (&quot;Tips&quot;). Tips are non-refundable voluntary gifts from readers. UNB Premium takes 0% commission on tips and never holds or processes tip funds.
            </p>
            <p>
              Tips unlock no content. Authors are strictly prohibited from demanding tips, locking content behind tips, conditioning releases on tips, or substituting tips for book sales. Any such attempt constitutes a material breach of this Agreement.
            </p>
          </section>
        </div>

        <div className="pt-6 border-t border-border text-center">
          <Link
            href="/become-a-writer"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-navy hover:bg-accent-dark transition-colors shadow-sm"
          >
            <span>I Understand & Agree</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
