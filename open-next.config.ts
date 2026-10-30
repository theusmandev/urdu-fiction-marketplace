import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

/**
 * OpenNext Cloudflare Adapter Configuration
 *
 * Caching & Revalidation Architecture:
 * - Incremental Cache: Cloudflare R2 bucket binding (`NEXT_INC_CACHE_R2_BUCKET`).
 *   Provides multi-region consistent storage for ISR/fetch cache with 1M free Class A
 *   writes/month (vs KV's 1k writes/day limit).
 * - Tag Cache: Cloudflare D1 SQL binding (`NEXT_TAG_CACHE_D1`).
 *   Powers `revalidateTag` & `revalidatePath` on the Workers Free tier (5M reads/day,
 *   100k writes/day free; avoids paid Durable Objects).
 * - Edge Cache Purge: Configured via direct Cloudflare API purge when
 *   CACHE_PURGE_ZONE_ID and CACHE_PURGE_API_TOKEN are set in runtime secrets.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: d1NextTagCache,
  enableCacheInterception: false,
});
