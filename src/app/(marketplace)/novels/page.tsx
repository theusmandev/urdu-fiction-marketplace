import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { NovelCard } from "@/components/catalog/NovelCard";
import { CatalogFilters } from "@/components/catalog/CatalogFilters";
import {
  parseCatalogParams,
  buildCatalogUrl,
} from "@/lib/catalog/params";
import {
  searchPublicNovels,
  getPublicGenres,
} from "@/lib/supabase/public";
import { BookMarked, ChevronLeft, ChevronRight } from "lucide-react";

export const revalidate = 60; // 60 seconds ISR revalidation

interface NovelsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: NovelsPageProps): Promise<Metadata> {
  const resolved = await searchParams;
  const params = parseCatalogParams(resolved);

  const title = params.q
    ? `Search: "${params.q}" — Urdu Novels Catalog`
    : params.genre
    ? `Browse ${params.genre} Urdu Novels`
    : "Browse Urdu Fiction & Novels Catalog";

  const description =
    "Explore independent Pakistani Urdu novels. Direct reader-to-writer payments via JazzCash, EasyPaisa, and Bank Transfer with instant chapter access.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function NovelsPage({ searchParams }: NovelsPageProps) {
  const resolvedParams = await searchParams;
  const params = parseCatalogParams(resolvedParams);

  const [{ novels, totalCount }, genres] = await Promise.all([
    searchPublicNovels(params),
    getPublicGenres(),
  ]);

  const totalPages = Math.ceil(totalCount / params.limit) || 1;
  const currentPage = params.page;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page Header */}
      <div className="space-y-3 border-b border-border pb-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-accent uppercase tracking-wider">
              Literary Catalog
            </span>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-navy">
              Explore All Urdu Novels
            </h1>
          </div>
          <UrduText
            as="p"
            size="xl"
            className="text-secondary font-normal leading-[2.2] py-0"
          >
            معیاری اردو ناولز اور افسانوں کی مکمل فہرست
          </UrduText>
        </div>
      </div>

      {/* Interactive Filters & Search Component */}
      <CatalogFilters
        initialParams={params}
        genres={genres}
        totalCount={totalCount}
      />

      {/* Novel Cards Grid */}
      {novels.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {novels.map((novel) => (
            <NovelCard key={novel.id} novel={novel} />
          ))}
        </div>
      ) : (
        <div className="p-16 text-center bg-ivory/50 rounded-2xl border border-dashed border-border space-y-4">
          <BookMarked className="w-12 h-12 text-secondary/70 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-navy">
              No novels matched your search criteria
            </h3>
            <UrduText size="sm" className="text-secondary py-0 font-normal">
              آپ کے مطلوبہ معیار کے مطابق کوئی ناول نہیں ملا۔
            </UrduText>
          </div>
          <p className="text-xs text-secondary max-w-md mx-auto">
            Try adjusting your search keywords, clearing genre filters, or resetting
            the price range.
          </p>
          <Link
            href="/novels"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy bg-white hover:bg-ivory border border-border px-4 py-2 min-h-[44px] rounded-lg shadow-sm transition-colors"
          >
            <span>Reset All Filters</span>
          </Link>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <nav
          aria-label="Catalog Pagination"
          className="pt-8 border-t border-border flex items-center justify-between gap-4 text-xs font-medium"
        >
          <div>
            <span className="text-secondary">
              Page {currentPage} of {totalPages} ({totalCount} total)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={buildCatalogUrl("/novels", {
                  ...params,
                  page: currentPage - 1,
                })}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] bg-surface hover:bg-ivory border border-border rounded-lg text-main transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </Link>
            ) : (
              <span className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] text-secondary/40 border border-border/40 rounded-lg cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </span>
            )}

            {currentPage < totalPages ? (
              <Link
                href={buildCatalogUrl("/novels", {
                  ...params,
                  page: currentPage + 1,
                })}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] bg-surface hover:bg-ivory border border-border rounded-lg text-main transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <span className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] text-secondary/40 border border-border/40 rounded-lg cursor-not-allowed">
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
