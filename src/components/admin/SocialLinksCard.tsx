'use client';

import React, { useState, useTransition } from 'react';
import { Share2, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import {
  FacebookIcon,
  WhatsAppIcon,
  PinterestIcon,
  InstagramIcon,
  YoutubeIcon,
  TelegramIcon,
} from '@/components/icons/social';
import { updateSocialLinksAction } from '@/app/actions/admin';
import type { SocialLinks } from '@/types/database';

interface Props {
  initialLinks: SocialLinks;
}

const PLATFORM_FIELDS: Array<{
  key: keyof SocialLinks;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
}> = [
  { key: 'facebook', label: 'Facebook', placeholder: 'https://www.facebook.com/...', icon: <FacebookIcon className="w-4 h-4" /> },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: 'https://whatsapp.com/channel/...', icon: <WhatsAppIcon className="w-4 h-4" /> },
  { key: 'pinterest', label: 'Pinterest', placeholder: 'https://www.pinterest.com/...', icon: <PinterestIcon className="w-4 h-4" /> },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://www.instagram.com/...', icon: <InstagramIcon className="w-4 h-4" /> },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@...', icon: <YoutubeIcon className="w-4 h-4" /> },
  { key: 'telegram', label: 'Telegram', placeholder: 'https://t.me/...', icon: <TelegramIcon className="w-4 h-4" /> },
];

export function SocialLinksCard({ initialLinks }: Props) {
  const [links, setLinks] = useState<SocialLinks>(initialLinks);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  function handleChange(key: keyof SocialLinks, value: string) {
    setLinks((prev) => ({ ...prev, [key]: value }));
    setResult(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await updateSocialLinksAction(links);
      setResult(res);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent-soft text-accent-strong">
          <Share2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-semibold text-text text-base">Social Media Links</h2>
          <p className="text-xs text-text-muted mt-0.5">
            These links appear in the public footer. Leave a field empty to hide that icon.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLATFORM_FIELDS.map(({ key, label, placeholder, icon }) => (
            <div key={key} className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide">
                <span className="text-accent-strong">{icon}</span>
                {label}
              </label>
              <input
                type="url"
                value={links[key] ?? ''}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-text text-sm placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent-strong transition-colors"
              />
            </div>
          ))}
        </div>

        {result && (
          <div
            className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
              result.success
                ? 'bg-success-soft border border-success-border text-success-text'
                : 'bg-danger-soft border border-danger-border text-danger-text'
            }`}
          >
            {result.success ? (
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>{result.success ? 'Social links updated successfully.' : result.error}</span>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-primary-contrast font-semibold text-sm hover:bg-accent-strong transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isPending ? 'Saving…' : 'Save Social Links'}
          </button>
        </div>
      </form>
    </div>
  );
}
