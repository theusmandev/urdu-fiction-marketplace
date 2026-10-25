import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Cormorant_Garamond, Gulzar, Amiri } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/config/site";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";

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
});

export const metadata: Metadata = {
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
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#17243A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sansFont.variable} ${serifFont.variable} ${urduFont.variable} ${arabicFont.variable}`}
    >
      <body className="min-h-screen bg-background font-sans antialiased text-main flex flex-col selection:bg-accent/30 selection:text-navy">
        <PublicHeader />
        <main className="flex-1 flex flex-col">{children}</main>
        <PublicFooter />
      </body>
    </html>
  );
}
