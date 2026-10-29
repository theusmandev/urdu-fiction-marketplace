"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AlertCircle, RotateCcw, Home } from "lucide-react";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected client runtime errors
    console.error("Unhandled Application Error:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center space-y-6">
      <Link href="/" aria-label="UNB Premium — home" className="hover:opacity-95 transition-opacity">
        <BrandLogo variant="full" size={80} />
      </Link>
      <div className="w-16 h-16 rounded-3xl bg-danger-soft border border-danger-border text-danger-text flex items-center justify-center shadow-sm">
        <AlertCircle className="w-8 h-8" />
      </div>

      <div className="space-y-3 max-w-md mx-auto">
        <UrduText
          as="h1"
          size="2xl"
          className="text-navy font-bold leading-[2.2] py-0"
        >
          غیر متوقع تکنیکی مسئلہ پیش آیا ہے
        </UrduText>
        <h2 className="font-serif text-xl font-bold text-navy">
          Something went wrong
        </h2>
        <p className="text-xs text-secondary leading-relaxed">
          An error occurred while loading this page. Our technical team has been
          notified. You can attempt to reload the view or return to the homepage.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 bg-navy text-accent font-semibold px-5 py-2.5 rounded-xl text-xs hover:bg-navy-light transition-colors shadow-sm cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-white text-navy font-semibold px-5 py-2.5 rounded-xl text-xs border border-border hover:bg-ivory transition-colors"
        >
          <Home className="w-4 h-4" />
          <span>Return Home</span>
        </Link>
      </div>
    </div>
  );
}
