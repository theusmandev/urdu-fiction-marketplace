import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { generateNovelSlug } from "../src/lib/text/slug-generator.ts";
import { createNovelFormSchema } from "../src/lib/writer/schemas.ts";

describe("SEO Phase 4 — Slugs, Redirects, Content & Link Graph Verification", () => {
  it("generateNovelSlug produces clean, lowercased, hyphenated Latin slugs from English/Roman titles", () => {
    assert.equal(generateNovelSlug("Peer-e-Kamil"), "peer-e-kamil");
    assert.equal(generateNovelSlug("Jannat Kay Pattay!"), "jannat-kay-pattay");
    assert.equal(generateNovelSlug("Namal: The Hidden Truth"), "namal-the-hidden-truth");
  });

  it("generateNovelSlug produces novel-<seed> fallback for empty or non-Latin Urdu-only inputs", () => {
    const slug1 = generateNovelSlug(null, "abc12345");
    assert.equal(slug1, "novel-abc12345");

    const slug2 = generateNovelSlug("پیرِ کامل", "seed9999");
    assert.equal(slug2, "novel-seed9999");
  });

  it("createNovelFormSchema enforces Latin/alphanumeric characters in title_english to prevent novel-<hex> fallback", () => {
    const schema = createNovelFormSchema();

    // Valid Roman Urdu title
    const valid = schema.safeParse({
      title_urdu: "پیرِ کامل",
      title_english: "Peer-e-Kamil",
      synopsis_urdu: "ایک خوبصورت اور روحانی اردو ناول کا خلاصہ۔",
      price_pkr: 200,
      genre_ids: ["b1a03e63-3025-4eda-85ee-62004453e18a"],
      rights_declaration_accepted: true,
    });
    assert.equal(valid.success, true);

    // Invalid non-Latin / Urdu-only title in English field
    const invalid = schema.safeParse({
      title_urdu: "پیرِ کامل",
      title_english: "پیرِ کامل",
      synopsis_urdu: "ایک خوبصورت اور روحانی اردو ناول کا خلاصہ۔",
      price_pkr: 200,
      genre_ids: ["b1a03e63-3025-4eda-85ee-62004453e18a"],
      rights_declaration_accepted: true,
    });
    assert.equal(invalid.success, false);
    if (!invalid.success) {
      assert.ok(invalid.error.flatten().fieldErrors.title_english);
    }
  });

  it("robots.ts disallows all private administrative and transaction routes", () => {
    const robotsCode = fs.readFileSync(path.resolve("src/app/robots.ts"), "utf8");
    const privatePrefixes = ["/admin", "/writer", "/read", "/api", "/dev"];
    for (const prefix of privatePrefixes) {
      assert.ok(
        robotsCode.includes(prefix),
        `robots.ts must disallow private prefix: ${prefix}`
      );
    }
  });

  it("middleware-or-proxy sets X-Robots-Tag: noindex, nofollow on sensitive auth and protected paths", () => {
    const mwCode = fs.readFileSync(path.resolve("src/lib/supabase/middleware-or-proxy.ts"), "utf8");
    assert.ok(
      mwCode.includes("X-Robots-Tag") && mwCode.includes("noindex, nofollow"),
      "middleware-or-proxy must enforce X-Robots-Tag: noindex, nofollow"
    );
  });

  it("sitemap.ts restricts novel entries to public_novels and includes free preview chapters", () => {
    const sitemapCode = fs.readFileSync(path.resolve("src/app/sitemap.ts"), "utf8");
    assert.ok(
      sitemapCode.includes("public_novels"),
      "sitemap.ts must query public_novels view"
    );
    assert.ok(
      sitemapCode.includes("public_free_preview_chapters"),
      "sitemap.ts must include public_free_preview_chapters"
    );
  });
});
