import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Cormorant_Garamond, Gulzar, Amiri } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/config/site";
import { getSitePalette } from "@/lib/settings/site-palette";
import { getPaletteThemeColor } from "@/lib/settings/palette";
import { ConfirmProvider } from "@/components/ui/confirm-provider";
import { JsonLd } from "@/components/seo/JsonLd";
import { getSiteJsonLd } from "@/lib/seo/site-schemas";

// Primary Latin UI Font: Clean, high-legibility sans-serif for prices, TIDs, dashboards
const sansFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Editorial Latin Headings Font: Bookish, classic, high-trust
const serifFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["500", "600", "700"],
});

// Primary Nastaliq Calligraphic Urdu Font: Gulzar (Only weight 400 exists in Google Font family)
const urduFont = Gulzar({
  subsets: ["arabic"],
  variable: "--font-urdu",
  display: "swap",
  weight: "400",
});

// Classical Naskh Arabic Font: Amiri (For Quranic verses and Arabic quotations with full harakat)
const arabicFont = Amiri({
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
  weight: ["400", "700"],
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  alternates: {
    canonical: "./",
  },
  title: {
    default: `${siteConfig.brandName} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.brandName}`,
  },
  description: siteConfig.description,
  keywords: [
    "Urdu Novels",
    "Urdu Fiction",
    "Read Urdu Books",
    "Pakistani Authors",
    "Digital Bookstore",
    "JazzCash Urdu Books",
    "EasyPaisa Urdu Books",
    "اردو ناولز",
    "ناول نگار",
  ],
  authors: [{ name: siteConfig.brandName }],
  openGraph: {
    title: siteConfig.brandName,
    description: siteConfig.tagline,
    url: siteConfig.url,
    siteName: siteConfig.brandName,
    locale: "en_PK",
    alternateLocale: ["ur_PK"],
    type: "website",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: `${siteConfig.brandName} — ${siteConfig.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.brandName,
    description: siteConfig.tagline,
    images: ["/brand/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#FBF8F2",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const palette = await getSitePalette();
  const metaThemeColor = getPaletteThemeColor(palette);

  return (
    <html
      lang="en"
      data-palette={palette}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${sansFont.variable} ${serifFont.variable} ${urduFont.variable} ${arabicFont.variable}`}
    >
      <head>
        <meta name="theme-color" content={metaThemeColor} />
        {/*
          Synchronous session display hint & early fetch script.
          Runs before first paint to set data-session-hint="1" on <html> if the user has an active session hint,
          instantly rendering neutral skeletons and eliminating 1-2s auth header flicker on static/ISR pages.
          Fires early non-blocking fetch to /api/auth/session to minimize Time-to-Interactive.
          Compatible with CSP script-src 'self' 'unsafe-inline'.
        */}
        <script
          id="unb-session-hint"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(document.cookie.indexOf('unb_has_session=1')!==-1){document.documentElement.setAttribute('data-session-hint','1');window.__UNB_SESSION=fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});}}catch(e){}})();`,
          }}
        />
        <JsonLd data={getSiteJsonLd()} />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-bg font-sans antialiased text-text flex flex-col selection:bg-accent-soft selection:text-text"
      >
        <ConfirmProvider>{children}</ConfirmProvider>
      </body>
    </html>
  );
}
