import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { getPublicGenres } from "@/lib/supabase/public";
import { BookOpen } from "lucide-react";

export const revalidate = 300; // 5 minutes ISR revalidation

export const metadata: Metadata = {
  title: "Literary Genres — اصنافِ ادب",
  description:
    "Explore Urdu fiction genres: Romantic & Social, Mystery & Thriller, Historical & Classical, Fantasy & Tales, and Literary Fiction.",
};

export default async function GenresIndexPage() {
  const genres = await getPublicGenres();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      {/* Page Title */}
      <div className="space-y-3 border-b border-border pb-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-accent uppercase tracking-wider">
              Literary Taxonomy
            </span>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-navy">
              Urdu Fiction Genres
            </h1>
          </div>
          <UrduText
            as="p"
            size="2xl"
            className="text-secondary font-normal leading-[2.2] py-0"
          >
            اصنافِ ادب اور موضوعات
          </UrduText>
        </div>
        <p className="text-sm text-secondary max-w-2xl">
          Browse digital Urdu literature classified by themes, literary traditions,
          and genres.
        </p>
      </div>

      {/* Genres Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {genres.map((genre) => (
          <Link
            key={genre.id}
            href={`/genres/${genre.slug}`}
            className="group bg-surface hover:bg-navy p-6 rounded-2xl border border-border hover:border-navy shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-accent/20 group-hover:bg-accent text-navy flex items-center justify-center font-bold transition-colors">
                <BookOpen className="w-5 h-5 text-accent group-hover:text-navy" />
              </div>

              <UrduText
                as="h2"
                size="xl"
                className="text-navy group-hover:text-accent font-normal py-0 leading-[2.2]"
              >
                {genre.name_urdu}
              </UrduText>

              <h3 className="font-serif text-base font-semibold text-secondary group-hover:text-white transition-colors">
                {genre.name_english}
              </h3>
            </div>

            <div className="pt-4 border-t border-border group-hover:border-white/15 flex items-center justify-between text-xs text-secondary group-hover:text-text-muted">
              <span>{genre.published_novels_count} {genre.published_novels_count === 1 ? "novel" : "novels"}</span>
              <span className="font-medium text-accent group-hover:text-accent-light">
                Explore →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
