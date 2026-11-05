import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { NovelCard } from "@/components/catalog/NovelCard";
import { WriterProfileTipButton } from "@/components/tips/WriterProfileTipButton";
import {
  getPublicWriterByUsername,
  getPublicWriters,
  getNovelsByWriter,
} from "@/lib/supabase/public";
import { siteConfig } from "@/config/site";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  BookOpen,
  ChevronRight,
  Home,
  CheckCircle2,
} from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  PinterestIcon,
  TikTokIcon,
  LinkedInIcon,
} from "@/components/icons/social";

export const revalidate = 120; // 2 minutes ISR revalidation

export async function generateStaticParams() {
  const writers = await getPublicWriters(50);
  return writers
    .filter((w) => Boolean(w.username))
    .map((w) => ({
      username: w.username!,
    }));
}

interface WriterProfilePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: WriterProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const writer = await getPublicWriterByUsername(username);

  if (!writer) {
    return {
      title: "Author Not Found",
    };
  }

  const title = `${writer.pen_name_urdu} (${writer.pen_name_english}) — Author Profile`;
  const description =
    writer.bio_urdu ||
    `Read digital Urdu novels by author ${writer.pen_name_english} (${writer.pen_name_urdu}). Support directly via JazzCash and EasyPaisa.`;

  const rawAvatar = writer.avatar_url?.trim();
  const ogImageUrl = rawAvatar
    ? rawAvatar.startsWith("http")
      ? rawAvatar
      : `${siteConfig.url}${rawAvatar.startsWith("/") ? "" : "/"}${rawAvatar}`
    : `${siteConfig.url}/brand/og-image.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `${siteConfig.url}/writers/${writer.username}`,
      locale: "en_PK",
      alternateLocale: ["ur_PK"],
      images: [
        {
          url: ogImageUrl,
          width: 400,
          height: 400,
          alt: writer.pen_name_english || writer.pen_name_urdu,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: `${siteConfig.url}/writers/${writer.username}`,
    },
  };
}

export default async function WriterProfilePage({
  params,
}: WriterProfilePageProps) {
  const { username } = await params;
  const writer = await getPublicWriterByUsername(username);

  if (!writer) {
    notFound();
  }

  const bioUrdu = writer.bio_urdu?.trim() || "";
  const bioEnglish = writer.bio_english?.trim() || "";
  const hasBioUrdu = bioUrdu.length > 0;
  const hasBioEnglish = bioEnglish.length > 0;
  const isIdenticalBio = hasBioUrdu && hasBioEnglish && bioUrdu === bioEnglish;
  const isUrduScript = /[\u0600-\u06FF]/.test(bioUrdu || bioEnglish);
  const hasAnyBio = hasBioUrdu || hasBioEnglish;

  const novels = await getNovelsByWriter(writer.id);

  // Filter populated social media links (only platforms with a valid non-empty URL)
  const socialLinks = [
    {
      platform: "facebook" as const,
      label: "Facebook",
      url: writer.social_facebook,
      Icon: FacebookIcon,
    },
    {
      platform: "instagram" as const,
      label: "Instagram",
      url: writer.social_instagram,
      Icon: InstagramIcon,
    },
    {
      platform: "pinterest" as const,
      label: "Pinterest",
      url: writer.social_pinterest,
      Icon: PinterestIcon,
    },
    {
      platform: "tiktok" as const,
      label: "TikTok",
      url: writer.social_tiktok,
      Icon: TikTokIcon,
    },
    {
      platform: "linkedin" as const,
      label: "LinkedIn",
      url: writer.social_linkedin,
      Icon: LinkedInIcon,
    },
  ].filter((item): item is typeof item & { url: string } => Boolean(item.url && item.url.trim() !== ""));

  // JSON-LD Structured Data: Person & Breadcrumbs
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": `${siteConfig.url}/writers/${writer.username}#person`,
        name: writer.pen_name_english,
        alternateName: writer.pen_name_urdu,
        description: writer.bio_urdu || writer.bio_english || undefined,
        image: writer.avatar_url || undefined,
        url: `${siteConfig.url}/writers/${writer.username}`,
        sameAs: socialLinks.length > 0 ? socialLinks.map((s) => s.url) : undefined,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: siteConfig.url,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Authors",
            item: `${siteConfig.url}/writers`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: writer.pen_name_english || writer.pen_name_urdu,
            item: `${siteConfig.url}/writers/${writer.username}`,
          },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10 min-w-0">
        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumbs"
          className="w-full flex items-center gap-2 text-xs text-secondary overflow-x-auto pb-1"
        >
          <Link href="/" className="hover:text-navy flex items-center gap-1 shrink-0">
            <Home className="w-3.5 h-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
          <Link href="/writers" className="hover:text-navy shrink-0">
            Authors
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
          <span className="text-navy font-semibold truncate">
            {writer.pen_name_english || writer.pen_name_urdu}
          </span>
        </nav>

        {/* Author Bio & Identity Header */}
        <div className="w-full bg-surface p-6 sm:p-10 rounded-3xl border border-border shadow-sm flex flex-col md:flex-row items-start md:items-center gap-6 sm:gap-8 min-w-0 overflow-hidden">
          {writer.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={writer.avatar_url}
              alt={writer.pen_name_english}
              width={112}
              height={112}
              className="w-24 h-24 sm:w-28 sm:rotate-0 sm:h-28 rounded-2xl object-cover border-2 border-border shrink-0 shadow-md"
            />
          ) : (
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-navy text-accent font-serif font-bold text-3xl sm:text-4xl flex items-center justify-center border-2 border-navy-light shrink-0 shadow-md">
              {writer.pen_name_english.charAt(0)}
            </div>
          )}

          <div className="space-y-3 min-w-0 flex-1 w-full overflow-hidden">
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent-dark px-2.5 py-0.5 rounded-full border border-accent/30 shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-accent" />
                  <span>Approved author</span>
                </span>
                <span className="text-xs text-secondary break-words [overflow-wrap:anywhere] min-w-0">
                  @{writer.username}
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0 pt-0.5 min-w-0">
                <UrduText
                  as="h1"
                  size="2xl"
                  className="text-navy font-normal leading-[1.8] py-0 break-words [overflow-wrap:anywhere]"
                >
                  {writer.pen_name_urdu}
                </UrduText>

                <h2 className="font-serif text-base font-semibold text-secondary break-words [overflow-wrap:anywhere]">
                  ({writer.pen_name_english})
                </h2>
              </div>
            </div>

            {hasAnyBio && (
              <div className="w-full p-4 sm:p-5 rounded-2xl bg-ivory/60 border border-border/70 space-y-3 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent-dark">
                    About the author
                  </span>
                  <UrduText as="span" size="sm" className="text-secondary py-0">
                    مصنف کا تعارف
                  </UrduText>
                </div>

                {isIdenticalBio ? (
                  isUrduScript ? (
                    <p
                      dir="rtl"
                      lang="ur"
                      className="font-urdu text-sm text-main leading-[2.2] text-right break-words [overflow-wrap:anywhere]"
                    >
                      {bioUrdu}
                    </p>
                  ) : (
                    <p
                      dir="ltr"
                      lang="en"
                      className="text-xs text-secondary leading-relaxed text-left break-words [overflow-wrap:anywhere]"
                    >
                      {bioEnglish}
                    </p>
                  )
                ) : hasBioEnglish && hasBioUrdu ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                    <p
                      dir="ltr"
                      lang="en"
                      className="text-xs text-secondary leading-relaxed text-left break-words [overflow-wrap:anywhere]"
                    >
                      {bioEnglish}
                    </p>
                    <p
                      dir="rtl"
                      lang="ur"
                      className="font-urdu text-sm text-main leading-[2.2] text-right md:border-l md:border-border/50 md:pl-4 break-words [overflow-wrap:anywhere]"
                    >
                      {bioUrdu}
                    </p>
                  </div>
                ) : hasBioUrdu ? (
                  <p
                    dir="rtl"
                    lang="ur"
                    className="font-urdu text-sm text-main leading-[2.2] text-right break-words [overflow-wrap:anywhere]"
                  >
                    {bioUrdu}
                  </p>
                ) : hasBioEnglish ? (
                  <p
                    dir="ltr"
                    lang="en"
                    className="text-xs text-secondary leading-relaxed text-left break-words [overflow-wrap:anywhere]"
                  >
                    {bioEnglish}
                  </p>
                ) : null}
              </div>
            )}

            {/* Author Social Media Links (Rendered ONLY if 1 or more links are populated) */}
            {socialLinks.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-2 pt-1 min-w-0"
                aria-label="Author social media links"
              >
                <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider shrink-0 mr-0.5">
                  Connect:
                </span>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {socialLinks.map(({ platform, label, url, Icon }) => (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${writer.pen_name_english || 'Author'} on ${label}`}
                      title={`${label}: ${url}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border hover:border-accent hover:text-accent-strong text-secondary text-xs font-medium transition-all shadow-2xs hover:shadow-xs active:scale-95 touch-manipulation group"
                    >
                      <Icon className="w-3.5 h-3.5 text-accent-strong group-hover:text-accent shrink-0" />
                      <span className="truncate max-w-[120px]">{label}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Profile Footer Row: Published Novels & Say Thanks Button */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border/40 w-full min-w-0">
              <div className="flex items-center gap-1.5 font-medium text-navy text-xs shrink-0">
                <BookOpen className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>
                  {novels.length} {novels.length === 1 ? "Published Novel" : "Published Novels"}
                </span>
              </div>

              <div className="w-full sm:w-auto min-w-0">
                <WriterProfileTipButton writerId={writer.id} className="w-full sm:w-auto" />
              </div>
            </div>
          </div>
        </div>

        {/* Novels Showcase by this Author */}
        <div className="space-y-6 w-full min-w-0">
          <div className="border-b border-border pb-4 flex flex-wrap items-center justify-between gap-2 w-full min-w-0">
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-navy break-words [overflow-wrap:anywhere]">
              Published Novels by {writer.pen_name_english}
            </h2>
            <UrduText as="span" size="sm" className="text-secondary py-0 shrink-0">
              مصنف کے شائع شدہ ناولز
            </UrduText>
          </div>

          {novels.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 w-full min-w-0">
              {novels.map((novel) => (
                <NovelCard key={novel.id} novel={novel} />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center bg-ivory/50 rounded-2xl border border-dashed border-border text-xs text-secondary">
              No novels currently listed for this author.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
