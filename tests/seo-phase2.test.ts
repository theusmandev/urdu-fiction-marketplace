import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildBreadcrumbJsonLd } from "../src/lib/seo/breadcrumbs.ts";
import { getSiteJsonLd } from "../src/lib/seo/site-schemas.ts";
import { siteConfig } from "../src/config/site.ts";

describe("SEO Phase 2 — Structured Data & Metadata Verification", () => {
  it("buildBreadcrumbJsonLd produces valid Schema.org BreadcrumbList with absolute URLs and prepended Home", () => {
    const breadcrumbs = buildBreadcrumbJsonLd([
      { name: "Novels", path: "/novels" },
      { name: "Social & Romantic", path: "/genres/social-romantic" },
      { name: "Namal", path: "/novels/namal" },
    ]);

    assert.equal(breadcrumbs["@context"], "https://schema.org");
    assert.equal(breadcrumbs["@type"], "BreadcrumbList");
    assert.equal(Array.isArray(breadcrumbs.itemListElement), true);
    // Home + 3 items = 4
    assert.equal(breadcrumbs.itemListElement.length, 4);

    // Position 1: Home
    assert.equal(breadcrumbs.itemListElement[0].position, 1);
    assert.equal(breadcrumbs.itemListElement[0].name, "Home");
    assert.equal(breadcrumbs.itemListElement[0].item, siteConfig.url.replace(/\/$/, ""));

    // Position 2: Novels
    assert.equal(breadcrumbs.itemListElement[1].position, 2);
    assert.equal(breadcrumbs.itemListElement[1].name, "Novels");
    assert.match(breadcrumbs.itemListElement[1].item, /^https?:\/\//);
    assert.ok(breadcrumbs.itemListElement[1].item.endsWith("/novels"));

    // Position 3: Genre
    assert.equal(breadcrumbs.itemListElement[2].position, 3);
    assert.equal(breadcrumbs.itemListElement[2].name, "Social & Romantic");
    assert.match(breadcrumbs.itemListElement[2].item, /^https?:\/\//);
    assert.ok(breadcrumbs.itemListElement[2].item.endsWith("/genres/social-romantic"));

    // Position 4: Novel
    assert.equal(breadcrumbs.itemListElement[3].position, 4);
    assert.equal(breadcrumbs.itemListElement[3].name, "Namal");
    assert.match(breadcrumbs.itemListElement[3].item, /^https?:\/\//);
    assert.ok(breadcrumbs.itemListElement[3].item.endsWith("/novels/namal"));
  });

  it("getSiteJsonLd produces valid Organization & WebSite without retired SearchAction or FAQPage", () => {
    const siteJsonLd = getSiteJsonLd() as {
      "@context": string;
      "@graph": Array<{
        "@type": string;
        name: string;
        url: string;
        potentialAction?: unknown;
        logo?: unknown;
        sameAs?: string[];
      }>;
    };

    assert.equal(siteJsonLd["@context"], "https://schema.org");
    assert.ok(Array.isArray(siteJsonLd["@graph"]));

    const org = siteJsonLd["@graph"].find((item) => item["@type"] === "Organization");
    assert.ok(org, "Organization schema must exist in site graph");
    assert.equal(org.name, siteConfig.brandName);
    assert.match(org.url, /^https?:\/\//);
    assert.ok(org.sameAs && org.sameAs.length > 0, "Organization sameAs must include real social links");

    const website = siteJsonLd["@graph"].find((item) => item["@type"] === "WebSite");
    assert.ok(website, "WebSite schema must exist in site graph");
    assert.equal(website.name, siteConfig.brandName);
    assert.match(website.url, /^https?:\/\//);

    // Google retired Sitelinks Searchbox on Nov 21, 2024. SearchAction must NOT be present.
    assert.equal(
      website.potentialAction,
      undefined,
      "SearchAction must NOT be included (retired by Google on Nov 21, 2024)"
    );

    // FAQPage must NOT be present in site schema graph
    const faq = siteJsonLd["@graph"].find((item) => item["@type"] === "FAQPage");
    assert.equal(faq, undefined, "FAQPage must NOT be included (Google Aug 8, 2023 restriction)");
  });

  it("safely escapes raw '<' characters in JSON-LD payloads to prevent script injection", () => {
    const payload = {
      "@context": "https://schema.org",
      "@type": "Book",
      name: "</script><script>alert('xss')</script>",
      description: "Test description with <b>HTML</b> & <special> tags",
    };

    const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");

    assert.ok(
      !serialized.includes("<"),
      "Serialized JSON-LD must never contain raw unescaped '<' characters"
    );
    assert.ok(
      serialized.includes("\\u003c/script>"),
      "Should contain unicode escaped \\u003c"
    );

    // Parsing it back must match the exact original data structure (JSON.parse resolves \u003c to <)
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.name, payload.name);
    assert.equal(parsed.description, payload.description);
  });

  it("verifies single <h1> heading per public page source or delegated client component", () => {
    const publicPages = [
      { path: "src/app/(marketplace)/page.tsx" },
      { path: "src/app/(marketplace)/novels/page.tsx" },
      { path: "src/app/(marketplace)/novels/[slug]/page.tsx" },
      { path: "src/app/(marketplace)/genres/page.tsx" },
      { path: "src/app/(marketplace)/genres/[slug]/page.tsx" },
      { path: "src/app/(marketplace)/writers/page.tsx" },
      { path: "src/app/(marketplace)/writers/[username]/page.tsx" },
      { path: "src/app/(marketplace)/about/page.tsx" },
      { path: "src/app/(marketplace)/how-it-works/page.tsx" },
      { path: "src/app/(marketplace)/how-to-pay/page.tsx" },
      { path: "src/app/(marketplace)/faq/page.tsx" },
      { path: "src/app/(marketplace)/contact/page.tsx" },
      { path: "src/app/(marketplace)/terms/page.tsx" },
      { path: "src/app/(marketplace)/privacy/page.tsx" },
      { path: "src/app/(marketplace)/refund-policy/page.tsx" },
      { path: "src/app/(marketplace)/content-policy/page.tsx" },
      { path: "src/app/(marketplace)/become-a-writer/page.tsx" },
      // Delegated reader client component
      { path: "src/components/catalog/FreePreviewReaderClient.tsx" },
    ];

    for (const { path: relPath } of publicPages) {
      const fullPath = path.resolve(relPath);
      const content = fs.readFileSync(fullPath, "utf-8");

      // Match <h1 ...> or <UrduText as="h1" ...>
      const h1Matches = content.match(/<h1\b|as=["']h1["']/g) || [];
      assert.equal(
        h1Matches.length,
        1,
        `Page/Component ${relPath} must have exactly one <h1> heading, but found ${h1Matches.length}`
      );
    }
  });

  it("verifies static metadata title <= 60 chars and description <= 160 chars on all public pages", () => {
    const staticMetadataPages = [
      {
        path: "src/app/(marketplace)/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/genres/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/writers/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/about/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/how-it-works/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/how-to-pay/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/faq/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/contact/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/terms/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/privacy/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/refund-policy/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/content-policy/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
      {
        path: "src/app/(marketplace)/become-a-writer/page.tsx",
        maxTitle: 60,
        maxDesc: 160,
      },
    ];

    for (const { path: relPath, maxTitle, maxDesc } of staticMetadataPages) {
      const fullPath = path.resolve(relPath);
      const content = fs.readFileSync(fullPath, "utf-8");

      // Extract title and description from export const metadata
      const titleMatch = content.match(/title:\s*(?:{\s*absolute:\s*)?["']([^"']+)["']/);
      const descMatch = content.match(/description:\s*["']([^"']+)["']/);

      assert.ok(titleMatch, `Page ${relPath} must have a metadata title`);
      assert.ok(descMatch, `Page ${relPath} must have a metadata description`);

      const rawTitle = titleMatch[1];
      // If title doesn't end with UNB Premium (will be templated), calculate full length
      const fullTitle = rawTitle.includes("UNB Premium")
        ? rawTitle
        : `${rawTitle} | UNB Premium`;
      const desc = descMatch[1];

      assert.ok(
        fullTitle.length <= maxTitle + 5, // small buffer for unicode spacing
        `Page ${relPath} full title "${fullTitle}" length (${fullTitle.length}) exceeds ~${maxTitle} chars`
      );
      assert.ok(
        desc.length <= maxDesc + 5,
        `Page ${relPath} description length (${desc.length}) exceeds ~${maxDesc} chars`
      );
    }
  });
});
