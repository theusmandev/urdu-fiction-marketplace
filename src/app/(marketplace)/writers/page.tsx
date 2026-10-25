import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { getPublicWriters } from "@/lib/supabase/public";
import {
  Feather,
  BookOpen,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
} from "lucide-react";

export const revalidate = 300; // 5 minutes ISR revalidation

export const metadata: Metadata = {
  title: "Featured Authors & Publish Your Novels — اردو ناول نگار",
  description:
    "Discover independent Pakistani Urdu novelists and learn how to publish your fiction with direct reader-to-writer payments via JazzCash and EasyPaisa.",
};

export default async function WritersDirectoryPage() {
  const writers = await getPublicWriters(24);

  return (
    <div className="space-y-16 py-12">
      {/* Hero: Writer Recruitment & Mission */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-navy via-navy to-[#18263E] text-white rounded-3xl p-8 md:p-14 border border-white/10 shadow-2xl space-y-6">
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider bg-accent/20 text-accent px-3 py-1 rounded-full border border-accent/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>For Pakistani Urdu Authors</span>
            </span>

            <UrduText
              as="h1"
              size="4xl"
              className="text-white drop-shadow-md py-1 leading-[2.2] md:text-5xl"
            >
              اپنے اردو ناولز اور افسانے براہ راست قارئین تک پہنچائیں
            </UrduText>

            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              Publish independently on Pakistan&apos;s dedicated digital literature
              platform. Keep up to 80% of novel sales, receive direct payments into
              your JazzCash, EasyPaisa, or Bank Account, and retain full copyright
              ownership.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-4">
              <Link
                href="/become-a-writer"
                className="inline-flex items-center gap-2 bg-accent hover:bg-accent-light text-navy font-bold px-6 py-3.5 rounded-xl shadow-lg transition-all text-sm"
              >
                <Feather className="w-4 h-4" />
                <span>Apply to Become a Writer</span>
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-3.5 rounded-xl border border-white/20 transition-all text-sm"
              >
                <span>How Author Verification Works</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Writer Benefits Highlights */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent-dark flex items-center justify-center font-bold">
              <Smartphone className="w-5 h-5 text-accent" />
            </div>
            <h3 className="font-serif text-lg font-bold text-navy">
              Direct Payments
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Readers pay you directly via JazzCash, EasyPaisa, Raast, or Bank IBAN.
              You verify payments yourself before granting novel access.
            </p>
          </div>

          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-navy text-accent flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5 text-accent" />
            </div>
            <h3 className="font-serif text-lg font-bold text-navy">
              100% Rights Retained
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              You own your copyright and intellectual property completely. Non-exclusive
              digital publishing gives you full freedom.
            </p>
          </div>

          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold">
              <UserCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-serif text-lg font-bold text-navy">
              Urdu-First Studio
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Built-in chapter manuscript parser (.docx/.txt), safe Urdu text cleaning,
              Quranic quotation protection, and word counting.
            </p>
          </div>
        </div>
      </section>

      {/* Directory of Published Authors */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-accent uppercase tracking-wider">
              Authors Directory
            </span>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-navy">
              Published Pakistani Authors
            </h2>
          </div>
          <UrduText size="base" className="text-secondary py-0">
            پلیٹ فارم کے تصدیق شدہ ناول نگار
          </UrduText>
        </div>

        {writers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {writers.map((writer) => (
              <Link
                key={writer.id}
                href={writer.username ? `/writers/${writer.username}` : "#"}
                className="group bg-surface hover:bg-navy p-6 rounded-2xl border border-border hover:border-navy shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  {writer.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={writer.avatar_url}
                      alt={writer.pen_name_english}
                      className="w-14 h-14 rounded-full object-cover border border-border group-hover:border-accent shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-ivory group-hover:bg-white/10 text-navy group-hover:text-accent font-serif font-bold text-xl flex items-center justify-center border border-border shrink-0">
                      {writer.pen_name_english.charAt(0)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <UrduText
                      as="h3"
                      size="lg"
                      className="text-navy group-hover:text-accent font-bold py-0 leading-[2.2] truncate"
                    >
                      {writer.pen_name_urdu}
                    </UrduText>
                    <p className="font-serif text-xs text-secondary group-hover:text-slate-300 font-medium truncate">
                      {writer.pen_name_english}
                    </p>
                  </div>
                </div>

                {writer.bio_urdu && (
                  <p
                    dir="rtl"
                    lang="ur"
                    className="font-urdu text-xs text-secondary/90 group-hover:text-slate-300 line-clamp-2 leading-[2] text-right"
                  >
                    {writer.bio_urdu}
                  </p>
                )}

                <div className="pt-3 border-t border-border group-hover:border-white/15 flex items-center justify-between text-xs text-secondary group-hover:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-accent" />
                    <span>
                      {writer.published_novels_count}{" "}
                      {writer.published_novels_count === 1 ? "novel" : "novels"}
                    </span>
                  </div>
                  <span className="font-medium text-accent group-hover:text-accent-light">
                    View Works →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-16 text-center bg-ivory/50 rounded-2xl border border-dashed border-border space-y-3">
            <Feather className="w-12 h-12 text-secondary/60 mx-auto" />
            <h3 className="text-base font-bold text-navy">
              No published authors listed yet
            </h3>
            <UrduText size="sm" className="text-secondary py-0">
              مصنفین کے ناولز شائع ہوتے ہی یہاں فہرست ظاہر ہو جائے گی۔
            </UrduText>
            <div className="pt-2">
              <Link
                href="/become-a-writer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy bg-white hover:bg-ivory border border-border px-4 py-2 rounded-lg shadow-sm"
              >
                <span>Be the First to Publish</span>
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
