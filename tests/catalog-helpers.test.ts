import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  escapeSqlLike,
  parseCatalogParams,
  buildCatalogUrl,
} from "../src/lib/catalog/params.ts";

describe("Catalog Helpers — Search Sanitization, Param Parsing & URL Builder", () => {
  describe("escapeSqlLike", () => {
    it("safely escapes percentage wildcard (%)", () => {
      const input = "100% pure";
      const escaped = escapeSqlLike(input);
      assert.equal(escaped, "100\\% pure");
    });

    it("safely escapes underscore wildcard (_)", () => {
      const input = "dasht_e_wafa";
      const escaped = escapeSqlLike(input);
      assert.equal(escaped, "dasht\\_e\\_wafa");
    });

    it("safely escapes backslash (\\)", () => {
      const input = "path\\to\\novel";
      const escaped = escapeSqlLike(input);
      assert.equal(escaped, "path\\\\to\\\\novel");
    });

    it("escapes multiple mixed wildcards correctly", () => {
      const input = "%_\\mixed_%";
      const escaped = escapeSqlLike(input);
      assert.equal(escaped, "\\%\\_\\\\mixed\\_\\%");
    });

    it("handles empty and normal text without modification", () => {
      assert.equal(escapeSqlLike(""), "");
      assert.equal(escapeSqlLike("طلسم ہوشربا"), "طلسم ہوشربا");
      assert.equal(escapeSqlLike("Normal Title"), "Normal Title");
    });
  });

  describe("parseCatalogParams", () => {
    it("parses empty params with safe defaults", () => {
      const parsed = parseCatalogParams({});
      assert.equal(parsed.q, undefined);
      assert.equal(parsed.genre, undefined);
      assert.equal(parsed.sort, "featured");
      assert.equal(parsed.page, 1);
      assert.equal(parsed.limit, 12);
      assert.equal(parsed.freeOnly, false);
      assert.equal(parsed.minPrice, undefined);
      assert.equal(parsed.maxPrice, undefined);
    });

    it("parses valid search query and genre slug", () => {
      const parsed = parseCatalogParams({
        q: "   پراسرار قتل   ",
        genre: "mystery-thriller",
      });
      assert.equal(parsed.q, "پراسرار قتل");
      assert.equal(parsed.genre, "mystery-thriller");
    });

    it("validates and clamps page and limit bounds", () => {
      const parsed1 = parseCatalogParams({ page: "-5", limit: "999" });
      assert.equal(parsed1.page, 1);
      assert.equal(parsed1.limit, 50); // Clamped to 50 max

      const parsed2 = parseCatalogParams({ page: "3", limit: "24" });
      assert.equal(parsed2.page, 3);
      assert.equal(parsed2.limit, 24);
    });

    it("handles array params cleanly (Next.js multi-value)", () => {
      const parsed = parseCatalogParams({
        q: ["first-query", "second-query"],
        genre: ["romance", "mystery"],
      });
      assert.equal(parsed.q, "first-query");
      assert.equal(parsed.genre, "romance");
    });

    it("parses sort values and falls back safely on invalid sort", () => {
      assert.equal(parseCatalogParams({ sort: "newest" }).sort, "newest");
      assert.equal(parseCatalogParams({ sort: "price_asc" }).sort, "price_asc");
      assert.equal(parseCatalogParams({ sort: "price_desc" }).sort, "price_desc");
      assert.equal(parseCatalogParams({ sort: "hacked_value" }).sort, "featured");
    });

    it("parses price filters and freeOnly flags", () => {
      const parsed = parseCatalogParams({
        minPrice: "100",
        maxPrice: "500",
        freeOnly: "true",
      });
      assert.equal(parsed.minPrice, 100);
      assert.equal(parsed.maxPrice, 500);
      assert.equal(parsed.freeOnly, true);
    });

    it("ignores negative or invalid price inputs", () => {
      const parsed = parseCatalogParams({
        minPrice: "-50",
        maxPrice: "not-a-number",
      });
      assert.equal(parsed.minPrice, undefined);
      assert.equal(parsed.maxPrice, undefined);
    });
  });

  describe("buildCatalogUrl", () => {
    it("returns base path when params are empty or default", () => {
      const url = buildCatalogUrl("/novels", { sort: "featured", page: 1 });
      assert.equal(url, "/novels");
    });

    it("appends valid query params correctly", () => {
      const url = buildCatalogUrl("/novels", {
        q: "طلسم",
        genre: "mystery",
        sort: "newest",
        page: 2,
      });
      assert.equal(url, "/novels?q=%D8%B7%D9%84%D8%B3%D9%85&genre=mystery&sort=newest&page=2");
    });

    it("preserves price and freeOnly query params", () => {
      const url = buildCatalogUrl("/novels", {
        minPrice: 200,
        maxPrice: 600,
        freeOnly: true,
      });
      assert.equal(url, "/novels?minPrice=200&maxPrice=600&freeOnly=true");
    });
  });
});
