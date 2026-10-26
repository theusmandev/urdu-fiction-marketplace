"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { UrduText } from "@/components/urdu/UrduText";
import type { PublicGenre } from "@/types/database";
import {
  type CatalogSearchParams,
  buildCatalogUrl,
} from "@/lib/catalog/params";
import { Search, X } from "lucide-react";

interface CatalogFiltersProps {
  initialParams: CatalogSearchParams;
  genres: PublicGenre[];
  totalCount: number;
}

export function CatalogFilters({
  initialParams,
  genres,
  totalCount,
}: CatalogFiltersProps) {
  const router = useRouter();

  const [q, setQ] = useState(initialParams.q || "");
  const [selectedGenre, setSelectedGenre] = useState(initialParams.genre || "");
  const [sort, setSort] = useState(initialParams.sort || "featured");
  const [freeOnly, setFreeOnly] = useState(initialParams.freeOnly || false);
  const [minPrice, setMinPrice] = useState<string>(
    initialParams.minPrice !== undefined ? String(initialParams.minPrice) : ""
  );
  const [maxPrice, setMaxPrice] = useState<string>(
    initialParams.maxPrice !== undefined ? String(initialParams.maxPrice) : ""
  );

  const applyFilters = (overrides?: Partial<CatalogSearchParams>) => {
    const updated: CatalogSearchParams = {
      q: q.trim() || undefined,
      genre: selectedGenre || undefined,
      sort,
      freeOnly,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      page: 1, // Reset to page 1 on new filter
      limit: initialParams.limit,
      ...overrides,
    };

    router.push(buildCatalogUrl("/novels", updated));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters({ q: q.trim() || undefined });
  };

  const handleGenreClick = (slug: string) => {
    const nextGenre = selectedGenre === slug ? "" : slug;
    setSelectedGenre(nextGenre);
    applyFilters({ genre: nextGenre || undefined });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSort = (e.target.value as "featured" | "newest" | "price_asc" | "price_desc") || "featured";
    setSort(nextSort);
    applyFilters({ sort: nextSort });
  };


  const handleReset = () => {
    setQ("");
    setSelectedGenre("");
    setSort("featured");
    setFreeOnly(false);
    setMinPrice("");
    setMaxPrice("");
    router.push("/novels");
  };

  const hasActiveFilters =
    Boolean(q) ||
    Boolean(selectedGenre) ||
    sort !== "featured" ||
    freeOnly ||
    Boolean(minPrice) ||
    Boolean(maxPrice);

  return (
    <div className="space-y-4 bg-surface p-4 sm:p-5 rounded-2xl border border-border shadow-sm">
      {/* Top Search & Controls Row */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title in English or Urdu, synopsis, or writer pen name..."
            className="w-full pl-10 pr-20 py-2.5 text-base sm:text-sm min-h-[44px] bg-ivory/60 focus:bg-white border border-border focus:border-accent rounded-xl outline-none text-main placeholder:text-secondary/70 focus:ring-2 focus:ring-accent/20 transition-all"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold bg-navy text-accent hover:bg-navy-light px-3 py-2 min-h-[36px] rounded-lg transition-colors cursor-pointer"
          >
            Search
          </button>
        </form>

        {/* Sort Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="catalog-sort" className="text-xs text-secondary whitespace-nowrap">
            Sort by:
          </label>
          <select
            id="catalog-sort"
            value={sort}
            onChange={handleSortChange}
            className="text-base sm:text-xs font-medium bg-ivory/80 border border-border rounded-xl px-3 py-2.5 min-h-[44px] outline-none text-navy focus:border-accent cursor-pointer"
          >
            <option value="featured">Featured / سب سے نمایاں</option>
            <option value="newest">Newest Releases / تازہ ترین</option>
            <option value="price_asc">Price: Low to High / کم ترین قیمت</option>
            <option value="price_desc">Price: High to Low / زیادہ ترین قیمت</option>
          </select>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer min-h-[44px]"
              title="Reset all filters"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Genre Filter Pills */}
      {genres.length > 0 && (
        <div className="pt-2 border-t border-border/60">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-medium text-secondary whitespace-nowrap mr-1">
              Genres:
            </span>
            <button
              type="button"
              onClick={() => handleGenreClick("")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                !selectedGenre
                  ? "bg-navy text-accent shadow-sm"
                  : "bg-ivory/60 hover:bg-ivory text-secondary hover:text-navy border border-border/80"
              }`}
            >
              All Genres
            </button>

            {genres.map((g) => {
              const active = selectedGenre === g.slug;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => handleGenreClick(g.slug)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? "bg-navy text-accent shadow-sm"
                      : "bg-ivory/60 hover:bg-ivory text-secondary hover:text-navy border border-border/80"
                  }`}
                >
                  <span>{g.name_english}</span>
                  <UrduText as="span" size="xs" className="text-accent py-0">
                    {g.name_urdu}
                  </UrduText>
                  {g.published_novels_count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        active ? "bg-white/20 text-white" : "bg-black/5 text-secondary"
                      }`}
                    >
                      {g.published_novels_count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Search & Count Summary */}
      <div className="flex items-center justify-between text-xs text-secondary pt-1">
        <span>
          Showing {totalCount} {totalCount === 1 ? "novel" : "novels"}
          {selectedGenre && ` in ${genres.find((g) => g.slug === selectedGenre)?.name_english || selectedGenre}`}
          {q && ` matching "${q}"`}
        </span>
      </div>
    </div>
  );
}
