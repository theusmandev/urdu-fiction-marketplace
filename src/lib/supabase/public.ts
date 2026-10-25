import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  PublicNovel,
  PublicWriter,
  PublicGenre,
  PublicFreePreviewChapter,
  PublicNovelChapterMeta,
  PublicNovelSearchResult,
} from "@/types/database";
import type { CatalogSearchParams } from "@/lib/catalog/params";

let cachedPublicClient: SupabaseClient | null = null;

/**
 * Returns a cookie-free, anonymous Supabase client strictly for reading public data.
 * Ideal for Next.js SSG / ISR pages to prevent dynamic rendering bailouts.
 */
export function getPublicSupabase(): SupabaseClient {
  if (cachedPublicClient) return cachedPublicClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  cachedPublicClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedPublicClient;
}

/**
 * Fetches featured novels for the homepage showcase.
 */
export async function getFeaturedNovels(limit = 6): Promise<PublicNovel[]> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("public_novels")
      .select("*")
      .eq("is_featured", true)
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[getFeaturedNovels] query error:", error.code, error.message);
      return [];
    }
    if (!data) return [];
    return data as PublicNovel[];
  } catch (err) {
    console.error("[getFeaturedNovels] unexpected error:", err);
    return [];
  }
}

/**
 * Fetches newest releases for homepage and discovery.
 */
export async function getNewestNovels(limit = 8): Promise<PublicNovel[]> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("public_novels")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[getNewestNovels] query error:", error.code, error.message);
      return [];
    }
    if (!data) return [];
    return data as PublicNovel[];
  } catch (err) {
    console.error("[getNewestNovels] unexpected error:", err);
    return [];
  }
}

/**
 * Fetches active genres with real published novel counts.
 */
export async function getPublicGenres(): Promise<PublicGenre[]> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("public_genres")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("[getPublicGenres] query error:", error.code, error.message);
      return [];
    }
    if (!data) return [];
    return data as PublicGenre[];
  } catch (err) {
    console.error("[getPublicGenres] unexpected error:", err);
    return [];
  }
}

/**
 * Fetches a single active genre by slug.
 */
export async function getPublicGenreBySlug(slug: string): Promise<PublicGenre | null> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("public_genres")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("[getPublicGenreBySlug] query error:", error.code, error.message);
      return null;
    }
    if (!data) return null;
    return data as PublicGenre;
  } catch (err) {
    console.error("[getPublicGenreBySlug] unexpected error:", err);
    return null;
  }
}

/**
 * Fetches a published novel by slug, with fallback check for novel id.
 */
export async function getPublicNovelBySlug(slug: string): Promise<PublicNovel | null> {
  try {
    const supabase = getPublicSupabase();
    // 1. Try slug match
    const { data: novelBySlug, error: slugErr } = await supabase
      .from("public_novels")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (slugErr) {
      console.error("[getPublicNovelBySlug] slug query error:", slugErr.code, slugErr.message);
    } else if (novelBySlug) {
      return novelBySlug as PublicNovel;
    }

    // 2. Fallback: check if slug is a UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slug
    );
    if (isUuid) {
      const { data: novelById, error: idErr } = await supabase
        .from("public_novels")
        .select("*")
        .eq("id", slug)
        .maybeSingle();

      if (idErr) {
        console.error("[getPublicNovelBySlug] id fallback query error:", idErr.code, idErr.message);
      } else if (novelById) {
        return novelById as PublicNovel;
      }
    }

    return null;
  } catch (err) {
    console.error("[getPublicNovelBySlug] unexpected error:", err);
    return null;
  }
}

/**
 * Fetches novel chapters for table of contents (metadata only, no content).
 */
export async function getPublicNovelChapters(
  novelSlug: string
): Promise<PublicNovelChapterMeta[]> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase.rpc("get_public_novel_chapters", {
      p_novel_slug: novelSlug,
    });

    if (error) {
      console.error("[getPublicNovelChapters] RPC get_public_novel_chapters error:", error);
      return [];
    }
    if (!data) return [];
    return data as PublicNovelChapterMeta[];
  } catch (err) {
    console.error("[getPublicNovelChapters] Caught unexpected error:", err);
    return [];
  }
}

