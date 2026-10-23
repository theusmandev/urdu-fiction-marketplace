import React from "react";
import type { Metadata } from "next";
import { UrduText } from "@/components/urdu/UrduText";
import { AlertTriangle, ShieldCheck } from "lucide-react";

export const revalidate = 86400; // 24 hours ISR

export const metadata: Metadata = {
  title: "Refund & Dispute Policy — ریفنڈ اور تنازعات کی پالیسی",
  description:
    "Plain explanation of refund and dispute mechanisms on UNB Premium's direct reader-to-writer payment architecture.",
};

export default function RefundPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      {/* Legal Status Notice */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="font-semibold">
          Draft — Pending Formal Legal Review. This document outlines direct payment dispute and refund procedures.
        </span>
      </div>

      {/* Header */}
      <div className="space-y-3 border-b border-border pb-6">
        <h1 className="font-serif text-3xl font-bold text-navy">
          Refund & Dispute Policy
        </h1>
        <UrduText as="p" size="lg" className="text-secondary py-0">
          رقم کی واپسی اور تنازعات کے حل کی پالیسی
        </UrduText>
        <p className="text-xs text-secondary">
          Last Updated: October 2026
        </p>
      </div>

      {/* Invariant Architecture Notice */}
      <div className="bg-surface p-6 rounded-2xl border border-border space-y-3 shadow-sm">
        <div className="flex items-center gap-2 text-navy font-bold text-sm">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <span>Fundamental Principle: Direct Payments</span>
        </div>
        <p className="text-xs sm:text-sm text-secondary leading-relaxed">
          Because readers transfer payments directly to authors via Pakistani banking
          and mobile wallet rails (JazzCash, EasyPaisa, Raast, or Bank IBAN),
          <strong> the platform does not hold, custody, or store reader funds</strong>.
          Consequently, automated one-click card chargebacks do not exist.
        </p>
      </div>

      {/* Content */}
      <div className="prose prose-slate max-w-none text-xs sm:text-sm text-secondary space-y-6 leading-relaxed">
        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            1. Digital Content Delivery & Finality
          </h2>
          <p>
            Digital novel chapter access is delivered immediately upon the author&apos;s
            verification of your payment deposit. Once full chapter content is unlocked,
            sales are considered final and non-refundable, as digital texts cannot be
            returned.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            2. When Are Disputes Valid?
          </h2>
          <p>
            A reader may raise a formal dispute through their account within the dispute
            window (default 14 days) under the following conditions:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2 text-main">
            <li>
              <strong>Unverified Order Over 24 Hours:</strong> You transferred funds with
              a valid TID, but the author has failed to verify the order.
            </li>
            <li>
              <strong>Wrongful Rejection:</strong> The author marked your valid payment
              as rejected despite confirmed bank debits.
            </li>
            <li>
              <strong>Misleading Content or Blanks:</strong> Chapters in the unlocked
              novel are corrupt, illegible, blank, or blatantly infringe third-party copyright.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            3. Dispute Resolution & Reversals
          </h2>
          <p>
            When a dispute is opened:
          </p>
          <ol className="list-decimal list-inside space-y-1 pl-2 text-main">
            <li>Platform administrators inspect the submitted TID and proof against author statements.</li>
            <li>
              If the payment is verified, the administrator forces novel entitlement grant
              to the reader and notifies both parties.
            </li>
            <li>
              If the writer is unable or unwilling to fulfill access, the writer must refund
              the reader directly via mobile wallet/bank transfer. The writer&apos;s platform
              sales ledger is adjusted with a negative reconciliation entry, reversing any
              associated commission accrual.
            </li>
            <li>
              Writers with repeated unresolved disputes are suspended and disqualified
              from selling on UNB Premium.
            </li>
          </ol>
        </section>
      </div>

      {/* Footer Banner */}
      <div className="pt-6 border-t border-border text-[11px] text-secondary text-center">
        Note: This is a draft policy document pending final legal qualification under Pakistani digital consumer protection regulations.
      </div>
    </div>
  );
}
