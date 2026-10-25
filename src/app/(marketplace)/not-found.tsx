import React from "react";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { BookOpen, Home, CreditCard, HelpCircle, LifeBuoy } from "lucide-react";

export default function MarketplaceNotFoundPage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center space-y-6">
      <div className="w-16 h-16 rounded-3xl bg-navy text-accent flex items-center justify-center font-serif text-2xl font-bold shadow-lg">
        404
      </div>

      <div className="space-y-3 max-w-lg mx-auto">
        <UrduText
          as="h1"
          size="3xl"
          className="text-navy leading-[2.2] py-0"
        >
          صفحہ یا معلومات دستیاب نہیں ہیں
        </UrduText>
        <h2 className="font-serif text-xl sm:text-2xl font-bold text-navy">
          Page or Content Not Found
        </h2>
        <p className="text-xs sm:text-sm text-secondary leading-relaxed">
          The link you followed may be incorrect, the address might have changed, or the requested
          novel, author, or order record does not exist or has been unpublished.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-navy text-accent font-semibold px-5 py-2.5 rounded-xl text-xs hover:bg-navy-light transition-colors shadow-sm"
        >
          <Home className="w-4 h-4" />
          <span>Return Home</span>
        </Link>
        <Link
          href="/novels"
          className="inline-flex items-center gap-2 bg-white text-navy font-semibold px-5 py-2.5 rounded-xl text-xs border border-border hover:bg-ivory transition-colors"
        >
          <BookOpen className="w-4 h-4 text-accent" />
          <span>Browse All Novels</span>
        </Link>
        <Link
          href="/how-to-pay"
          className="inline-flex items-center gap-2 bg-white text-navy font-semibold px-5 py-2.5 rounded-xl text-xs border border-border hover:bg-ivory transition-colors"
        >
          <CreditCard className="w-4 h-4 text-accent" />
          <span>Payment Guide</span>
        </Link>
        <Link
          href="/faq"
          className="inline-flex items-center gap-2 bg-white text-navy font-semibold px-5 py-2.5 rounded-xl text-xs border border-border hover:bg-ivory transition-colors"
        >
          <HelpCircle className="w-4 h-4 text-accent" />
          <span>Reader FAQ</span>
        </Link>
        <Link
          href="/support"
          className="inline-flex items-center gap-2 bg-white text-navy font-semibold px-5 py-2.5 rounded-xl text-xs border border-border hover:bg-ivory transition-colors"
        >
          <LifeBuoy className="w-4 h-4 text-accent" />
          <span>Support Desk</span>
        </Link>
      </div>
    </div>
  );
}
