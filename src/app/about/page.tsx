import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { siteConfig } from "@/config/site";
import { Feather, Heart, Smartphone } from "lucide-react";

export const revalidate = 86400; // 24 hours ISR

export const metadata: Metadata = {
  title: "About UNB Premium — Dedicated to Modern Urdu Literature",
  description:
    "Learn about UNB Premium: Pakistan's independent digital fiction marketplace connecting readers directly with Urdu authors.",
};

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      {/* Page Header */}
      <div className="space-y-4 text-center border-b border-border pb-8">
        <span className="text-xs font-semibold text-accent uppercase tracking-wider">
          Our Vision & Heritage
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-navy">
          About {siteConfig.brandName}
        </h1>
        <UrduText
          as="p"
          size="2xl"
          className="text-secondary font-bold leading-[2.2] py-1"
        >
          اردو ادب اور فکشن کے فروغ کے لیے ایک خود مختار علمی پلیٹ فارم
        </UrduText>
      </div>

      {/* Mission Statement */}
      <div className="bg-surface p-6 sm:p-8 rounded-3xl border border-border space-y-4 shadow-sm">
        <h2 className="font-serif text-xl font-bold text-navy">
          Bridging the Gap in Digital Urdu Literature
        </h2>
        <p className="text-sm text-secondary leading-relaxed">
          For decades, Urdu fiction readers in Pakistan and worldwide have struggled with
          scanned PDFs, unformatted piracy, and lack of direct compensation for the
          authors whose stories touch their hearts. Meanwhile, talented Pakistani
          novelists have had few reliable avenues to earn a sustainable livelihood from
          their writing.
        </p>
        <p className="text-sm text-secondary leading-relaxed">
          <strong>UNB Premium</strong> was founded with a singular purpose: to provide
          a clean, beautiful, Nastaliq-first digital marketplace where readers pay authors
          directly using ubiquitous Pakistani payment rails (JazzCash, EasyPaisa, Raast,
          and Bank Accounts).
        </p>
      </div>

      {/* Core Principles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 text-navy flex items-center justify-center font-bold">
            <Smartphone className="w-5 h-5 text-accent" />
          </div>
          <h3 className="font-serif text-base font-bold text-navy">
            100% Direct Payments
          </h3>
          <p className="text-xs text-secondary leading-relaxed">
            The platform never acts as a payment escrow or wallet. Readers transfer funds
            directly to the author&apos;s personal mobile wallet or bank account.
          </p>
        </div>

        <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-navy text-accent flex items-center justify-center font-bold">
            <Feather className="w-5 h-5 text-accent" />
          </div>
          <h3 className="font-serif text-base font-bold text-navy">
            Writer Autonomy
          </h3>
          <p className="text-xs text-secondary leading-relaxed">
            Authors keep up to 80% of novel sales, set their own pricing, retain 100% of
            their copyright, and interact transparently with their readers.
          </p>
        </div>

        <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold">
            <Heart className="w-5 h-5 text-emerald-600" />
          </div>
          <h3 className="font-serif text-base font-bold text-navy">
            Nastaliq Elegance
          </h3>
          <p className="text-xs text-secondary leading-relaxed">
            Engineered with first-class RTL Urdu rendering, preserving Islamic quotations,
            safe letter normalization, and customized line heights for optimal reading.
          </p>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="p-8 rounded-3xl bg-ivory/60 border border-border text-center space-y-4">
        <h3 className="font-serif text-lg font-bold text-navy">
          Join the Movement for Independent Urdu Fiction
        </h3>
        <p className="text-xs text-secondary max-w-lg mx-auto">
          Whether you are an avid reader seeking gripping stories or an author ready
          to publish your manuscript, UNB Premium is your home.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/novels"
            className="inline-flex items-center gap-1.5 bg-navy text-accent font-semibold px-5 py-2.5 rounded-xl text-xs hover:bg-navy-light transition-colors"
          >
            <span>Browse All Novels</span>
          </Link>
          <Link
            href="/become-a-writer"
            className="inline-flex items-center gap-1.5 bg-white text-navy font-semibold px-5 py-2.5 rounded-xl text-xs border border-border hover:bg-ivory transition-colors"
          >
            <span>Publish Your Novel</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
