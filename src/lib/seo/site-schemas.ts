import { siteConfig } from "../../config/site.ts";
import { DEFAULT_SOCIAL_LINKS } from "../settings/social-constants.ts";

export function getSiteJsonLd() {
  const baseUrl = siteConfig.url.replace(/\/$/, "");

  const sameAs = Object.values(DEFAULT_SOCIAL_LINKS).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0
  );

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${baseUrl}/#organization`,
        name: siteConfig.brandName,
        alternateName: siteConfig.brandNameUrdu,
        url: baseUrl,
        logo: `${baseUrl}/brand/og-image.png`,
        description: siteConfig.description,
        sameAs,
      },
      {
        "@type": "WebSite",
        "@id": `${baseUrl}/#website`,
        name: siteConfig.brandName,
        alternateName: siteConfig.brandNameUrdu,
        url: baseUrl,
        inLanguage: ["en", "ur"],
        publisher: {
          "@id": `${baseUrl}/#organization`,
        },
      },
    ],
  };
}
