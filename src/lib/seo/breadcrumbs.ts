import { siteConfig } from "../../config/site.ts";

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  const baseUrl = siteConfig.url.replace(/\/$/, "");

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: baseUrl,
      },
      ...items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 2,
        name: item.name,
        item: item.path.startsWith("http")
          ? item.path
          : `${baseUrl}${item.path.startsWith("/") ? "" : "/"}${item.path}`,
      })),
    ],
  };
}
