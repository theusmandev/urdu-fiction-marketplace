import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      /**
       * SEO ARCHITECTURE INVARIANT: Disallow vs. noindex
       *
       * Disallowing a URL prefix in robots.txt forbids search engine crawlers from requesting
       * the URL. Consequently, crawlers CANNOT read the `<meta name="robots" content="noindex">`
       * HTML tag or the `X-Robots-Tag: noindex` response header. If external or historical links
       * exist to a disallowed URL, Googlebot will still index the bare URL without snippets.
       *
       * Therefore, public-facing transactional, account, and authentication routes
       * (/login, /register, /forgot-password, /reset-password, /checkout, /account, /orders,
       * /library, /disputes, /support, /notifications, /tips) MUST be crawlable (ALLOWED)
       * so Googlebot can fetch them, parse their explicit `noindex, nofollow` metadata/headers,
       * and reliably remove or exclude them from search results.
       *
       * We reserve robots.txt Disallow STRICTLY for private operator consoles, authenticated
       * chapter reading content, dev utilities, and raw API endpoints where crawler requests
       * waste compute budget without any HTML indexation value:
       * - /api: Raw JSON endpoints (no HTML meta tags)
       * - /admin: Operator administration consoles
       * - /writer: Writer studio workspace (role-gated)
       * - /read: Paid chapter reader (purchase entitlement required)
       * - /dev: Internal token & palette diagnostics
       */
      disallow: [
        "/api",
        "/api/",
        "/admin",
        "/admin/",
        "/writer",
        "/writer/",
        "/read",
        "/read/",
        "/dev",
        "/dev/",
      ],
    },
    sitemap: `${baseUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
