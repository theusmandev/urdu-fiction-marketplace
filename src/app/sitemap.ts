import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import {
  getPublicSupabase,
  getPublicGenres,
  getPublicWriters,
} from "@/lib/supabase/public";

export const revalidate = 3600; // 1 hour sitemap revalidation

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;

  // 1. Static Public Pages
  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/novels",
    "/genres",
    "/writers",
    "/about",
    "/how-it-works",
    "/faq",
    "/contact",
    "/terms",
    "/privacy",
    "/refund-policy",
    "/content-policy",
    "/become-a-writer",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" || route === "/novels" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/novels" ? 0.9 : 0.7,
  }));

  // 2. Dynamic Published Novels
  let novelRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = getPublicSupabase();
    const { data: novels } = await supabase
      .from("public_novels")
      .select("slug, published_at")
      .limit(1000);

    const typedNovels = novels as Array<{ slug: string; published_at: string | null }> | null;
    if (typedNovels) {
      novelRoutes = typedNovels.map((n) => ({
        url: `${baseUrl}/novels/${n.slug}`,
        lastModified: n.published_at ? new Date(n.published_at) : new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
      }));
    }
  } catch {
    // Ignore fetch error in build time
  }

  // 3. Dynamic Active Genres
  let genreRoutes: MetadataRoute.Sitemap = [];
  try {
    const genres = await getPublicGenres();
    genreRoutes = genres.map((g) => ({
      url: `${baseUrl}/genres/${g.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    }));
  } catch {
    // Ignore
  }

  // 4. Dynamic Approved Writers
  let writerRoutes: MetadataRoute.Sitemap = [];
  try {
    const writers = await getPublicWriters(500);
    writerRoutes = writers
      .filter((w) => Boolean(w.username))
      .map((w) => ({
        url: `${baseUrl}/writers/${w.username}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.6,
      }));
  } catch {
    // Ignore
  }

  return [...staticRoutes, ...novelRoutes, ...genreRoutes, ...writerRoutes];
}