/**
 * Fetches a published free preview chapter. Returns null if chapter is paid or non-preview.
 */
export async function getFreePreviewChapter(
  novelSlug: string,
  chapterNumber: number
): Promise<PublicFreePreviewChapter | null> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("public_free_preview_chapters")
      .select("*")
      .eq("novel_slug", novelSlug)
      .eq("chapter_number", chapterNumber)
      .maybeSingle();

    if (error) {
      console.error("[getFreePreviewChapter] query error:", error.code, error.message);
      return null;
    }
    if (!data) return null;
    return data as PublicFreePreviewChapter;
  } catch (err) {
    console.error("[getFreePreviewChapter] unexpected error:", err);
    return null;
  }
}

/**
 * Fetches public writers directory (approved writers with >= 1 published novel).
 */
export async function getPublicWriters(limit = 24): Promise<PublicWriter[]> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("public_writers")
      .select("*")
      .order("published_novels_count", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[getPublicWriters] query error:", error.code, error.message);
      return [];
    }
    if (!data) return [];
    return data as PublicWriter[];
  } catch (err) {
    console.error("[getPublicWriters] unexpected error:", err);
    return [];
  }
}

/**
 * Fetches a single public writer profile by username.
 */
export async function getPublicWriterByUsername(
  username: string
): Promise<PublicWriter | null> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("public_writers")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("[getPublicWriterByUsername] query error:", error.code, error.message);
      return null;
    }
    if (!data) return null;
    return data as PublicWriter;
  } catch (err) {
    console.error("[getPublicWriterByUsername] unexpected error:", err);
    return null;
  }
}

/**
 * Fetches all published novels by a specific author.
 */
export async function getNovelsByWriter(writerId: string): Promise<PublicNovel[]> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("public_novels")
      .select("*")
      .eq("writer_id", writerId)
      .order("published_at", { ascending: false });

    if (error) {
      console.error("[getNovelsByWriter] query error:", error.code, error.message);
      return [];
    }
    if (!data) return [];
    return data as PublicNovel[];
  } catch (err) {
    console.error("[getNovelsByWriter] unexpected error:", err);
    return [];
  }
}

/**
 * Searches published novels using database RPC search_public_novels.
 */
export async function searchPublicNovels(
  params: CatalogSearchParams
): Promise<{ novels: PublicNovel[]; totalCount: number }> {
  try {
    const supabase = getPublicSupabase();
    const offset = (params.page - 1) * params.limit;

    const { data, error } = await supabase.rpc("search_public_novels", {
      p_query: params.q || null,
      p_genre_slug: params.genre || null,
      p_sort: params.sort || "featured",
      p_limit: params.limit,
      p_offset: offset,
    });

    if (error) {
      console.error("[searchPublicNovels] RPC error:", error.code, error.message);
      return { novels: [], totalCount: 0 };
    }
    if (!data) {
      return { novels: [], totalCount: 0 };
    }

    let results = data as PublicNovelSearchResult[];

    // Additional client-side price filter if requested
    if (params.freeOnly) {
      results = results.filter((n) => n.price_pkr === 0);
    } else {
      if (params.minPrice !== undefined) {
        results = results.filter((n) => n.price_pkr >= params.minPrice!);
      }
      if (params.maxPrice !== undefined) {
        results = results.filter((n) => n.price_pkr <= params.maxPrice!);
      }
    }

    const totalCount =
      results.length > 0 && results[0].total_count !== undefined
        ? Number(results[0].total_count)
        : results.length;

    return {
      novels: results,
      totalCount,
    };
  } catch {
    return { novels: [], totalCount: 0 };
  }
}

/**
 * Fetches the platform support email from platform_settings.
 */
export async function getPlatformSupportEmail(): Promise<string> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("support_email")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("[getPlatformSupportEmail] query error:", error.code, error.message);
    }

    const settings = data as { support_email?: string } | null;
    if (settings?.support_email) return settings.support_email;
  } catch (err) {
    console.error("[getPlatformSupportEmail] unexpected error:", err);
  }
  return "support@unbpremium.pk";
}
