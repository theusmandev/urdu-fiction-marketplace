'use client';

import React, { useState, useTransition } from 'react';
import {
  Megaphone,
  Sparkles,
  Info,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  Eye,
  ExternalLink,
  ArrowRight,
  Link as LinkIcon,
} from 'lucide-react';
import { updateWriterAnnouncementAction } from '@/app/actions/admin';
import type { WriterAnnouncementVariant, WriterAnnouncement } from '@/types/database';

interface Props {
  initialAnnouncement: {
    enabled: boolean;
    variant: WriterAnnouncementVariant;
    title_en: string;
    title_ur: string;
    body_en: string;
    body_ur: string;
    link_url: string;
    link_label: string;
    dismissible: boolean;
    updated_at?: string | null;
  };
}

const VARIANTS: Array<{
  value: WriterAnnouncementVariant;
  label: string;
  urduLabel: string;
  badgeEn: string;
  badgeUr: string;
  icon: React.ReactNode;
  badgeClass: string;
  borderClass: string;
  bgClass: string;
}> = [
  {
    value: 'info',
    label: 'Notice / Editorial',
    urduLabel: 'عام اطلاع',
    badgeEn: 'Notice',
    badgeUr: 'اطلاع',
    icon: <Info className="w-4 h-4 text-info-text shrink-0" />,
    badgeClass: 'bg-info-soft text-info-text border-info-border',
    borderClass: 'border-info-border',
    bgClass: 'bg-info-soft/40',
  },
  {
    value: 'feature',
    label: 'New Feature / Spotlight',
    urduLabel: 'نئی سہولت',
    badgeEn: 'New Feature',
    badgeUr: 'نئی سہولت',
    icon: <Sparkles className="w-4 h-4 text-accent-writer shrink-0" />,
    badgeClass: 'bg-accent-writer-soft text-accent-writer border-accent-writer-border',
    borderClass: 'border-accent-writer-border',
    bgClass: 'bg-accent-writer-soft/40',
  },
  {
    value: 'warning',
    label: 'Important Notice / Action',
    urduLabel: 'ضروری تنبیہ',
    badgeEn: 'Important Notice',
    badgeUr: 'اہم اطلاع',
    icon: <AlertTriangle className="w-4 h-4 text-warning-text shrink-0" />,
    badgeClass: 'bg-warning-soft text-warning-text border-warning-border',
    borderClass: 'border-warning-border',
    bgClass: 'bg-warning-soft/40',
  },
  {
    value: 'success',
    label: 'Milestone / Good News',
    urduLabel: 'کامیابی / خوشخبری',
    badgeEn: 'Update',
    badgeUr: 'تازہ ترین',
    icon: <CheckCircle2 className="w-4 h-4 text-success-text shrink-0" />,
    badgeClass: 'bg-success-soft text-success-text border-success-border',
    borderClass: 'border-success-border',
    bgClass: 'bg-success-soft/40',
  },
];

const PRESET_LINKS = [
  { label: 'Novels Workspace', url: '/writer/novels' },
  { label: 'Earnings & Sales', url: '/writer/earnings' },
  { label: 'Payout Accounts', url: '/writer/payment-methods' },
  { label: 'Platform Fee Invoices', url: '/writer/commission' },
  { label: 'Author Agreement', url: '/writer/agreement' },
];

