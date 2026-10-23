import React from "react";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { BookOpen, Home } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center space-y-6">
      <div className="w-16 h-16 rounded-3xl bg-navy text-accent flex items-center justify-center font-serif text-2xl font-bold shadow-lg">
        404
      </div>

      <div className="space-y-3 max-w-md mx-auto">
        <UrduText
          as="h1"
          size="3xl"
          className="text-navy font-bold leading-[2.2] py-0"
        >
          مطلوبہ صفحہ دستیاب نہیں ہے
        </UrduText>
        <h2 className="font-serif text-xl font-bold text-navy">
          Page Not Found
        </h2>
        <p className="text-xs text-secondary leading-relaxed">
          The novel, author, or page you were looking for could not be found or has
          been moved. You can browse our catalog or explore available genres.
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
      </div>
    </div>
  );
}
