import React from "react";
import type { Metadata } from "next";
import { UrduText } from "@/components/urdu/UrduText";
import { AlertTriangle } from "lucide-react";

export const revalidate = 86400; // 24 hours ISR

export const metadata: Metadata = {
  title: "Privacy Policy — رازداری کی پالیسی",
  description:
    "Privacy Policy explaining how user and payment data is collected, processed, and protected on UNB Premium.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      {/* Legal Status Notice */}
      <div className="p-4 rounded-xl bg-warning/10 border border-warning-border/20 text-warning-text text-xs flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-accent-strong shrink-0" />
        <span className="font-semibold">
          Draft — Pending Formal Legal Review. This document outlines data privacy practices on UNB Premium.
        </span>
      </div>

      {/* Header */}
      <div className="space-y-3 border-b border-border pb-6">
        <h1 className="font-serif text-3xl font-bold text-navy">
          Privacy Policy
        </h1>
        <UrduText as="p" size="lg" className="text-secondary py-0">
          صارفین کے کوائف اور رازداری کی پالیسی
        </UrduText>
        <p className="text-xs text-secondary">
          Last Updated: October 2026
        </p>
      </div>

      {/* Content */}
      <div className="prose prose-slate max-w-none text-xs sm:text-sm text-secondary space-y-6 leading-relaxed">
        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            1. Information We Collect
          </h2>
          <p>
            We collect information you provide directly to us when creating an account,
            submitting a writer application, or processing a payment verification:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2 text-main">
            <li>Account credentials (email address, full name, username).</li>
            <li>Writer profile information (Urdu and English pen names, bio).</li>
            <li>Writer payout details (account titles, masked bank IBANs, mobile wallet numbers).</li>
            <li>Reader transaction proofs (TIDs, payment receipts, sender tail numbers).</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            2. How Information Is Used
          </h2>
          <p>
            Your information is used strictly to provide access to the digital catalog,
            facilitate peer-to-peer payment verification between readers and authors,
            track platform fee obligations, prevent fraudulent transactions,
            and maintain audit logs.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            3. Data Sharing & Security
          </h2>
          <p>
            We never sell, rent, or monetize your personal data. Payment screenshots and
            TIDs are visible only to the involved writer and platform administrators for
            order fulfillment and dispute resolution. Full bank account numbers and IBANs
            are masked in administrative views.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            4. Local Storage & Cookies
          </h2>
          <p>
            We use technical cookies solely for user authentication and session management.
            Your reader preferences (font size, line height, theme, last read chapter)
            are saved locally in your browser&apos;s localStorage and are not transmitted to
            third-party advertising networks.
          </p>
        </section>
      </div>

      {/* Footer Banner */}
      <div className="pt-6 border-t border-border text-[11px] text-secondary text-center">
        Note: This is a draft policy document pending final legal qualification under Pakistani digital data protection standards.
      </div>
    </div>
  );
}