export function WriterAnnouncementSettingsCard({ initialAnnouncement }: Props) {
  const [formState, setFormState] = useState(initialAnnouncement);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  function handleChange<K extends keyof typeof formState>(key: K, value: (typeof formState)[K]) {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setResult(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    startTransition(async () => {
      const res = await updateWriterAnnouncementAction(formState);
      setResult(res);
    });
  }

  const selectedVariantConfig =
    VARIANTS.find((v) => v.value === formState.variant) || VARIANTS[0];

  const hasEnglishPreview = Boolean(formState.title_en.trim() || formState.body_en.trim());
  const hasUrduPreview = Boolean(formState.title_ur.trim() || formState.body_ur.trim());
  const isExternal = /^https?:\/\//i.test(formState.link_url);
  const previewCta =
    formState.link_label.trim() ||
    (hasUrduPreview && !hasEnglishPreview ? 'تفصیلات دیکھیں' : 'View Details / تفصیلات');

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-writer-soft text-accent-writer border border-accent-writer-border flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-main text-base sm:text-lg">
              Writer Studio Announcement Banner
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Broadcast bilingual announcements, feature highlights, and notices exclusively inside the Author Studio.
            </p>
          </div>
        </div>

        {/* Global Active Badge */}
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
            formState.enabled
              ? 'bg-success-soft text-success-text border border-success-border'
              : 'bg-surface-muted text-muted border border-border'
          }`}
        >
          {formState.enabled ? '● Active on Writer Studio' : '○ Disabled / Hidden'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Top Controls: Toggles & Variant Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border border-border bg-surface-muted/50">
          {/* Enabled Switch */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-main block">
              Announcement Visibility
            </label>
            <div className="flex items-center gap-3">
              <input
                id="announcement-enabled-toggle"
                type="checkbox"
                checked={formState.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent-admin focus:ring-accent-admin"
              />
              <label
                htmlFor="announcement-enabled-toggle"
                className="text-xs text-main font-medium cursor-pointer"
              >
                Display banner in Writer Studio
              </label>
            </div>
            <p className="text-[11px] text-muted">
              When disabled, the banner takes zero space in the Writer Studio.
            </p>
          </div>

          {/* Dismissible Switch */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-main block">
              Dismissible by Writers
            </label>
            <div className="flex items-center gap-3">
              <input
                id="announcement-dismissible-toggle"
                type="checkbox"
                checked={formState.dismissible}
                onChange={(e) => handleChange('dismissible', e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent-admin focus:ring-accent-admin"
              />
              <label
                htmlFor="announcement-dismissible-toggle"
                className="text-xs text-main font-medium cursor-pointer"
              >
                Allow writers to close (✕)
              </label>
            </div>
            <p className="text-[11px] text-muted">
              If closed, editing the banner resets dismissal and redisplays it.
            </p>
          </div>

          {/* Tone / Variant Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-main block">
              Visual Tone / Variant
            </label>
            <select
              value={formState.variant}
              onChange={(e) =>
                handleChange('variant', e.target.value as WriterAnnouncementVariant)
              }
              className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-main focus:outline-none focus:ring-2 focus:ring-accent-admin/30 focus:border-accent-admin"
            >
              {VARIANTS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label} ({v.urduLabel})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted">
              Sets the background tint, border hue, and badge icon.
            </p>
          </div>
        </div>

        {/* Bilingual Content Inputs: 2 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* English Inputs */}
          <div className="space-y-4 p-4 rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-xs font-bold text-main uppercase tracking-wider flex items-center gap-1.5">
                <span>English Content</span>
                <span className="text-[10px] text-muted font-normal lowercase">(latin script)</span>
              </h3>
              <span className="text-[10px] text-muted">Optional if Urdu is filled</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-main flex justify-between">
                <span>Headline / Title (English)</span>
                <span className="text-[10px] text-muted">{formState.title_en.length}/160</span>
              </label>
              <input
                type="text"
                maxLength={160}
                value={formState.title_en}
                onChange={(e) => handleChange('title_en', e.target.value)}
                placeholder="e.g., Scheduled Maintenance Notice"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main text-xs placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent-admin/30 focus:border-accent-admin transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-main flex justify-between">
                <span>Message Body (English)</span>
                <span className="text-[10px] text-muted">{formState.body_en.length}/600</span>
              </label>
              <textarea
                rows={3}
                maxLength={600}
                value={formState.body_en}
                onChange={(e) => handleChange('body_en', e.target.value)}
                placeholder="Provide details or instructions for authors..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main text-xs placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent-admin/30 focus:border-accent-admin transition-colors resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* Urdu Inputs */}
          <div className="space-y-4 p-4 rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-xs font-bold text-main uppercase tracking-wider flex items-center gap-1.5">
                <span>Urdu Content</span>
                <span className="text-[10px] text-muted font-normal font-urdu">(اردو تحریر)</span>
              </h3>
              <span className="text-[10px] text-muted">Optional if English is filled</span>
            </div>

            <div className="space-y-1.5" dir="rtl">
              <label className="text-xs font-medium text-main font-urdu flex justify-between">
                <span>عنوان / ہیڈ لائن (اردو)</span>
                <span className="text-[10px] text-muted font-mono">{formState.title_ur.length}/160</span>
              </label>
              <input
                type="text"
                dir="rtl"
                maxLength={160}
                value={formState.title_ur}
                onChange={(e) => handleChange('title_ur', e.target.value)}
                placeholder="مثلاً: مصنفین کے لیے اہم اطلاع"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main text-sm font-urdu placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent-admin/30 focus:border-accent-admin transition-colors leading-[2.0]"
              />
            </div>

            <div className="space-y-1.5" dir="rtl">
              <label className="text-xs font-medium text-main font-urdu flex justify-between">
                <span>تفصیلی پیغام (اردو)</span>
                <span className="text-[10px] text-muted font-mono">{formState.body_ur.length}/600</span>
              </label>
              <textarea
                rows={3}
                dir="rtl"
                maxLength={600}
                value={formState.body_ur}
                onChange={(e) => handleChange('body_ur', e.target.value)}
                placeholder="مصنفین کے لیے تفصیلی پیغام یا ہدایات یہاں تحریر کریں..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main text-sm font-urdu placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent-admin/30 focus:border-accent-admin transition-colors resize-none leading-[2.2]"
              />
            </div>
          </div>
        </div>

        {/* Action Link & CTA Controls */}
        <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <LinkIcon className="w-4 h-4 text-accent-admin" />
            <h3 className="text-xs font-bold text-main uppercase tracking-wider">
              Optional Call-to-Action Link
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-main">
                Target URL or Internal Route
              </label>
              <input
                type="text"
                value={formState.link_url}
                onChange={(e) => handleChange('link_url', e.target.value)}
                placeholder="e.g., /writer/novels or https://..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main text-xs placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent-admin/30 focus:border-accent-admin transition-colors font-mono"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-muted">Quick Presets:</span>
                {PRESET_LINKS.map((preset) => (
                  <button
                    key={preset.url}
                    type="button"
                    onClick={() => handleChange('link_url', preset.url)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border hover:border-accent-admin text-muted hover:text-main transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-main">
                Button Label (Optional)
              </label>
              <input
                type="text"
                maxLength={60}
                value={formState.link_label}
                onChange={(e) => handleChange('link_label', e.target.value)}
                placeholder="Default: View Details / تفصیلات"
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main text-xs placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent-admin/30 focus:border-accent-admin transition-colors"
              />
              <p className="text-[10px] text-muted">
                Leave empty to use standard bilingual &quot;View Details / تفصیلات&quot;.
              </p>
            </div>
          </div>
        </div>

        {/* Live Studio Preview Box */}
        <div className="space-y-2 p-4 rounded-xl border border-dashed border-border bg-surface-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-main flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-accent-admin" />
              Live Writer Studio Preview
            </span>
            <span className="text-[10px] text-muted">
              {formState.enabled ? 'Preview as seen by Authors' : 'Banner is currently disabled'}
            </span>
          </div>

          {!hasEnglishPreview && !hasUrduPreview ? (
            <div className="p-6 text-center text-xs text-muted bg-surface rounded-xl border border-border">
              Enter English or Urdu content above to preview the announcement banner.
            </div>
          ) : (
            <div
              className={`relative rounded-2xl border p-4 sm:p-5 shadow-xs transition-all ${selectedVariantConfig.bgClass} ${selectedVariantConfig.borderClass}`}
            >
              <div className="space-y-3">
                {/* Header Badge */}
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-md bg-surface/80 border border-border/40 shadow-2xs">
                    {selectedVariantConfig.icon}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase border ${selectedVariantConfig.badgeClass}`}
                  >
                    <span>{selectedVariantConfig.badgeEn}</span>
                    <span className="opacity-50">/</span>
                    <span className="font-urdu leading-none">{selectedVariantConfig.badgeUr}</span>
                  </span>
                </div>

                {/* Content Grid */}
                <div
                  className={`gap-4 sm:gap-6 ${
                    hasEnglishPreview && hasUrduPreview
                      ? 'grid grid-cols-1 md:grid-cols-2 md:items-start md:divide-x md:divide-border/60'
                      : 'block'
                  }`}
                >
                  {hasEnglishPreview && (
                    <div className="space-y-1 pr-0 md:pr-4">
                      {formState.title_en && (
                        <h4 className="text-sm font-bold text-main tracking-tight">
                          {formState.title_en}
                        </h4>
                      )}
                      {formState.body_en && (
                        <p className="text-xs text-muted leading-relaxed">
                          {formState.body_en}
                        </p>
                      )}
                    </div>
                  )}

                  {hasUrduPreview && (
                    <div
                      dir="rtl"
                      className={`space-y-1 ${
                        hasEnglishPreview
                          ? 'pt-2 md:pt-0 md:pl-4 border-t md:border-t-0 border-border/40'
                          : ''
                      }`}
                    >
                      {formState.title_ur && (
                        <h4 className="font-urdu text-base font-bold text-main leading-[2.2]">
                          {formState.title_ur}
                        </h4>
                      )}
                      {formState.body_ur && (
                        <p className="font-urdu text-xs text-muted leading-[2.4]">
                          {formState.body_ur}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Preview CTA */}
                {formState.link_url && (
                  <div className="pt-1">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface border border-border text-main shadow-2xs">
                      <span>{previewCta}</span>
                      {isExternal ? (
                        <ExternalLink className="w-3.5 h-3.5 text-muted" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-muted" />
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Button & Status Notification */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted">
            {formState.updated_at ? (
              <span>Last updated: {new Date(formState.updated_at).toLocaleString()}</span>
            ) : (
              <span>Not published yet</span>
            )}
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-accent-admin hover:bg-accent-admin-hover text-accent-admin-contrast transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Publishing Announcement...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Announcement</span>
              </>
            )}
          </button>
        </div>

        {result && (
          <div
            className={`flex items-start gap-2 p-3 rounded-xl text-xs ${
              result.success
                ? 'bg-success-soft border border-success-border text-success-text'
                : 'bg-danger-soft border border-danger-border text-danger-text'
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>
              {result.success
                ? 'Writer announcement published successfully! All author dashboards have been refreshed.'
                : result.error}
            </span>
          </div>
        )}
      </form>
    </div>
  );
}

