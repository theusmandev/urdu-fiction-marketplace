'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ImageUploader } from '@/components/ui/image-uploader';
import { createNovelAction, updateNovelAction, deleteDraftNovelAction } from '@/app/actions/writer';
import type { GenreRow } from '@/types/database';
import { type NovelFormInput, createNovelFormSchema } from '@/lib/writer/schemas';
import {
  BookOpen,
  Save,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Check,
  Globe,
  Lock,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { generateNovelSlug } from '@/lib/text/slug-generator';

interface NovelFormProps {
  userId: string;
  commissionRate: number;
  availableGenres: GenreRow[];
  minPrice?: number;
  maxPrice?: number;
  initialData?: {
    id: string;
    slug?: string;
    title_urdu: string;
    title_english: string;
    synopsis_urdu: string;
    description_urdu?: string | null;
    cover_url?: string | null;
    cover_public_id?: string | null;
    price_pkr: number;
    language: string;
    rights_declaration_accepted: boolean;
    genre_ids: string[];
    status: string;
  };
}

export function NovelForm({
  userId,
  commissionRate,
  availableGenres,
  minPrice = 50,
  maxPrice = 5000,
  initialData,
}: NovelFormProps) {
  const router = useRouter();
  const isEditing = Boolean(initialData?.id);

  const [formData, setFormData] = useState<NovelFormInput>({
    title_urdu: initialData?.title_urdu || '',
    title_english: initialData?.title_english || '',
    synopsis_urdu: initialData?.synopsis_urdu || '',
    description_urdu: initialData?.description_urdu || '',
    cover_url: initialData?.cover_url || null,
    cover_public_id: initialData?.cover_public_id || null,
    price_pkr: initialData?.price_pkr ?? minPrice,
    language: initialData?.language || 'ur',
    genre_ids: initialData?.genre_ids || [],
    rights_declaration_accepted: initialData?.rights_declaration_accepted ?? false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Duplicate novel warning state
  const [duplicateNovel, setDuplicateNovel] = useState<{
    id: string;
    titleEnglish?: string;
    titleUrdu?: string;
    status?: string;
  } | null>(null);

  // Delete draft modal state (for editing draft novels)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Unsaved-changes warning on page leave
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleChange = <K extends keyof NovelFormInput>(field: K, value: NovelFormInput[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleGenreToggle = (genreId: string) => {
    setIsDirty(true);
    setFormData((prev) => {
      const exists = prev.genre_ids.includes(genreId);
      const nextGenres = exists
        ? prev.genre_ids.filter((id) => id !== genreId)
        : [...prev.genre_ids, genreId];
      return { ...prev, genre_ids: nextGenres };
    });
    if (fieldErrors.genre_ids) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.genre_ids;
        return next;
      });
    }
  };

  // Commission calculations
  const price = Number(formData.price_pkr) || 0;
  const isPriceValid = price >= minPrice && price <= maxPrice && Number.isInteger(price);
  const platformRate = commissionRate || 20;
  const estimatedCommission = isPriceValid ? Math.round(price * (platformRate / 100)) : 0;
  const estimatedWriterNet = isPriceValid ? price - estimatedCommission : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});

    // Client-side validation against dynamic platform settings bounds
    const schema = createNovelFormSchema({ minPrice, maxPrice });
    const parsed = schema.safeParse(formData);
    if (!parsed.success) {
      setIsSubmitting(false);
      setErrorMessage('Please correct the highlighted form errors.');
      setFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }

    if (isEditing && initialData?.id) {
      const res = await updateNovelAction(initialData.id, formData);
      setIsSubmitting(false);

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update novel.');
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
        if (res.existingNovelId) {
          setDuplicateNovel({
            id: res.existingNovelId,
            titleEnglish: res.existingNovelTitle,
            titleUrdu: res.existingNovelUrduTitle,
            status: res.existingNovelStatus,
          });
        }
      } else {
        setDuplicateNovel(null);
        setIsDirty(false);
        setSuccessMessage('Novel details saved successfully.');
        router.refresh();
      }
    } else {
      const res = await createNovelAction(formData);
      setIsSubmitting(false);

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to create novel draft.');
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
        if (res.existingNovelId) {
          setDuplicateNovel({
            id: res.existingNovelId,
            titleEnglish: res.existingNovelTitle,
            titleUrdu: res.existingNovelUrduTitle,
            status: res.existingNovelStatus,
          });
        }
      } else {
        setDuplicateNovel(null);
        setIsDirty(false);
        setSuccessMessage('Novel draft created successfully.');
        const novelId = res.data?.novel_id;
        router.push(`/writer/novels/${novelId}/chapters`);
      }
    }
  };

  const handleDeleteDraft = async () => {
    if (!initialData?.id) return;
    setIsDeleting(true);
    setErrorMessage(null);
    const res = await deleteDraftNovelAction(initialData.id);
    setIsDeleting(false);
    if (!res.success) {
      setErrorMessage(res.error || 'Failed to delete draft novel.');
      setIsDeleteModalOpen(false);
    } else {
      setIsDirty(false);
      router.push('/writer/novels');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto">
      {/* Top Bar with Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/writer/novels"
            className="p-2 rounded-lg border border-border text-secondary hover:text-navy hover:bg-ivory transition-colors"
            title="Back to Novels List"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-serif font-bold text-navy flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-accent" />
              {isEditing ? 'Edit Novel Details' : 'Create New Novel Manuscript'}
            </h1>
            <p className="text-xs text-secondary mt-0.5">
              {isEditing
                ? 'Update manuscript titles, synopsis, pricing, and genre categorization.'
                : 'Enter novel metadata. You can upload chapters immediately after saving this draft.'}
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light transition-colors disabled:opacity-50 shadow-sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{isEditing ? 'Save Changes' : 'Save Draft & Proceed'}</span>
            </>
          )}
        </button>
      </div>

      {/* Alert Notices */}
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

      {/* Duplicate Novel Guidance Banner */}
      {duplicateNovel && (
        <div className="p-5 rounded-2xl bg-warning-soft border border-warning-border text-warning-text space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-accent-strong shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-navy">
                You already have a novel with this title / آپ کے پاس اس نام کا ناول پہلے سے موجود ہے
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                You already have an existing novel titled{' '}
                <strong className="text-navy">{duplicateNovel.titleEnglish}</strong>
                {duplicateNovel.titleUrdu ? ` (${duplicateNovel.titleUrdu})` : ''}
                {duplicateNovel.status ? ` in status ${duplicateNovel.status.toUpperCase()}` : ''}.
                Please do not create a duplicate novel entry — open your existing novel to add or manage chapters.
              </p>
              <p className="text-xs font-urdu text-secondary leading-relaxed pt-1" dir="rtl">
                آپ کے اکاؤنٹ میں اس نام کا ناول پہلے سے موجود ہے۔ نیا ناول بنانے کے بجائے اپنے موجودہ ناول میں ہی مزید ابواب (Chapters) شامل کریں۔
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 pl-8">
            <Link
              href={`/writer/novels/${duplicateNovel.id}/chapters`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light shadow-sm transition-colors"
            >
              <BookOpen className="w-4 h-4 text-accent" />
              <span>Manage Existing Novel Chapters →</span>
            </Link>
            <Link
              href={`/writer/novels/${duplicateNovel.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface text-secondary hover:text-navy text-xs font-semibold transition-colors"
            >
              <span>Edit Existing Novel</span>
            </Link>
          </div>
        </div>
      )}

      {/* Section 1: Titles & Cover Art */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-6">
        <h2 className="text-sm font-serif font-bold text-navy uppercase tracking-wider border-b border-border pb-3">
          1. Novel Titles & Cover Art
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Cover Art Upload (1 Column) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-main">
              Cover Art (2:3 Aspect Ratio)
            </label>
            <ImageUploader
              bucket="novel-assets"
              preset="cover"
              folder={userId}
              value={formData.cover_url}
              onChange={(val) => handleChange('cover_url', val)}
              disabled={isSubmitting}
              helperText="Recommended: 600x900px WebP/PNG/JPG. 2:3 vertical crop. Auto-compressed."
            />
            {fieldErrors.cover_url && (
              <p className="text-xs text-danger-text">{fieldErrors.cover_url[0]}</p>
            )}
          </div>

          {/* Titles & Language (2 Columns) */}
          <div className="md:col-span-2 space-y-4">
            {/* Urdu Title */}
            <div className="space-y-1.5" dir="rtl">
              <label className="block text-xs font-semibold text-main text-right">
                ناول کا عنوان (اردو میں) <span className="text-danger-text">*</span>
              </label>
              <input
                type="text"
                dir="rtl"
                value={formData.title_urdu}
                onChange={(e) => handleChange('title_urdu', e.target.value)}
                placeholder="مثال: پیرِ کامل، جنت کے پتے، نمل"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main font-urdu text-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
              {fieldErrors.title_urdu && (
                <p className="text-xs text-danger-text text-right">{fieldErrors.title_urdu[0]}</p>
              )}
            </div>

            {/* English Title & Romanized URL Slug */}
            <div className="space-y-1.5" dir="ltr">
              <label className="block text-xs font-semibold text-main">
                English / Roman Title <span className="text-danger-text">*</span>
              </label>
              <input
                type="text"
                value={formData.title_english}
                onChange={(e) => handleChange('title_english', e.target.value)}
                placeholder="e.g. Peer-e-Kamil, Jannat Kay Pattay, Namal"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
              {fieldErrors.title_english && (
                <p className="text-xs text-danger-text">{fieldErrors.title_english[0]}</p>
              )}
              
              {/* Live Slug Preview & Guidance */}
              <div className="rounded-lg bg-surface-muted/60 border border-border p-3 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-secondary font-mono text-[11px]">
                  <Globe className="w-3.5 h-3.5 text-accent-strong shrink-0" />
                  <span className="font-semibold text-main">Web Link:</span>
                  <span className="text-accent-strong break-all">
                    /novels/{initialData?.status === 'published' && initialData.slug
                      ? initialData.slug
                      : (generateNovelSlug(formData.title_english) || 'your-novel-slug')}
                  </span>
                  {initialData?.status === 'published' && (
                    <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-accent/10 text-accent-strong border border-border">
                      <Lock className="w-2.5 h-2.5" />
                      Locked
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-secondary leading-relaxed">
                  Enter English or Romanized title. This creates the permanent novel link and Google search snippet.
                </p>
                <p className="text-[11px] text-secondary leading-relaxed font-urdu text-right" dir="rtl">
                  اردو ناول کے عنوان کا رومن یا انگریزی تلفظ درج کریں (مثلاً &apos;Peer-e-Kamil&apos;)۔ یہی نام سرچ انجن اور ویب لنک کے لیے استعمال ہوگا۔
                </p>
              </div>
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-main">
                Language
              </label>
              <select
                value={formData.language}
                onChange={(e) => handleChange('language', e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-border bg-ivory text-main text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="ur">Urdu (اردو)</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Synopsis & Extended Description */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-6">
        <h2 className="text-sm font-serif font-bold text-navy uppercase tracking-wider border-b border-border pb-3">
          2. Synopsis & Description
        </h2>

        {/* Urdu Synopsis */}
        <div className="space-y-1.5" dir="rtl">
          <label className="block text-xs font-semibold text-main text-right">
            مختصر خلاصہ (اردو) <span className="text-danger-text">*</span>
          </label>
          <textarea
            dir="rtl"
            rows={4}
            value={formData.synopsis_urdu}
            onChange={(e) => handleChange('synopsis_urdu', e.target.value)}
            placeholder="کہانی کا مرکزی خیال اور سسپنس یہاں تحریر کریں۔ یہ خلاصہ ناول کے پبلک کارڈ پر قارئین کو ترغیب کے لیے پیش کیا جائے گا..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main font-urdu text-base leading-loose focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
          {fieldErrors.synopsis_urdu && (
            <p className="text-xs text-danger-text text-right">{fieldErrors.synopsis_urdu[0]}</p>
          )}
          <p className="text-[11px] text-secondary text-right">
            کم از کم ۱۰ حروف، زیادہ سے زیادہ ۳،۰۰۰ حروف۔
          </p>
        </div>

        {/* Detailed Description */}
        <div className="space-y-1.5" dir="rtl">
          <label className="block text-xs font-semibold text-main text-right">
            تفصیلی تعارف (اختیاری)
          </label>
          <textarea
            dir="rtl"
            rows={5}
            value={formData.description_urdu || ''}
            onChange={(e) => handleChange('description_urdu', e.target.value)}
            placeholder="ناول کے پس منظر، مرکزی کرداروں یا قارئین کے لیے خصوصی پیغام کی تفصیلات..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main font-urdu text-base leading-loose focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.description_urdu && (
            <p className="text-xs text-danger-text text-right">{fieldErrors.description_urdu[0]}</p>
          )}
        </div>
      </div>

      {/* Section 3: Genre Categorization */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-serif font-bold text-navy uppercase tracking-wider">
            3. Genres & Categorization <span className="text-danger-text">*</span>
          </h2>
          <p className="text-xs text-secondary mt-0.5">
            Select one or more categories representing the themes of this novel.
          </p>
        </div>

        {fieldErrors.genre_ids && (
          <p className="text-xs text-danger-text font-medium">{fieldErrors.genre_ids[0]}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {availableGenres.map((genre) => {
            const isSelected = formData.genre_ids.includes(genre.id);
            return (
              <button
                key={genre.id}
                type="button"
                onClick={() => handleGenreToggle(genre.id)}
                className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                  isSelected
                    ? 'border-navy bg-navy/5 text-navy font-semibold ring-1 ring-navy'
                    : 'border-border bg-ivory hover:border-border text-secondary'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs truncate">{genre.name_english}</div>
                  <div className="font-urdu text-[11px] text-accent truncate" dir="rtl">
                    {genre.name_urdu}
                  </div>
                </div>

                <div
                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                    isSelected
                      ? 'bg-navy border-navy text-white'
                      : 'border-border bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 4: Pricing & Revenue Calculator */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-sm font-serif font-bold text-navy uppercase tracking-wider">
            4. Pricing & Author Payout
          </h2>
          <p className="text-xs text-secondary mt-0.5">
            Set the purchase price in Pakistani Rupees (PKR). Minimum PKR {minPrice}. Readers can try your free preview chapters before buying.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Price Input */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-main">
              Novel Price (PKR) <span className="text-danger-text">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-secondary">
                PKR
              </span>
              <input
                type="number"
                min={minPrice}
                max={maxPrice}
                step="1"
                value={formData.price_pkr}
                onChange={(e) => handleChange('price_pkr', Number(e.target.value))}
                className="w-full pl-14 pr-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main font-bold text-base focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                required
              />
            </div>
            {fieldErrors.price_pkr && (
              <p className="text-xs text-danger-text">{fieldErrors.price_pkr[0]}</p>
            )}
            <p className="text-[11px] text-secondary">
              Minimum PKR {minPrice}. Maximum allowed novel price: PKR {maxPrice.toLocaleString()}. Whole rupees only. Readers can try your free preview chapters before buying.
            </p>
          </div>

          {/* Realtime Payout Split Calculator */}
          <div className="p-4 rounded-xl bg-ivory border border-border space-y-3">
            <div className="text-xs font-bold text-navy flex items-center justify-between">
              <span>Expected Earnings Breakdown</span>
              <span className="text-[10px] text-secondary font-normal italic">
                (estimate; final rate is locked at verification)
              </span>
            </div>

            {isPriceValid ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-secondary">
                  <span>Gross Reader Payment:</span>
                  <span className="font-mono font-bold text-main">
                    PKR {price.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-success-text font-semibold border-t border-border pt-1.5">
                  <span>Author Net Retention ({100 - platformRate}%):</span>
                  <span className="font-mono text-sm">
                    PKR {estimatedWriterNet.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-secondary text-[11px]">
                  <span>Platform Fee ({platformRate}%):</span>
                  <span className="font-mono">
                    PKR {estimatedCommission.toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning-border/20 text-xs text-warning-text space-y-1">
                <p className="font-semibold">Enter a valid novel price</p>
                <p className="text-[11px] text-warning-text">
                  Price must be a whole rupee amount between PKR {minPrice} and PKR {maxPrice.toLocaleString()} to calculate author payout.
                </p>
              </div>
            )}

            <p className="text-[10px] text-secondary leading-tight pt-1">
              Note: Changing the price of a published novel only affects new reader orders. Past verified purchases will not be affected.
            </p>
          </div>
        </div>
      </div>

      {/* Section 5: Author Rights Declaration */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-serif font-bold text-navy uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-accent" />
          5. Rights & Copyright Declaration
        </h2>

        <div className="p-4 rounded-xl bg-ivory border border-border">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.rights_declaration_accepted}
              onChange={(e) => handleChange('rights_declaration_accepted', e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-border text-navy focus:ring-ring"
              required
            />
            <div className="text-xs space-y-1">
              <span className="font-bold text-main block">
                I declare that I hold full legal copyrights and distribution rights for this manuscript.
              </span>
              <p className="text-secondary leading-relaxed">
                By ticking this box, you confirm that this novel is your original literary creation, does not infringe upon any third-party intellectual property, and adheres to UNB Premium author publishing standards.
              </p>
            </div>
          </label>
          {fieldErrors.rights_declaration_accepted && (
            <p className="text-xs text-danger-text mt-2 pl-7 font-semibold">
              {fieldErrors.rights_declaration_accepted[0]}
            </p>
          )}
        </div>
      </div>

      {/* Section 6: Danger Zone (Draft Deletion) */}
      {isEditing && initialData?.status === 'draft' && (
        <div className="bg-surface rounded-2xl border border-danger-border/60 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-serif font-bold text-danger-text uppercase tracking-wider flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-danger-text" />
                Delete Draft Novel
              </h2>
              <p className="text-xs text-secondary mt-1">
                Permanently delete this draft novel and its unpublished chapters. This action cannot be undone.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-danger-border bg-danger-soft text-danger-text hover:bg-danger-soft/80 text-xs font-semibold shrink-0 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Draft Novel</span>
            </button>
          </div>
        </div>
      )}

      {/* Footer Submit */}
      <div className="flex items-center justify-between bg-surface rounded-xl border border-border p-4 shadow-sm">
        <Link
          href="/writer/novels"
          className="text-xs font-semibold text-secondary hover:text-navy"
        >
          Cancel
        </Link>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light transition-colors disabled:opacity-50 shadow-sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{isEditing ? 'Save Changes' : 'Save Draft & Proceed to Chapters'}</span>
            </>
          )}
        </button>
      </div>

      {/* Delete Draft Confirmation Modal */}
      {isDeleteModalOpen && initialData && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setIsDeleteModalOpen(false);
          }}
        >
          <div className="bg-surface rounded-2xl border border-border max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-danger-soft border border-danger-border text-danger-text flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="font-serif font-bold text-base text-navy">
                Delete Draft Novel?
              </h3>
              <p className="text-sm font-semibold text-main">
                {initialData.title_english} {initialData.title_urdu ? `• ${initialData.title_urdu}` : ''}
              </p>
              <p className="text-xs text-secondary leading-relaxed">
                Are you sure you want to permanently delete this draft novel? All draft chapters and manuscript text inside it will be permanently deleted. This action cannot be undone.
              </p>
              <p className="text-xs font-urdu text-secondary" dir="rtl">
                کیا آپ واقعی اس ڈرافٹ ناول کو مستقل طور پر حذف کرنا چاہتے ہیں؟ اس ناول کے تمام غیر شائع شدہ ابواب حذف ہو جائیں گے۔
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-main disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger-text text-white text-xs font-semibold hover:bg-danger-text/90 disabled:opacity-50 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete Draft</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
