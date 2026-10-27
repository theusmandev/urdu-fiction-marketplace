import React from "react";
import type { Metadata } from "next";
import { UrduText } from "@/components/urdu/UrduText";
import { AlertTriangle } from "lucide-react";

export const revalidate = 86400; // 24 hours ISR

export const metadata: Metadata = {
  title: "Terms of Service — شرائط و ضوابط",
  description:
    "Terms of Service governing usage of UNB Premium digital Urdu literature marketplace.",
};

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      {/* Legal Status Notice */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="font-semibold">
          Draft — Pending Formal Legal Review. This document outlines standard operating principles of UNB Premium.
        </span>
      </div>

      {/* Header */}
      <div className="space-y-3 border-b border-border pb-6">
        <h1 className="font-serif text-3xl font-bold text-navy">
          Terms of Service
        </h1>
        <UrduText as="p" size="lg" className="text-secondary py-0">
          استعمال کے شرائط و ضوابط
        </UrduText>
        <p className="text-xs text-secondary">
          Last Updated: October 2026
        </p>
      </div>

      {/* Content */}
      <div className="prose prose-slate max-w-none text-xs sm:text-sm text-secondary space-y-6 leading-relaxed">
        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            1. Platform Marketplace Architecture
          </h2>
          <p>
            UNB Premium (&quot;Platform&quot;) provides an independent digital technology
            and reading infrastructure enabling readers to discover, preview, and purchase
            access to digital Urdu fiction directly from independent Pakistani authors
            (&quot;Writers&quot;).
          </p>
          <p>
            The Platform does not act as a bank, financial wallet, escrow service, or
            payment gateway. All financial payments occur peer-to-peer between the reader
            and the author via Pakistani payment rails (JazzCash, EasyPaisa, Raast,
            Bank Transfer).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            2. Reader Obligations & Payment Submission
          </h2>
          <p>
            When purchasing access to a novel, the reader agrees to transfer the exact
            PKR amount to the author&apos;s verified payment account and accurately submit
            their Transaction Reference (TID) and receipt proof. Submitting fabricated,
            reused, or fraudulent TIDs constitutes grounds for immediate account termination.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            3. Writer Obligations & Verification Timeliness
          </h2>
          <p>
            Approved writers must maintain active, verified Pakistani payment accounts
            in their own legal name or authorized entity. Writers agree to promptly verify
            reader payment submissions (target under 24 hours). Writers retain 100%
            copyright in their works and grant UNB Premium a non-exclusive license to host
            and deliver their chapters to authorized readers.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            4. Platform Commission & Financial Accrual
          </h2>
          <p>
            The platform charges a percentage commission (default 20%, subject to
            contractual adjustments in the writer profile) on verified sales. Commission is
            tracked on an append-only sales ledger and settled periodically against the
            unpaid commission threshold.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            5. Intellectual Property & Digital Rights
          </h2>
          <p>
            Readers are granted a personal, non-commercial, revocable digital reading
            license for purchased novels. Unauthorized reproduction, web scraping,
            commercial redistribution, or circumvention of content protections is
            strictly prohibited.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            6. Reader Appreciation Gifts (&quot;Tips&quot;) — Draft, Pending Legal Review
          </h2>
          <p>
            Readers may voluntarily send direct monetary gifts (&quot;Tips&quot;) to eligible authors as a token of appreciation. Tips are 100% voluntary, non-refundable gifts. A tip unlocks no novel, chapter, digital file, or special platform privilege.
          </p>
          <p>
            UNB Premium charges 0% platform commission on tips and never receives, touches, or holds tip funds. Readers transfer tips directly to the author&apos;s verified payment account outside the platform. Authors may never solicit, demand, or promise content or privileges in exchange for tips.
          </p>
        </section>
      </div>

      {/* Footer Banner */}
      <div className="pt-6 border-t border-border text-[11px] text-secondary text-center">
        Note: This is a draft policy document pending final legal qualification under Pakistani digital commerce laws.
      </div>
    </div>
  );
}
