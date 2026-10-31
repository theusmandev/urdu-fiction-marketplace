import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { UrduText } from "@/components/urdu/UrduText";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ShieldCheck, Heart, ArrowUpRight } from "lucide-react";
import {
  FacebookIcon,
  WhatsAppIcon,
  PinterestIcon,
  InstagramIcon,
  YoutubeIcon,
  TelegramIcon,
} from "@/components/icons/social";
import { getSocialLinks } from "@/lib/settings/social";

interface SocialItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

export async function PublicFooter() {
  const currentYear = 2026;
  const socialLinks = await getSocialLinks();

  const candidateItems = [
    { key: "facebook", label: "Facebook", href: socialLinks.facebook, icon: <FacebookIcon className="w-5 h-5" /> },
    { key: "whatsapp", label: "WhatsApp", href: socialLinks.whatsapp, icon: <WhatsAppIcon className="w-5 h-5" /> },
    { key: "pinterest", label: "Pinterest", href: socialLinks.pinterest, icon: <PinterestIcon className="w-5 h-5" /> },
    { key: "instagram", label: "Instagram", href: socialLinks.instagram, icon: <InstagramIcon className="w-5 h-5" /> },
    { key: "youtube", label: "YouTube", href: socialLinks.youtube, icon: <YoutubeIcon className="w-5 h-5" /> },
    { key: "telegram", label: "Telegram", href: socialLinks.telegram, icon: <TelegramIcon className="w-5 h-5" /> },
  ];

  const socialItems: SocialItem[] = candidateItems
    .filter((item): item is typeof item & { href: string } => typeof item.href === "string" && item.href.trim().length > 0)
    .map((item) => ({
      key: item.key,
      label: item.label,
      href: item.href.trim(),
      icon: item.icon,
    }));

  return (
    <footer className="mt-auto bg-surface-muted text-text-muted border-t border-border pt-12 sm:pt-16 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Footer Navigation: 2-col on phones, 3-col on tablets, 5-col on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 sm:gap-10 pb-12 border-b border-border">
          
          {/* Brand Info & Mission Statement (full width on phones/tablets, 2 cols on desktop) */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 space-y-4">
            <div>
              <Link href="/" aria-label={`${siteConfig.brandName} — home`} className="inline-block group hover:opacity-95 transition-opacity rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
                <BrandLogo variant="full" size={88} />
              </Link>
            </div>

            <p className="text-sm text-text-muted leading-relaxed max-w-sm">
              {siteConfig.description}
            </p>

            <UrduText size="sm" className="text-text-muted max-w-md py-1 font-normal">
              معیاری اور نایاب اردو ناولز کا مستند مرکز، جہاں قارئین براہ راست اپنے پسندیدہ مصنّفین کی سرپرستی کرتے ہیں۔
            </UrduText>

            {/* Direct Payment Trust Banner */}
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-text-muted">Direct Pay via:</span>
              {siteConfig.supportedPaymentMethods.map((method) => (
                <span
                  key={method.id}
                  className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded bg-surface text-text border border-border"
                >
                  {method.name}
                </span>
              ))}
            </div>
          </div>

          {/* Column: For Readers */}
          <div className="col-span-1 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-strong font-sans">
              For Readers
            </p>
            <ul className="space-y-2 text-sm">
              {siteConfig.navigation.footer.readers.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hover:text-text transition-colors flex items-center gap-1 group py-1"
                  >
                    <span>{item.title}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-accent-strong" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column: For Writers */}
          <div className="col-span-1 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-strong font-sans">
              For Writers
            </p>
            <ul className="space-y-2 text-sm">
              {siteConfig.navigation.footer.writers.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hover:text-text transition-colors flex items-center gap-1 group py-1"
                  >
                    <span>{item.title}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-accent-strong" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column: Platform & Legal */}
          <div className="col-span-2 sm:col-span-1 lg:col-span-1 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-strong font-sans">
              Trust & Policies
            </p>
            <ul className="space-y-2 text-sm">
              {siteConfig.navigation.footer.legal.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hover:text-text transition-colors flex items-center gap-1 group py-1"
                  >
                    <span>{item.title}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-accent-strong" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Social Media Links Bar */}
        {socialItems.length > 0 && (
          <div className="py-6 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-strong font-sans">
              Connect With Us
            </span>
            <div className="flex items-center gap-2">
              {socialItems.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.label}
                  className="p-2 rounded-lg text-text-muted hover:text-accent-strong hover:bg-accent-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-muted"
                >
                  {item.icon}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Bar: Copyright & Direct Payment Protection Notice */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-text-muted">
          <div className="flex items-center gap-2 text-center md:text-left">
            <ShieldCheck className="w-4 h-4 text-accent-strong shrink-0" />
            <span>
              All transactions are direct-to-author with writer receipt verification.
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span>© {currentYear} {siteConfig.brandName}. Built with</span>
            <Heart className="w-3.5 h-3.5 text-danger fill-danger mx-0.5 inline shrink-0" />
            <span>for Urdu Literature.</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
