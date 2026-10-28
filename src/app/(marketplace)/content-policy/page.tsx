import React from "react";
import type { Metadata } from "next";
import { UrduText } from "@/components/urdu/UrduText";
import { AlertTriangle } from "lucide-react";

export const revalidate = 86400; // 24 hours ISR

export const metadata: Metadata = {
  title: "Content & Copyright Policy — ادارتی و کاپی رائٹ پالیسی",
  description:
    "Editorial and community guidelines governing original Urdu manuscripts, copyright compliance, and prohibited content.",
};

export default function ContentPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      {/* Legal Status Notice */}
      <div className="p-4 rounded-xl bg-warning/10 border border-warning-border/20 text-warning-text text-xs flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-accent-strong shrink-0" />
        <span className="font-semibold">
          Draft — Pending Formal Legal Review. This document outlines manuscript integrity and copyright policies.
        </span>
      </div>

      {/* Header */}
      <div className="space-y-3 border-b border-border pb-6">
        <h1 className="font-serif text-3xl font-bold text-navy">
          Content & Copyright Policy
        </h1>
        <UrduText as="p" size="lg" className="text-secondary py-0">
          ادارتی ضوابط، کاپی رائٹ اور ممنوعہ مواد کی پالیسی
        </UrduText>
        <p className="text-xs text-secondary">
          Last Updated: October 2026
        </p>
      </div>

      {/* Content */}
      <div className="prose prose-slate max-w-none text-xs sm:text-sm text-secondary space-y-6 leading-relaxed">
        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            1. Author Originality & Copyright Ownership
          </h2>
          <p>
            UNB Premium is exclusively a marketplace for original Urdu literature. By
            submitting a novel for publication, authors certify and warrant that:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2 text-main">
            <li>They are the sole original author and legal copyright holder of the work.</li>
            <li>The work does not copy, plagiarize, or infringe upon the intellectual property of any third party.</li>
            <li>They accept the explicit Rights Declaration upon publishing each title.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            2. Strictly Prohibited Content
          </h2>
          <p>
            The following categories of content are strictly prohibited and will result
            in immediate manuscript rejection, novel suspension, and potential author
            disqualification:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2 text-danger-text font-medium">
            <li>Plagiarized, pirated, or unauthorized adaptations of existing publications.</li>
            <li>Hate speech, sectarian incitement, blasphemy, or content violating Pakistani constitutional law.</li>
            <li>Sexually explicit, non-consensual, or unlawful graphic material.</li>
            <li>Defamatory or targeted harassment of real living individuals.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            3. Respect for Religious Orthography & Quranic Verses
          </h2>
          <p>
            Urdu fiction often incorporates classical duas and Quranic quotations in
            Arabic orthography. Authors and the platform maintain strict typographic
            standards ensuring Arabic tashkeel (harakat) and original letter forms are
            never corrupted by indiscriminate automated normalization.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-base sm:text-lg font-bold text-navy">
            4. Takedown Notices & Copyright Enforcement
          </h2>
          <p>
            If you believe your copyrighted literary work has been published on UNB
            Premium without authorization, email us immediately at our official support
            address with proof of original authorship. Verified infringing works are
            suspended within 24 hours.
          </p>
        </section>
      </div>

      {/* Footer Banner */}
      <div className="pt-6 border-t border-border text-[11px] text-secondary text-center">
        Note: This is a draft policy document pending final legal qualification under Pakistani intellectual property regulations.
      </div>
    </div>
  );
}
