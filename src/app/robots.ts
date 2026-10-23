import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/admin/",
        "/writer",
        "/writer/",
        "/account",
        "/account/",
        "/library",
        "/library/",
        "/orders",
        "/orders/",
        "/read",
        "/read/",
        "/api",
        "/api/",
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
