import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { getPlatformSupportEmail } from "@/lib/supabase/public";
import { Mail, Clock, ShieldCheck, HelpCircle } from "lucide-react";

export const revalidate = 300; // 5 minutes ISR

export const metadata: Metadata = {
  title: "Contact & Platform Support — رابطہ",
  description:
    "Contact UNB Premium customer support for payment verification assistance, author onboarding inquiries, or content issues.",
};

export default async function ContactPage() {
  const supportEmail = await getPlatformSupportEmail();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      {/* Header */}
      <div className="space-y-4 text-center border-b border-border pb-8">
        <span className="text-xs font-semibold text-accent uppercase tracking-wider">
          Direct Inquiries
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-navy">
          Contact Support
        </h1>
        <UrduText
          as="p"
          size="2xl"
          className="text-secondary font-bold leading-[2.2] py-1"
        >
          مدد اور کسٹمر سپورٹ کے لیے ہم سے رابطہ کریں
        </UrduText>
      </div>

      {/* Official Support Card */}
      <div className="bg-surface p-8 rounded-3xl border border-border shadow-sm space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-navy text-accent flex items-center justify-center font-bold">
            <Mail className="w-7 h-7 text-accent" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-bold text-navy">
              Official Platform Support Email
            </h2>
            <p className="text-xs text-secondary">
              Single authoritative contact point for readers and authors
            </p>
          </div>
        </div>

        <div className="p-4 bg-ivory/60 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="font-mono text-sm sm:text-base font-bold text-navy select-all">
            {supportEmail}
          </span>
          <a
            href={`mailto:${supportEmail}`}
            className="inline-flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-accent text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <span>Open in Email App</span>
          </a>
        </div>

        <div className="space-y-2 text-xs text-secondary leading-relaxed">
          <p>
            When emailing regarding an active novel order or writer verification delay,
            please include:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2 text-navy font-medium">
            <li>Your registered account email address</li>
            <li>The Order Number (e.g. ORD-XXXXXX)</li>
            <li>Your bank or wallet Transaction Reference ID (TID)</li>
            <li>The author or novel title</li>
          </ul>
        </div>
      </div>

      {/* Support Hours & Guidance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-navy">
            <Clock className="w-4 h-4 text-accent" />
            <span>Response Timeframe</span>
          </div>
          <p className="text-xs text-secondary leading-relaxed">
            Support tickets and dispute inquiries are reviewed daily between 09:00 AM
            and 09:00 PM (PKT). Typical response time is under 12 hours.
          </p>
        </div>

        <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-navy">
            <ShieldCheck className="w-4 h-4 text-success" />
            <span>Dispute & Verification Notice</span>
          </div>
          <p className="text-xs text-secondary leading-relaxed">
            If an author has not verified your payment within 24 hours, you can also
            raise an automated dispute directly from your account orders dashboard.
          </p>
        </div>
      </div>

      {/* FAQ Referral */}
      <div className="text-center pt-4">
        <Link
          href="/faq"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-dark transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
          <span>Check Frequently Asked Questions First →</span>
        </Link>
      </div>
    </div>
  );
}
