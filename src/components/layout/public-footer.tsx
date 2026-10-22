import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { UrduText } from "@/components/urdu/UrduText";
import { BookMarked, ShieldCheck, Heart, ArrowUpRight } from "lucide-react";

export function PublicFooter() {
  const currentYear = 2026;

  return (
    <footer className="mt-auto bg-navy text-slate-300 border-t border-navy-light pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main 4-Column Footer Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-700/60">
          
          {/* Brand Info & Mission Statement (2 cols on large) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent text-navy flex items-center justify-center font-bold">
                <BookMarked className="w-6 h-6" />
              </div>
              <div>
                <span className="font-serif text-2xl font-bold text-white tracking-tight">
                  {siteConfig.brandName}
                </span>
                <span
                  dir="rtl"
                  lang="ur"
                  className="block font-urdu text-xs text-accent mt-0.5"
                >
                  {siteConfig.brandNameUrdu}
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed max-w-sm">
              {siteConfig.description}
            </p>

            <UrduText size="sm" className="text-slate-400 max-w-md py-1">
              معیاری اور نایاب اردو ناولز کا مستند مرکز، جہاں قارئین براہ راست اپنے پسندیدہ مصنّفین کی سرپرستی کرتے ہیں۔
            </UrduText>

            {/* Direct Payment Trust Banner */}
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Direct Pay via:</span>
              {siteConfig.supportedPaymentMethods.map((method) => (
                <span
                  key={method.id}
                  className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700"
                >
                  {method.name}
                </span>
              ))}
            </div>
          </div>

          {/* Column: For Readers */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent font-sans">
              For Readers
            </p>
            <ul className="space-y-2.5 text-sm">
              {siteConfig.navigation.footer.readers.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hover:text-white transition-colors flex items-center gap-1 group"
                  >
                    <span>{item.title}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-accent" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column: For Writers */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent font-sans">
              For Writers
            </p>
            <ul className="space-y-2.5 text-sm">
              {siteConfig.navigation.footer.writers.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hover:text-white transition-colors flex items-center gap-1 group"
                  >
                    <span>{item.title}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-accent" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column: Platform & Legal */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent font-sans">
              Trust & Policies
            </p>
            <ul className="space-y-2.5 text-sm">
              {siteConfig.navigation.footer.legal.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hover:text-white transition-colors flex items-center gap-1 group"
                  >
                    <span>{item.title}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-accent" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Bottom Bar: Copyright & Direct Payment Protection Notice */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span>
              All transactions are direct-to-author with writer receipt verification.
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span>© {currentYear} {siteConfig.brandName}. Built with</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 mx-0.5 inline" />
            <span>for Urdu Literature.</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
