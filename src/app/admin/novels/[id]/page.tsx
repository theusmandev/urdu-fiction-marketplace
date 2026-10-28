import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { UrduText } from '@/components/urdu/UrduText';
import { ChapterBody } from '@/components/reader/ChapterBody';
import { StatusBadge } from '@/components/ui/status-badge';
import { NovelReviewActions } from '@/components/admin/NovelReviewActions';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  DollarSign,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Star,
  User,
  Tag,
  AlertCircle,
  Eye,
} from 'lucide-react';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AdminNovelReviewPage({ params }: PageProps) {
  await requireRole('admin', '/admin');
  const { id: novelId } = await params;

  const supabase = await createServerClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(novelId);

  let queryBuilder = supabase
    .from('novels')
    .select(`
      id,
      slug,
      title_urdu,
      title_english,
      synopsis_urdu,
      description_urdu,
      cover_url,
      price_pkr,
      status,
      is_featured,
      rights_declaration_accepted,
      moderation_reason,
      total_chapters,
      created_at,
      published_at,
      writer_profiles!writer_id (
        id,
        pen_name_english,
        pen_name_urdu,
        status
      ),
      novel_genres (
        genre:genres!genre_id (
          id,
          name_english,
          name_urdu,
          slug
        )
      ),
      chapters (
        id,
        chapter_number,
        title_urdu,
        content_urdu,
        word_count,
        is_free_preview,
        is_published,
        created_at
      )
    `);

  if (isUuid) {
    queryBuilder = queryBuilder.eq('id', novelId);
  } else {
    queryBuilder = queryBuilder.eq('slug', novelId);
  }

  const { data: novel, error } = await queryBuilder.maybeSingle();

  if (error) {
    console.error('[AdminNovelReviewPage] Database/RLS error fetching novel:', {
      novelId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-8">
        <Link
          href="/admin/novels"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-main transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Moderation Queue</span>
        </Link>
        <div className="p-6 rounded-2xl bg-danger-soft border border-danger-border space-y-3">
          <div className="flex items-center gap-2 text-danger-text font-bold text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>Failed to Load Novel for Editorial Review</span>
          </div>
          <p className="text-xs text-danger-text leading-relaxed">
            A database error occurred while retrieving this manuscript:
          </p>
          <div className="p-3 rounded-xl bg-surface border border-danger-border text-xs font-mono text-danger-text">
            {error.message} {error.code ? `(Code: ${error.code})` : ''}
          </div>
          {error.hint && (
            <p className="text-[11px] text-muted italic">Hint: {error.hint}</p>
          )}
        </div>
      </div>
    );
  }

  if (!novel) {
    notFound();
  }

  const writer = Array.isArray(novel.writer_profiles)
    ? novel.writer_profiles[0]
    : novel.writer_profiles;

  interface NovelGenreJoin {
    genre: {
      id: string;
      name_english: string;
      name_urdu: string;
      slug: string;
    } | null;
  }

  const novelGenreRows = (novel.novel_genres || []) as unknown as NovelGenreJoin[];
  const genres = novelGenreRows
    .map((ng) => ng.genre)
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  const sortedChapters = [...(novel.chapters || [])].sort(
    (a, b) => a.chapter_number - b.chapter_number
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/novels"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-main transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Moderation Queue</span>
        </Link>

        <div className="flex items-center gap-2">
          <StatusBadge status={novel.status} />
          {novel.is_featured && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-warning-soft text-warning-text border border-warning-border">
              <Star className="w-3 h-3 fill-accent-strong/20 text-accent-strong" />
              <span>Featured</span>
            </span>
          )}
        </div>
      </div>

      {/* Moderation Alert Banner if reason exists */}
      {novel.moderation_reason && (
        <div className="p-4 rounded-2xl bg-warning-soft border border-warning-border flex items-start gap-3 text-xs text-warning-text">
          <AlertCircle className="w-4 h-4 text-accent-strong shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-warning-text block">Existing Moderation Note / Reason:</span>
            <p className="leading-relaxed text-warning-text">{novel.moderation_reason}</p>
          </div>
        </div>
      )}

      {/* Novel Header Preview Card */}
      <div className="bg-surface border border-border rounded-2xl p-5 md:p-6 shadow-card">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Cover Art Preview */}
          <div className="shrink-0 w-36 sm:w-44 aspect-[2/3] rounded-xl overflow-hidden bg-surface-muted border border-border relative shadow-sm mx-auto md:mx-0">
            {novel.cover_url ? (
              <Image
                src={novel.cover_url}
                alt={novel.title_english}
                fill
                sizes="(max-width: 768px) 144px, 176px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted p-4 text-center">
                <BookOpen className="w-8 h-8 mb-2" />
                <span className="text-[10px] uppercase font-semibold">No Cover Art</span>
              </div>
            )}
          </div>

          {/* Metadata & Actions */}
          <div className="flex-1 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-main tracking-tight">
                  {novel.title_english}
                </h1>
                <UrduText as="div" size="2xl" className="text-accent-strong py-1">
                  {novel.title_urdu}
                </UrduText>
              </div>

              {/* Author & Taxonomy Badges */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                <Link
                  href={`/admin/writers/${writer?.id}`}
                  className="flex items-center gap-1.5 text-main hover:text-accent-admin transition-colors bg-surface-muted px-2.5 py-1 rounded-lg border border-border"
                >
                  <User className="w-3.5 h-3.5 text-accent-admin" />
                  <span className="font-semibold">{writer?.pen_name_english}</span>
                  <UrduText as="span" size="xs" className="text-accent-strong">
                    ({writer?.pen_name_urdu})
                  </UrduText>
                </Link>

                <div className="flex items-center gap-1 font-mono text-main">
                  <DollarSign className="w-3.5 h-3.5 text-success" />
                  <span>PKR {Number(novel.price_pkr).toLocaleString()}</span>
                </div>

                <div className="flex items-center gap-1 font-mono text-muted">
                  <FileText className="w-3.5 h-3.5 text-muted" />
                  <span>{novel.total_chapters} Chapters ({sortedChapters.length} loaded)</span>
                </div>

                <div className="flex items-center gap-1 text-muted">
                  <Calendar className="w-3.5 h-3.5 text-muted" />
                  <span>Submitted {new Date(novel.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Genre Tags */}
              {genres.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Tag className="w-3 h-3 text-muted mr-1" />
                  {genres.map((g) => (
                    <span
                      key={g.id}
                      className="px-2 py-0.5 rounded-md text-[11px] bg-surface-muted text-main border border-border flex items-center gap-1"
                    >
                      <span>{g.name_english}</span>
                      <UrduText as="span" size="xs" className="text-accent-strong font-normal">
                        ({g.name_urdu})
                      </UrduText>
                    </span>
                  ))}
                </div>
              )}

              {/* Rights Declaration Status */}
              <div className="pt-1">
                {novel.rights_declaration_accepted ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-success-soft border border-success-border text-success-text text-xs font-semibold">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    <span>Intellectual Rights Declaration Confirmed by Author</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-danger-soft border border-danger-border text-danger-text text-xs font-semibold">
                    <ShieldAlert className="w-4 h-4 text-danger-text" />
                    <span>Missing Rights Declaration</span>
                  </div>
                )}
              </div>
            </div>

            {/* Moderation Action Box */}
            <div className="pt-4 border-t border-border">
              <div className="text-[11px] font-semibold text-muted mb-2 uppercase tracking-wider">
                Editorial Moderation Panel
              </div>
              <NovelReviewActions
                novelId={novel.id}
                status={novel.status}
                isFeatured={novel.is_featured}
                rightsDeclared={novel.rights_declaration_accepted}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Synopsis and Description Preview in Real Reader Typography */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Synopsis */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-sm font-bold text-main flex items-center gap-2">
              <Eye className="w-4 h-4 text-accent-strong" />
              <span>خلاصہ (Synopsis Preview)</span>
            </h2>
            <span className="text-[10px] text-muted font-mono">Urdu RTL Nastaliq</span>
          </div>
          <div className="bg-surface-muted p-4 rounded-xl border border-border">
            <UrduText as="div" size="base" className="leading-[2.2] text-main">
              {novel.synopsis_urdu}
            </UrduText>
          </div>
        </div>

        {/* Detailed Description */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-sm font-bold text-main flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent-admin" />
              <span>تفصیل (Full Description)</span>
            </h2>
            <span className="text-[10px] text-muted font-mono">Urdu RTL Nastaliq</span>
          </div>
          <div className="bg-surface-muted p-4 rounded-xl border border-border">
            {novel.description_urdu ? (
              <UrduText as="div" size="base" className="leading-[2.2] text-main">
                {novel.description_urdu}
              </UrduText>
            ) : (
              <div className="text-xs text-muted italic">No extended description provided.</div>
            )}
          </div>
        </div>
      </div>

      {/* Complete Chapters Manuscript Review */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h2 className="text-base font-bold text-main flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-accent-strong" />
              <span>Complete Manuscript Preview ({sortedChapters.length} Chapters)</span>
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Inspect manuscript content rendered in reader typography, line spacing, and Nastaliq script.
            </p>
          </div>
          <span className="text-[10px] text-muted">
            Manuscript Inspection
          </span>
        </div>

        {sortedChapters.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted border border-dashed border-border rounded-xl">
            This novel currently has 0 chapters uploaded.
          </div>
        ) : (
          <div className="space-y-4">
            {sortedChapters.map((chapter) => (
              <details
                key={chapter.id}
                className="group border border-border rounded-xl bg-surface overflow-hidden transition-all shadow-sm"
              >
                <summary className="p-4 cursor-pointer flex items-center justify-between gap-3 hover:bg-surface-muted/60 transition-colors select-none">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-surface-muted text-main font-mono text-xs font-bold flex items-center justify-center shrink-0 border border-border">
                      {chapter.chapter_number}
                    </span>
                    <div>
                      <UrduText as="div" size="lg" className="text-main py-0">
                        {chapter.title_urdu}
                      </UrduText>
                      <div className="text-[11px] text-muted font-mono flex items-center gap-2">
                        <span>{chapter.word_count} words</span>
                        <span>•</span>
                        <span>{chapter.is_free_preview ? 'Free Preview' : 'Paid Entitlement'}</span>
                        {!chapter.is_published && (
                          <>
                            <span>•</span>
                            <span className="text-warning-text">Unpublished draft</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {chapter.is_free_preview && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-success-soft text-success-text border border-success-border">
                        Free Sample
                      </span>
                    )}
                    <span className="text-xs text-muted group-open:rotate-180 transition-transform">
                      ▼
                    </span>
                  </div>
                </summary>

                <div className="p-5 md:p-6 border-t border-border bg-surface-muted/30">
                  <div className="max-w-3xl mx-auto py-2">
                    <ChapterBody
                      text={chapter.content_urdu}
                      fontSize="lg"
                      lineHeight="relaxed"
                      userSelect="text"
                    />
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
