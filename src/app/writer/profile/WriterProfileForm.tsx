'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUploader } from '@/components/ui/image-uploader';
import { updateWriterProfileAction } from '@/app/actions/writer';
import {
  refreshMarketplaceSession,
  updateMarketplaceSessionUser,
} from '@/components/layout/useMarketplaceSession';
import type { WriterProfileInput } from '@/lib/writer/schemas';
import {
  User,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Sparkles,
  Share2,
} from 'lucide-react';
import {
  FacebookIcon,
  InstagramIcon,
  PinterestIcon,
  TikTokIcon,
  LinkedInIcon,
} from '@/components/icons/social';

interface WriterProfileFormProps {
  userId: string;
  initialPenNameUrdu: string;
  initialPenNameEnglish: string;
  initialBioUrdu: string | null;
  initialBioEnglish: string | null;
  initialAvatarUrl: string | null;
  username: string | null;
  status: string;
  initialSocialFacebook?: string | null;
  initialSocialInstagram?: string | null;
  initialSocialPinterest?: string | null;
  initialSocialTikTok?: string | null;
  initialSocialLinkedIn?: string | null;
}

export function WriterProfileForm({
  userId,
  initialPenNameUrdu,
  initialPenNameEnglish,
  initialBioUrdu,
  initialBioEnglish,
  initialAvatarUrl,
  username,
  status,
  initialSocialFacebook,
  initialSocialInstagram,
  initialSocialPinterest,
  initialSocialTikTok,
  initialSocialLinkedIn,
}: WriterProfileFormProps) {
  const router = useRouter();

  const [formData, setFormData] = useState<WriterProfileInput>({
    pen_name_urdu: initialPenNameUrdu || '',
    pen_name_english: initialPenNameEnglish || '',
    bio_urdu: initialBioUrdu || '',
    bio_english: initialBioEnglish || '',
    avatar_url: initialAvatarUrl || null,
    social_facebook: initialSocialFacebook || '',
    social_instagram: initialSocialInstagram || '',
    social_pinterest: initialSocialPinterest || '',
    social_tiktok: initialSocialTikTok || '',
    social_linkedin: initialSocialLinkedIn || '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = (field: keyof WriterProfileInput, value: string | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setFieldErrors({});

    const res = await updateWriterProfileAction(formData);

    setIsSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to update profile.');
      if (res.fieldErrors) {
        setFieldErrors(res.fieldErrors);
      }
    } else {
      setSuccessMessage('Author profile successfully updated.');
      setIsDirty(false);
      if (formData.avatar_url) {
        updateMarketplaceSessionUser({
          avatarUrl: formData.avatar_url,
          name: formData.pen_name_english.trim() || undefined,
        });
      }
      await refreshMarketplaceSession();
      router.refresh();
    }
  };

  const publicProfileUrl = username ? `/authors/${username}` : '#';

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-success-soft border border-success-border text-success-text flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
          <p className="text-xs font-medium">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-danger-soft border border-danger-border text-danger-text flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-danger-text shrink-0" />
          <p className="text-xs font-medium">{errorMessage}</p>
        </div>
      )}

      {/* Profile Overview Card */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-serif font-bold text-navy flex items-center gap-2">
              <User className="w-5 h-5 text-accent" />
              Author Identity & Pen Name
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Your pen name is shown publicly on novel cards, chapter readers, and payment verification receipts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-success-soft text-success-text uppercase tracking-wide">
              {status}
            </span>
            {username && (
              <a
                href={publicProfileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium"
              >
                <span>View Public Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Avatar Upload */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-main uppercase tracking-wider">
            Author Profile Photo / Avatar
          </label>
          <div className="max-w-xs">
            <ImageUploader
              bucket="novel-assets"
              preset="avatar"
              folder={userId}
              value={formData.avatar_url}
              onChange={(val) => handleChange('avatar_url', val)}
              disabled={isSubmitting}
              helperText="Upload a JPG, PNG, or WebP image. Drag and zoom to frame your photo."
              helperTextUrdu="اپنی تصویر اپلوڈ کریں اور دائرے کے اندر اپنی مرضی سے ایڈجسٹ کریں۔"
            />
          </div>
        </div>

        {/* Pen Names */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Urdu Pen Name */}
          <div className="space-y-1.5" dir="rtl">
            <label className="block text-xs font-semibold text-main text-right">
              قلمی نام (اردو میں) <span className="text-danger-text">*</span>
            </label>
            <input
              type="text"
              dir="rtl"
              value={formData.pen_name_urdu}
              onChange={(e) => handleChange('pen_name_urdu', e.target.value)}
              placeholder="مثال: نمرہ احمد، عمیرہ احمد"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main font-urdu text-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
            {fieldErrors.pen_name_urdu && (
              <p className="text-xs text-danger-text text-right">{fieldErrors.pen_name_urdu[0]}</p>
            )}
            <p className="text-[11px] text-secondary text-right">
              قارئین کو آپ کے ناولوں کے سرورق اور فہرست پر یہی نام نظر آئے گا۔
            </p>
          </div>

          {/* English Pen Name */}
          <div className="space-y-1.5" dir="ltr">
            <label className="block text-xs font-semibold text-main">
              English Pen Name <span className="text-danger-text">*</span>
            </label>
            <input
              type="text"
              value={formData.pen_name_english}
              onChange={(e) => handleChange('pen_name_english', e.target.value)}
              placeholder="e.g. Nimra Ahmed, Umera Ahmed"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
            {fieldErrors.pen_name_english && (
              <p className="text-xs text-danger-text">{fieldErrors.pen_name_english[0]}</p>
            )}
            <p className="text-[11px] text-secondary">
              Used in English search results, URLs, and platform receipts.
            </p>
          </div>
        </div>

        {/* Biographies */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Urdu Bio */}
          <div className="space-y-1.5" dir="rtl">
            <label className="block text-xs font-semibold text-main text-right">
              مصنف کا تعارف
            </label>
            <textarea
              dir="rtl"
              rows={4}
              value={formData.bio_urdu || ''}
              onChange={(e) => handleChange('bio_urdu', e.target.value)}
              placeholder="اپنے ادبی سفر، دلچسپیوں اور قارئین کے لیے چند جملے تحریر کریں..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main font-urdu text-base leading-loose focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
            {fieldErrors.bio_urdu && (
              <p className="text-xs text-danger-text text-right">{fieldErrors.bio_urdu[0]}</p>
            )}
            <p className="text-[11px] text-secondary text-right">
              زیادہ سے زیادہ ۲،۰۰۰ حروف۔
            </p>
          </div>

          {/* English Bio */}
          <div className="space-y-1.5" dir="ltr">
            <label className="block text-xs font-semibold text-main">
              English Author Bio
            </label>
            <textarea
              rows={4}
              value={formData.bio_english || ''}
              onChange={(e) => handleChange('bio_english', e.target.value)}
              placeholder="Share a short summary of your literary journey and background for readers..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
            {fieldErrors.bio_english && (
              <p className="text-xs text-danger-text">{fieldErrors.bio_english[0]}</p>
            )}
            <p className="text-[11px] text-secondary">
              Maximum 2,000 characters.
            </p>
          </div>
        </div>
      </div>

      {/* Social Media & Public Links Card */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-6">
        <div className="border-b border-border pb-4">
          <h2 className="text-lg font-serif font-bold text-navy flex items-center gap-2">
            <Share2 className="w-5 h-5 text-accent" />
            Social Media & Public Links
          </h2>
          <p className="text-xs text-secondary mt-0.5">
            Share your official social channels with your readers. Enter your full profile URL or username/handle. Only populated links will appear on your public author profile.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Facebook */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-main flex items-center gap-2">
              <FacebookIcon className="w-4 h-4 text-accent" />
              <span>Facebook</span>
            </label>
            <input
              type="text"
              value={formData.social_facebook || ''}
              onChange={(e) => handleChange('social_facebook', e.target.value)}
              placeholder="https://facebook.com/username or @username"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {fieldErrors.social_facebook && (
              <p className="text-xs text-danger-text">{fieldErrors.social_facebook[0]}</p>
            )}
            <p className="text-[11px] text-secondary">
              Author page or profile on Facebook.
            </p>
          </div>

          {/* Instagram */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-main flex items-center gap-2">
              <InstagramIcon className="w-4 h-4 text-accent" />
              <span>Instagram</span>
            </label>
            <input
              type="text"
              value={formData.social_instagram || ''}
              onChange={(e) => handleChange('social_instagram', e.target.value)}
              placeholder="https://instagram.com/username or @username"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {fieldErrors.social_instagram && (
              <p className="text-xs text-danger-text">{fieldErrors.social_instagram[0]}</p>
            )}
            <p className="text-[11px] text-secondary">
              Instagram handle or profile link.
            </p>
          </div>

          {/* Pinterest */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-main flex items-center gap-2">
              <PinterestIcon className="w-4 h-4 text-accent" />
              <span>Pinterest</span>
            </label>
            <input
              type="text"
              value={formData.social_pinterest || ''}
              onChange={(e) => handleChange('social_pinterest', e.target.value)}
              placeholder="https://pinterest.com/username or @username"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {fieldErrors.social_pinterest && (
              <p className="text-xs text-danger-text">{fieldErrors.social_pinterest[0]}</p>
            )}
            <p className="text-[11px] text-secondary">
              Pinterest boards or mood boards for your novels.
            </p>
          </div>

          {/* TikTok */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-main flex items-center gap-2">
              <TikTokIcon className="w-4 h-4 text-accent" />
              <span>TikTok</span>
            </label>
            <input
              type="text"
              value={formData.social_tiktok || ''}
              onChange={(e) => handleChange('social_tiktok', e.target.value)}
              placeholder="https://tiktok.com/@username or @username"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {fieldErrors.social_tiktok && (
              <p className="text-xs text-danger-text">{fieldErrors.social_tiktok[0]}</p>
            )}
            <p className="text-[11px] text-secondary">
              TikTok account for BookTok videos and updates.
            </p>
          </div>

          {/* LinkedIn */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-semibold text-main flex items-center gap-2">
              <LinkedInIcon className="w-4 h-4 text-accent" />
              <span>LinkedIn</span>
            </label>
            <input
              type="text"
              value={formData.social_linkedin || ''}
              onChange={(e) => handleChange('social_linkedin', e.target.value)}
              placeholder="https://linkedin.com/in/username or username"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {fieldErrors.social_linkedin && (
              <p className="text-xs text-danger-text">{fieldErrors.social_linkedin[0]}</p>
            )}
            <p className="text-[11px] text-secondary">
              Professional author profile on LinkedIn.
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between bg-surface rounded-xl border border-border p-4">
        <div className="text-xs text-secondary flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-accent" />
          <span>{isDirty ? 'Unsaved changes' : 'Profile up to date'}</span>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving Changes...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Author Profile</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
