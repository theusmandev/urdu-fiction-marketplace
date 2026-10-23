/**
 * Catalog parameter parsing, SQL wildcard sanitization, and URL generation utilities.
 */

export interface CatalogSearchParams {
  q?: string;
  genre?: string;
  sort?: "featured" | "newest" | "price_asc" | "price_desc";
  minPrice?: number;
  maxPrice?: number;
  freeOnly?: boolean;
  page: number;
  limit: number;
}

/**
 * Escapes PostgreSQL LIKE/ILIKE wildcards (%, _) and escape character (\)
 * to prevent user input from performing unintended broad pattern matches.
 */
export function escapeSqlLike(term: string): string {
  if (!term) return "";
  return term
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Parses and validates raw searchParams from Next.js page into typed catalog parameters.
 */
export function parseCatalogParams(
  rawParams: Record<string, string | string[] | undefined>
): CatalogSearchParams {
  const getSingle = (val: string | string[] | undefined): string | undefined => {
    if (Array.isArray(val)) return val[0];
    return val;
  };

  const rawQ = getSingle(rawParams.q)?.trim();
  const rawGenre = getSingle(rawParams.genre)?.trim().toLowerCase();
  const rawSort = getSingle(rawParams.sort)?.trim().toLowerCase();
  const rawPage = getSingle(rawParams.page);
  const rawLimit = getSingle(rawParams.limit);
  const rawMinPrice = getSingle(rawParams.minPrice);
  const rawMaxPrice = getSingle(rawParams.maxPrice);
  const rawFreeOnly = getSingle(rawParams.freeOnly);

  let sort: CatalogSearchParams["sort"] = "featured";
  if (
    rawSort === "newest" ||
    rawSort === "price_asc" ||
    rawSort === "price_desc" ||
    rawSort === "featured"
  ) {
    sort = rawSort;
  }

  const page = Math.max(1, parseInt(rawPage || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(rawLimit || "12", 10) || 12));

  let minPrice: number | undefined;
  if (rawMinPrice !== undefined && rawMinPrice !== "") {
    const parsed = parseFloat(rawMinPrice);
    if (!isNaN(parsed) && parsed >= 0) minPrice = parsed;
  }

  let maxPrice: number | undefined;
  if (rawMaxPrice !== undefined && rawMaxPrice !== "") {
    const parsed = parseFloat(rawMaxPrice);
    if (!isNaN(parsed) && parsed >= 0) maxPrice = parsed;
  }

  const freeOnly = rawFreeOnly === "true" || rawFreeOnly === "1";

  return {
    q: rawQ && rawQ.length > 0 ? rawQ : undefined,
    genre: rawGenre && rawGenre.length > 0 ? rawGenre : undefined,
    sort,
    minPrice,
    maxPrice,
    freeOnly,
    page,
    limit,
  };
}

/**
 * Constructs a shareable catalog URL with query parameters.
 */
export function buildCatalogUrl(
  basePath: string,
  params: Partial<CatalogSearchParams>
): string {
  const query = new URLSearchParams();

  if (params.q) query.set("q", params.q);
  if (params.genre) query.set("genre", params.genre);
  if (params.sort && params.sort !== "featured") query.set("sort", params.sort);
  if (params.minPrice !== undefined) query.set("minPrice", params.minPrice.toString());
  if (params.maxPrice !== undefined) query.set("maxPrice", params.maxPrice.toString());
  if (params.freeOnly) query.set("freeOnly", "true");
  if (params.page && params.page > 1) query.set("page", params.page.toString());

  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
