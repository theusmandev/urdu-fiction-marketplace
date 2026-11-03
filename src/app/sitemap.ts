import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import {
  getPublicSupabase,
  getPublicGenres,
  getPublicWriters,
} from "@/lib/supabase/public";

export const revalidate = 3600; // 1 hour sitemap revalidation

const CHUNK_SIZE = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rawBaseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    siteConfig.url ||
    "https://premium.urdunovelbanks.com";
  const baseUrl = rawBaseUrl.replace(/\/$/, "");

  // 1. Static Public Indexable Pages
  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/novels",
    "/genres",
    "/writers",
    "/about",
    "/how-it-works",
    "/how-to-pay",
    "/faq",
    "/contact",
    "/terms",
    "/privacy",
    "/refund-policy",
    "/content-policy",
    "/become-a-writer",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    // Static pages: omit lastModified per search engine guidelines
    changeFrequency: route === "" || route === "/novels" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/novels" ? 0.9 : 0.7,
  }));

  const supabase = getPublicSupabase();
  const rangeStart = 0;
  const rangeEnd = CHUNK_SIZE - 1;

  // 2. Dynamic Published Novels (strictly status = 'published')
  let novelRoutes: MetadataRoute.Sitemap = [];
  const genreLatestPublishedAt: Record<string, string> = {};
  const writerLatestPublishedAt: Record<string, string> = {};

  try {
    const { data: novels, error: novelsError } = await supabase
      .from("public_novels")
      .select("id, slug, published_at, writer_username, genres")
      .range(rangeStart, rangeEnd);

    if (novelsError) {
      console.error("[sitemap] public_novels query error:", novelsError.code, novelsError.message);
    }

    const typedNovels = novels as Array<{
      id: string;
      slug: string;
      published_at: string | null;
      writer_username: string | null;
      genres: Array<{ slug: string }> | null;
    }> | null;

    if (typedNovels) {
      novelRoutes = typedNovels.map((n) => {
        // Collect latest published_at per genre and author in-memory
        if (n.published_at) {
          if (n.writer_username) {
            const prev = writerLatestPublishedAt[n.writer_username];
            if (!prev || n.published_at > prev) {
              writerLatestPublishedAt[n.writer_username] = n.published_at;
            }
          }
          if (Array.isArray(n.genres)) {
            for (const g of n.genres) {
              if (g?.slug) {
                const prev = genreLatestPublishedAt[g.slug];
                if (!prev || n.published_at > prev) {
                  genreLatestPublishedAt[g.slug] = n.published_at;
                }
              }
            }
          }
        }

        return {
          url: `${baseUrl}/novels/${n.slug}`,
          ...(n.published_at ? { lastModified: new Date(n.published_at) } : {}),
          changeFrequency: "weekly" as const,
          priority: 0.8,
        };
      });
    }
  } catch (err) {
    console.error("[sitemap] caught error fetching novels:", err);
  }

  // 3. Dynamic Free Preview Chapters (strictly is_free_preview = true AND published novel)
  let previewRoutes: MetadataRoute.Sitemap = [];
  try {
    const { data: previews, error: previewsError } = await supabase
      .from("public_free_preview_chapters")
      .select("novel_slug, chapter_number, updated_at")
      .range(rangeStart, rangeEnd);

    if (previewsError) {
      console.error("[sitemap] public_free_preview_chapters query error:", previewsError.code, previewsError.message);
    }

    const typedPreviews = previews as Array<{
      novel_slug: string;
      chapter_number: number;
      updated_at: string | null;
    }> | null;

    if (typedPreviews) {
      previewRoutes = typedPreviews.map((p) => ({
        url: `${baseUrl}/novels/${p.novel_slug}/read/${p.chapter_number}`,
        ...(p.updated_at ? { lastModified: new Date(p.updated_at) } : {}),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));
    }
  } catch (err) {
    console.error("[sitemap] caught error fetching preview chapters:", err);
  }

  // 4. Dynamic Active Genres (strictly with >= 1 published novel)
  let genreRoutes: MetadataRoute.Sitemap = [];
  try {
    const genres = await getPublicGenres();
    // Exclude empty genres (0 published novels) from sitemap
    genreRoutes = genres
      .filter((g) => (g.published_novels_count ?? 0) > 0)
      .map((g) => {
        const latestDate = genreLatestPublishedAt[g.slug];
        return {
          url: `${baseUrl}/genres/${g.slug}`,
          ...(latestDate ? { lastModified: new Date(latestDate) } : {}),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        };
      });
  } catch (err) {
    console.error("[sitemap] caught error fetching genres:", err);
  }

  // 5. Dynamic Approved Writers (strictly with >= 1 published novel)
  let writerRoutes: MetadataRoute.Sitemap = [];
  try {
    const writers = await getPublicWriters(5000);
    writerRoutes = writers
      .filter((w) => Boolean(w.username) && (w.published_novels_count ?? 0) > 0)
      .map((w) => {
        const latestDate = w.username ? writerLatestPublishedAt[w.username] : undefined;
        return {
          url: `${baseUrl}/writers/${w.username}`,
          ...(latestDate ? { lastModified: new Date(latestDate) } : {}),
          changeFrequency: "weekly" as const,
          priority: 0.6,
        };
      });
  } catch (err) {
    console.error("[sitemap] caught error fetching writers:", err);
  }

  return [
    ...staticRoutes,
    ...novelRoutes,
    ...previewRoutes,
    ...genreRoutes,
    ...writerRoutes,
  ];
}
