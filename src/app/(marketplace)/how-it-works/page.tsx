import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { ShieldCheck, ArrowRight } from "lucide-react";

export const revalidate = 86400; // 24 hours ISR

export const metadata: Metadata = {
  title: "How Direct Payment & Verification Works — طریقہ کار",
  description:
    "Learn how UNB Premium connects readers and writers with transparent direct payments via JazzCash, EasyPaisa, Raast, and Bank IBAN.",
};

export default function HowItWorksPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
      {/* Header */}
      <div className="space-y-4 text-center border-b border-border pb-8">
        <span className="text-xs font-semibold text-accent uppercase tracking-wider">
          Complete Transparency
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-navy">
          How Direct Payment & Verification Works
        </h1>
        <UrduText
          as="p"
          size="2xl"
          className="text-secondary leading-[2.2] py-1"
        >
          براہ راست ادائیگی اور تصدیق کا شفاف اور آسان طریقہ کار
        </UrduText>
      </div>

      {/* Reader Flow */}
      <section className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-navy text-accent flex items-center justify-center font-bold text-sm">
            1
          </div>
          <h2 className="font-serif text-2xl font-bold text-navy">
            For Readers: Unlocking a Novel
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-accent/20 text-navy flex items-center justify-center font-bold text-xs">
              Step 1
            </div>
            <h3 className="font-serif text-base font-bold text-navy">
              Select Payment Method
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Choose the author&apos;s verified JazzCash, EasyPaisa, Raast, or Bank IBAN
              at checkout. The exact account details and title are displayed.
            </p>
          </div>

          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-accent/20 text-navy flex items-center justify-center font-bold text-xs">
              Step 2
            </div>
            <h3 className="font-serif text-base font-bold text-navy">
              Transfer Funds & Submit TID
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Send the exact PKR amount from your banking or wallet app. Submit your
              Transaction Reference (TID) and payment receipt screenshot. (See our{' '}
              <Link href="/how-to-pay" className="text-navy font-semibold underline hover:text-accent">
                Step-by-Step Payment Guide
              </Link>
              ).
            </p>
          </div>

          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-accent/20 text-navy flex items-center justify-center font-bold text-xs">
              Step 3
            </div>
            <h3 className="font-serif text-base font-bold text-navy">
              Author Verifies & Delivers
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              The writer verifies the bank or wallet credit and approves your order.
              All novel chapters are instantly unlocked in your library.
            </p>
          </div>
        </div>
      </section>

      {/* Author Flow */}
      <section className="space-y-8 pt-8 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent text-navy flex items-center justify-center font-bold text-sm">
            2
          </div>
          <h2 className="font-serif text-2xl font-bold text-navy">
            For Authors: Publishing & Getting Paid
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-navy text-accent flex items-center justify-center font-bold text-xs">
              Step 1
            </div>
            <h3 className="font-serif text-base font-bold text-navy">
              Configure Payment Accounts
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Add your verified Pakistani payment methods (JazzCash, EasyPaisa, Raast,
              or Bank IBAN) in the Writer Studio.
            </p>
          </div>

          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-navy text-accent flex items-center justify-center font-bold text-xs">
              Step 2
            </div>
            <h3 className="font-serif text-base font-bold text-navy">
              Publish Your Novel
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Upload manuscripts, define free preview chapters, set your price, and submit
              for rapid quality review.
            </p>
          </div>

          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-navy text-accent flex items-center justify-center font-bold text-xs">
              Step 3
            </div>
            <h3 className="font-serif text-base font-bold text-navy">
              Direct Money in Your Pocket
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              100% of reader payments land directly in your account. You verify receipts
              in one click, and platform fee (20%) is tracked transparently.
            </p>
          </div>
        </div>
      </section>

      {/* The Platform's Invariant Role */}
      <section className="bg-ivory/60 p-8 rounded-3xl border border-border space-y-4">
        <div className="flex items-center gap-2 text-navy font-bold text-base">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <span>The Platform Invariant & Neutrality</span>
        </div>
        <p className="text-xs text-secondary leading-relaxed">
          UNB Premium does <strong>not</strong> operate a financial wallet, escrow service,
          or credit card processing gateway. Money moves strictly peer-to-peer between the
          reader&apos;s banking app and the author&apos;s verified Pakistani account. The
          platform provides the secure digital reading reader, cloud manuscript delivery,
          anti-piracy protections, and impartial dispute resolution.
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <Link
          href="/how-to-pay"
          className="inline-flex items-center gap-2 bg-navy text-accent font-semibold px-6 py-3.5 rounded-xl text-xs hover:bg-navy-light shadow-md transition-all"
        >
          <span>Read Step-by-Step Payment Guide</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/novels"
          className="inline-flex items-center gap-2 bg-white text-navy font-semibold px-6 py-3.5 rounded-xl text-xs border border-border hover:bg-ivory shadow-sm transition-all"
        >
          <span>Explore Published Novels</span>
          <ArrowRight className="w-4 h-4 text-accent" />
        </Link>
      </div>
    </div>
  );
}
