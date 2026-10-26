import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPublicGenreBySlug } from "../src/lib/supabase/public.ts";
import { siteConfig } from "../src/config/site.ts";

describe("Genre Resolution — Empty Genre vs Missing Genre (404 Prevention)", () => {
  it("resolves all platform featured genres from siteConfig even when unpublished / empty", async () => {
    for (const featured of siteConfig.featuredGenres) {
      const genre = await getPublicGenreBySlug(featured.slug);
      assert.ok(genre, `Expected genre for slug '${featured.slug}' to resolve, but got null`);
      assert.equal(genre.slug, featured.slug);
      assert.equal(genre.name_english, featured.nameEn);
      assert.equal(genre.name_urdu, featured.nameUrdu);
      assert.equal(typeof genre.published_novels_count, "number");
    }
  });

  it("resolves action-adventure (Action & Espionage) with valid structure", async () => {
    const genre = await getPublicGenreBySlug("action-adventure");
    assert.ok(genre);
    assert.equal(genre.slug, "action-adventure");
    assert.equal(genre.name_english, "Action & Espionage");
    assert.equal(genre.name_urdu, "جاسوسی و مہم جوئی");
  });

  it("returns null for non-existent / invalid genre slugs", async () => {
    const nonExistent = await getPublicGenreBySlug("completely-invalid-slug-12345");
    assert.equal(nonExistent, null);

    const emptySlug = await getPublicGenreBySlug("");
    assert.equal(emptySlug, null);
  });
});
