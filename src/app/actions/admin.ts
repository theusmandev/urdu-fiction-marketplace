'use server';

import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { dispatchPendingEmails } from '@/lib/email/dispatch-outbox';
import { isSitePalette, ALLOWED_SITE_PALETTES, type SitePalette } from '@/lib/settings/palette';
import {
  suspendNovelSchema,
  unsuspendNovelSchema,
  setNovelFeaturedSchema,
  createGenreSchema,
  updateGenreSchema,
  platformSettingsSchema,
  writerCommissionTermsSchema,
  adminUpdateUserRoleStatusSchema,
  rejectNovelSchema,
  writerActionReasonSchema,
  impersonateWriterSchema,
  retentionSettingsSchema,
  type RetentionSettingsInput,
  writerAnnouncementSchema,
  type WriterAnnouncementInput,
  dashboardTimeframeSchema,
} from '@/lib/admin/schemas';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { cleanupOldPaymentProofFiles } from '@/lib/retention/storage-cleanup';
import type { UserRole, AdminDashboardAnalytics } from '@/types/database';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Shared cache invalidation helper for public marketplace routes.
 * Ensures ISR static pages and dynamic routes are purged when novels or writers change status.
 */
export async function revalidatePublicMarketplacePaths(options?: {
  novelSlug?: string;
  novelSlugs?: string[];
  genreSlug?: string;
  writerUsername?: string;
}) {
  try {
    revalidatePath('/', 'layout');
    revalidatePath('/');
    revalidatePath('/novels');
    revalidatePath('/writers');
    revalidatePath('/sitemap.xml');

    const slugs = new Set<string>();
    if (options?.novelSlug) slugs.add(options.novelSlug);
    if (options?.novelSlugs) {
      for (const s of options.novelSlugs) {
        if (s) slugs.add(s);
      }
    }

    for (const slug of slugs) {
      revalidatePath(`/novels/${slug}`);
      revalidatePath(`/checkout/${slug}`);
      revalidatePath(`/novels/${slug}/read`, 'layout');
    }

    if (options?.genreSlug) {
      revalidatePath(`/genres/${options.genreSlug}`);
    }

    if (options?.writerUsername) {
      revalidatePath(`/writers/${options.writerUsername}`);
    }
  } catch (err) {
    console.error('[revalidatePublicMarketplacePaths] error during revalidation:', err);
  }
}

async function getNovelAndWriterMetadata(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  novelId: string
): Promise<{ novelSlug?: string; writerUsername?: string }> {
  try {
    const { data: novelData, error: novelError } = await supabase
      .from('novels')
      .select('slug, writer_id')
      .eq('id', novelId)
      .maybeSingle();

    if (novelError) {
      console.error('[getNovelAndWriterMetadata] novel query error:', novelError.code, novelError.message);
      return {};
    }

    if (!novelData) return {};

    let writerUsername: string | undefined;
    if (novelData.writer_id) {
      const { data: writer, error: writerError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', novelData.writer_id)
        .maybeSingle();

      if (writerError) {
        console.error('[getNovelAndWriterMetadata] writer query error:', writerError.code, writerError.message);
      } else if (writer?.username) {
        writerUsername = writer.username;
      }
    }

    return { novelSlug: novelData.slug, writerUsername };
  } catch (err) {
    console.error('[getNovelAndWriterMetadata] unexpected error:', err);
    return {};
  }
}

async function getWriterMetadataAndNovels(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  writerId: string
): Promise<{ writerUsername?: string; novelSlugs: string[] }> {
  try {
    const [profileRes, novelsRes] = await Promise.all([
      supabase.from('profiles').select('username').eq('id', writerId).maybeSingle(),
      supabase.from('novels').select('slug').eq('writer_id', writerId),
    ]);

    const { data: writerProfile, error: profileError } = profileRes;
    const { data: writerNovels, error: novelsError } = novelsRes;

    if (profileError) {
      console.error('[getWriterMetadataAndNovels] profile query error:', profileError.code, profileError.message);
    }
    if (novelsError) {
      console.error('[getWriterMetadataAndNovels] novels query error:', novelsError.code, novelsError.message);
    }

    return {
      writerUsername: writerProfile?.username,
      novelSlugs: (writerNovels || []).map((n) => n.slug),
    };
  } catch (err) {
    console.error('[getWriterMetadataAndNovels] unexpected error:', err);
    return { novelSlugs: [] };
  }
}

// -----------------------------------------------------------------------------
// 1. WRITER APPROVAL & GOVERNANCE ACTIONS
// -----------------------------------------------------------------------------

export async function adminApproveWriterAction(writerId: string): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  const { writerUsername, novelSlugs } = await getWriterMetadataAndNovels(supabase, writerId);

  const { error } = await supabase.rpc('approve_writer', {
    p_writer_id: writerId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/writers');
  revalidatePath(`/admin/writers/${writerId}`);

  await revalidatePublicMarketplacePaths({
    writerUsername,
    novelSlugs,
  });

  try {
    await dispatchPendingEmails(5);
  } catch (dispatchErr) {
    console.error('Non-blocking outbox dispatch after writer approval encountered an error:', dispatchErr);
  }

  return { success: true };
}

export async function adminRejectWriterAction(
  writerId: string,
  reason: string
): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = writerActionReasonSchema.safeParse({ writerId, reason });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();

  const { writerUsername, novelSlugs } = await getWriterMetadataAndNovels(supabase, parsed.data.writerId);

  const { error } = await supabase.rpc('reject_writer', {
    p_writer_id: parsed.data.writerId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/writers');
  revalidatePath(`/admin/writers/${writerId}`);

  await revalidatePublicMarketplacePaths({
    writerUsername,
    novelSlugs,
  });

  try {
    await dispatchPendingEmails(5);
  } catch (dispatchErr) {
    console.error('Non-blocking outbox dispatch after writer rejection encountered an error:', dispatchErr);
  }

  return { success: true };
}

export async function adminSuspendWriterAction(
  writerId: string,
  reason: string
): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = writerActionReasonSchema.safeParse({ writerId, reason });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();

  const { writerUsername, novelSlugs } = await getWriterMetadataAndNovels(supabase, parsed.data.writerId);

  const { error } = await supabase.rpc('suspend_writer', {
    p_writer_id: parsed.data.writerId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/writers');
  revalidatePath(`/admin/writers/${writerId}`);

  await revalidatePublicMarketplacePaths({
    writerUsername,
    novelSlugs,
  });

  return { success: true };
}

export async function adminSetWriterCommissionTermsAction(
  writerId: string,
  customCommissionRate: number | null | undefined,
  unpaidCommissionLimit: number | undefined,
  reason: string
): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = writerCommissionTermsSchema.safeParse({
    writerId,
    customCommissionRate,
    unpaidCommissionLimit,
    reason,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('set_writer_commission_terms', {
    p_writer_id: parsed.data.writerId,
    p_custom_rate: parsed.data.customCommissionRate ?? null,
    p_unpaid_limit: parsed.data.unpaidCommissionLimit ?? null,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/writers');
  revalidatePath(`/admin/writers/${writerId}`);
  return { success: true, data };
}

export interface ImpersonationResult {
  impersonationUrl: string;
  targetEmail: string;
}

export async function adminGenerateWriterImpersonationLinkAction(
  writerId: string,
  reason: string
): Promise<ActionResult<ImpersonationResult>> {
  await requireRole('admin', '/admin');

  const parsed = impersonateWriterSchema.safeParse({ writerId, reason });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Validation failed for impersonation link',
    };
  }

  const supabase = await createServerClient();

  // 1. Authorize, validate, and record immutable audit log in PostgreSQL
  const { data: prepareData, error: rpcError } = await supabase.rpc(
    'admin_prepare_impersonation_link',
    {
      p_target_user_id: parsed.data.writerId,
      p_reason: parsed.data.reason,
    }
  );

  if (rpcError) {
    return {
      success: false,
      error: rpcError.message || 'Failed to authorize impersonation link generation',
    };
  }

  const targetEmail = prepareData?.email;
  if (!targetEmail) {
    return {
      success: false,
      error: 'Target account email was not returned by authorization check.',
    };
  }

  // 2. Generate magic link using dedicated administrative client
  let adminClient;
  try {
    adminClient = createAdminSupabaseClient();
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'Server configuration error: missing admin credentials',
    };
  }

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
  });

  if (linkError) {
    return {
      success: false,
      error: linkError.message || 'Supabase Auth failed to generate magic link token.',
    };
  }

  const hashedToken = linkData?.properties?.hashed_token;
  if (!hashedToken) {
    return {
      success: false,
      error: 'Failed to obtain secure authentication token from auth provider.',
    };
  }

  // 3. Construct direct PKCE-free callback URL
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://premium.urdunovelbanks.com'
  ).replace(/\/+$/, '');

  const impersonationUrl = `${baseUrl}/auth/callback?token_hash=${encodeURIComponent(
    hashedToken
  )}&type=magiclink&next=%2Fwriter`;

  revalidatePath('/admin');
  revalidatePath('/admin/audit');
  revalidatePath(`/admin/writers/${parsed.data.writerId}`);

  return {
    success: true,
    data: {
      impersonationUrl,
      targetEmail,
    },
  };
}

// -----------------------------------------------------------------------------
// 2. NOVEL MODERATION & GOVERNANCE ACTIONS
// -----------------------------------------------------------------------------

export async function adminApproveNovelAction(
  novelId: string,
  checklist?: Record<string, boolean> | null
): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  const { novelSlug, writerUsername } = await getNovelAndWriterMetadata(supabase, novelId);

  const { error } = await supabase.rpc('approve_novel', {
    p_novel_id: novelId,
    p_checklist: checklist ? (checklist as Record<string, boolean>) : null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/novels');
  revalidatePath(`/admin/novels/${novelId}`);

  await revalidatePublicMarketplacePaths({
    novelSlug,
    writerUsername,
  });

  try {
    await dispatchPendingEmails(5);
  } catch (dispatchErr) {
    console.error('Non-blocking outbox dispatch after novel approval encountered an error:', dispatchErr);
  }

  return { success: true };
}

export async function adminRejectNovelAction(
  novelId: string,
  reason: string
): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = rejectNovelSchema.safeParse({ novelId, reason });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();

  const { novelSlug, writerUsername } = await getNovelAndWriterMetadata(supabase, parsed.data.novelId);

  const { error } = await supabase.rpc('reject_novel', {
    p_novel_id: parsed.data.novelId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/novels');
  revalidatePath(`/admin/novels/${novelId}`);

  await revalidatePublicMarketplacePaths({
    novelSlug,
    writerUsername,
  });

  try {
    await dispatchPendingEmails(5);
  } catch (dispatchErr) {
    console.error('Non-blocking outbox dispatch after novel rejection encountered an error:', dispatchErr);
  }

  return { success: true };
}

export async function adminSuspendNovelAction(
  novelId: string,
  reason: string
): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = suspendNovelSchema.safeParse({ novelId, reason });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();

  const { novelSlug, writerUsername } = await getNovelAndWriterMetadata(supabase, parsed.data.novelId);

  const { error } = await supabase.rpc('suspend_novel', {
    p_novel_id: parsed.data.novelId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/novels');
  revalidatePath(`/admin/novels/${novelId}`);

  await revalidatePublicMarketplacePaths({
    novelSlug,
    writerUsername,
  });

  return { success: true };
}

export async function adminUnsuspendNovelAction(novelId: string): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = unsuspendNovelSchema.safeParse({ novelId });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();

  const { novelSlug, writerUsername } = await getNovelAndWriterMetadata(supabase, parsed.data.novelId);

  const { error } = await supabase.rpc('unsuspend_novel', {
    p_novel_id: parsed.data.novelId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/novels');
  revalidatePath(`/admin/novels/${novelId}`);

  await revalidatePublicMarketplacePaths({
    novelSlug,
    writerUsername,
  });

  return { success: true };
}

export async function adminSetNovelFeaturedAction(
  novelId: string,
  featured: boolean
): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = setNovelFeaturedSchema.safeParse({ novelId, featured });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();

  const { novelSlug, writerUsername } = await getNovelAndWriterMetadata(supabase, parsed.data.novelId);

  const { error } = await supabase.rpc('set_novel_featured', {
    p_novel_id: parsed.data.novelId,
    p_featured: parsed.data.featured,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/novels');
  revalidatePath(`/admin/novels/${novelId}`);

  await revalidatePublicMarketplacePaths({
    novelSlug,
    writerUsername,
  });

  return { success: true };
}

// -----------------------------------------------------------------------------
// 3. GENRES MANAGEMENT ACTIONS
// -----------------------------------------------------------------------------

export async function adminCreateGenreAction(formData: {
  nameEnglish: string;
  nameUrdu: string;
  slug?: string;
  displayOrder?: number;
}): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = createGenreSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('create_genre', {
    p_name_english: parsed.data.nameEnglish,
    p_name_urdu: parsed.data.nameUrdu,
    p_slug: parsed.data.slug || null,
    p_display_order: parsed.data.displayOrder,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/genres');
  revalidatePath('/writer/novels/new');
  return { success: true, data };
}

export async function adminUpdateGenreAction(formData: {
  genreId: string;
  nameEnglish: string;
  nameUrdu: string;
  slug?: string;
  isActive?: boolean;
}): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = updateGenreSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('update_genre', {
    p_genre_id: parsed.data.genreId,
    p_name_english: parsed.data.nameEnglish,
    p_name_urdu: parsed.data.nameUrdu,
    p_slug: parsed.data.slug || null,
    p_is_active: parsed.data.isActive,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/genres');
  return { success: true, data };
}

export async function adminReorderGenresAction(
  orders: Array<{ id: string; display_order: number }>
): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('reorder_genres', {
    p_genre_orders: orders,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/genres');
  return { success: true, data };
}

export async function adminDeleteGenreAction(genreId: string): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('delete_genre', {
    p_genre_id: genreId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/genres');
  return { success: true, data };
}

// -----------------------------------------------------------------------------
// 4. PLATFORM SETTINGS ACTIONS
// -----------------------------------------------------------------------------

export async function adminUpdatePlatformSettingsAction(formData: {
  defaultCommissionRate: number;
  defaultUnpaidCommissionLimit: number;
  disputeWindowDays: number;
  minNovelPricePkr: number;
  maxNovelPricePkr: number;
  maxOrdersPerHour?: number;
  maxChapterReadsPerWindow?: number;
  chapterReadWindowMinutes?: number;
  invoiceDueDays?: number;
  overdueGraceDays?: number;
  minDisputeWaitHours?: number;
  verificationReminderHours?: number;
  supportEmail: string;
  tipsEnabled?: boolean;
  tipMinPkr?: number;
  tipMaxPkr?: number;
  maxTipsPerHour?: number;
  tipDailyCapPkrPerReader?: number;
  tipConfirmReminderHours?: number;
  watermarkEnabled?: boolean;
}): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = platformSettingsSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('update_platform_settings', {
    p_default_commission_rate: parsed.data.defaultCommissionRate,
    p_default_unpaid_commission_limit: parsed.data.defaultUnpaidCommissionLimit,
    p_dispute_window_days: parsed.data.disputeWindowDays,
    p_min_novel_price_pkr: parsed.data.minNovelPricePkr,
    p_max_novel_price_pkr: parsed.data.maxNovelPricePkr,
    p_support_email: parsed.data.supportEmail,
    p_max_orders_per_hour: parsed.data.maxOrdersPerHour,
    p_max_chapter_reads_per_window: parsed.data.maxChapterReadsPerWindow,
    p_chapter_read_window_minutes: parsed.data.chapterReadWindowMinutes,
    p_invoice_due_days: parsed.data.invoiceDueDays,
    p_overdue_grace_days: parsed.data.overdueGraceDays,
    p_min_dispute_wait_hours: parsed.data.minDisputeWaitHours,
    p_verification_reminder_hours: parsed.data.verificationReminderHours,
    p_tips_enabled: parsed.data.tipsEnabled,
    p_tip_min_pkr: parsed.data.tipMinPkr,
    p_tip_max_pkr: parsed.data.tipMaxPkr,
    p_max_tips_per_hour: parsed.data.maxTipsPerHour,
    p_tip_daily_cap_pkr_per_reader: parsed.data.tipDailyCapPkrPerReader,
    p_tip_confirm_reminder_hours: parsed.data.tipConfirmReminderHours,
    p_watermark_enabled: parsed.data.watermarkEnabled,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/settings');
  revalidatePath('/writer');
  revalidatePath('/writer/commission');
  revalidatePath('/writer/earnings');
  revalidatePath('/read');
  revalidatePath('/', 'layout');
  return { success: true, data };
}

export async function toggleWatermarkAction(enabled: boolean): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('set_watermark_enabled', {
    p_enabled: Boolean(enabled),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/settings');
  revalidatePath('/read');
  return { success: true, data };
}

// -----------------------------------------------------------------------------
// 5. USER ROLE & ACTIVE STATUS ACTIONS
// -----------------------------------------------------------------------------

export async function adminUpdateUserRoleStatusAction(formData: {
  userId: string;
  role: UserRole;
  isActive: boolean;
  reason: string;
}): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = adminUpdateUserRoleStatusSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();

  const { writerUsername, novelSlugs } = await getWriterMetadataAndNovels(supabase, parsed.data.userId);

  const { data, error } = await supabase.rpc('admin_update_user_role_status', {
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
    p_is_active: parsed.data.isActive,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/users');

  await revalidatePublicMarketplacePaths({
    writerUsername,
    novelSlugs,
  });

  return { success: true, data };
}

// -----------------------------------------------------------------------------
// 6. SITE APPEARANCE & THEME PALETTE ACTIONS
// -----------------------------------------------------------------------------

export async function adminSetSitePaletteAction(
  palette: string,
  note?: string | null
): Promise<ActionResult<{ palette: SitePalette; updatedAt: string }>> {
  await requireRole('admin', '/admin');

  if (!isSitePalette(palette)) {
    return {
      success: false,
      error: `Invalid site palette. Allowed values: ${ALLOWED_SITE_PALETTES.join(', ')}`,
    };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('set_site_palette', {
    p_palette: palette,
    p_note: note?.trim() || null,
  });

  if (error) {
    console.error('[adminSetSitePaletteAction] RPC error:', error);
    return { success: false, error: error.message };
  }

  const result = data as { palette: SitePalette; updated_at: string };

  try {
    revalidateTag('site-settings', 'max');
  } catch (err) {
    console.warn('[adminSetSitePaletteAction] revalidateTag warning:', err);
  }

  try {
    revalidatePath('/', 'layout');
  } catch (err) {
    console.warn('[adminSetSitePaletteAction] revalidatePath warning:', err);
  }

  return {
    success: true,
    data: {
      palette: result.palette,
      updatedAt: result.updated_at,
    },
  };
}

// -----------------------------------------------------------------------------
// SOCIAL LINKS ACTION
// -----------------------------------------------------------------------------

export interface SocialLinksInput {
  facebook?: string;
  whatsapp?: string;
  pinterest?: string;
  instagram?: string;
  youtube?: string;
  telegram?: string;
}

function isValidUrlOrEmpty(val: string | undefined): boolean {
  if (!val || val.trim() === '') return true;
  try {
    const url = new URL(val.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function updateSocialLinksAction(
  input: SocialLinksInput
): Promise<ActionResult> {
  await requireRole('admin', '/admin');

  const fields = ['facebook', 'whatsapp', 'pinterest', 'instagram', 'youtube', 'telegram'] as const;
  for (const field of fields) {
    if (!isValidUrlOrEmpty(input[field])) {
      return { success: false, error: `Invalid URL for ${field}. Must be a valid http/https URL or empty.` };
    }
  }

  // Build clean object — store only non-empty values
  const social_links: SocialLinksInput = {};
  for (const field of fields) {
    const val = input[field]?.trim();
    if (val) social_links[field] = val;
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('platform_settings')
    .update({ social_links })
    .eq('id', 1);

  if (error) {
    console.error('[updateSocialLinksAction] Supabase error', error.code, error.message);
    return { success: false, error: error.message };
  }

  try {
    revalidateTag('social-links', 'max');
  } catch (err) {
    console.warn('[updateSocialLinksAction] revalidateTag warning:', err);
  }

  try {
    revalidatePath('/', 'layout');
    revalidatePath('/admin/settings', 'page');
  } catch (err) {
    console.warn('[updateSocialLinksAction] revalidatePath warning:', err);
  }

  return { success: true };
}

// -----------------------------------------------------------------------------
// 12. DATA & STORAGE RETENTION ACTIONS
// -----------------------------------------------------------------------------

export async function updateRetentionSettingsAction(
  input: RetentionSettingsInput
): Promise<ActionResult> {
  await requireRole('admin', '/admin');

  const parsed = retentionSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid retention settings' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('update_retention_settings', {
    p_audit_logs_days: parsed.data.retention_audit_logs_days,
    p_chapter_reads_days: parsed.data.retention_chapter_reads_days,
    p_chapter_revisions_days: parsed.data.retention_chapter_revisions_days,
    p_email_outbox_days: parsed.data.retention_email_outbox_days,
    p_notifications_days: parsed.data.retention_notifications_days,
    p_rate_limits_days: parsed.data.retention_rate_limits_days,
    p_chapter_drafts_days: parsed.data.retention_chapter_drafts_days,
    p_payment_proofs_days: parsed.data.retention_payment_proofs_days,
  });

  if (error) {
    console.error('[updateRetentionSettingsAction] Supabase error:', error.code, error.message);
    return { success: false, error: error.message };
  }

  try {
    revalidatePath('/admin');
    revalidatePath('/admin/settings');
    revalidatePath('/admin/audit');
  } catch (revalErr) {
    console.warn('[updateRetentionSettingsAction] revalidatePath warning:', revalErr);
  }

  return { success: true, data };
}

export async function runRetentionCleanupAction(): Promise<
  ActionResult<{
    dbSummary: unknown;
    filesDeleted: number;
    prunedRows?: number;
    storageBytesFreed?: number;
    totalBytesFreed?: number;
  }>
> {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  // 1. Dynamic database retention cleanup via SECURITY DEFINER RPC
  const { data: dbSummary, error: dbError } = await supabase.rpc('run_retention_cleanup');
  if (dbError) {
    console.error('[runRetentionCleanupAction] DB cleanup error:', dbError.code, dbError.message);
    return { success: false, error: dbError.message };
  }

  // 2. Storage screenshots cleanup based on retention_payment_proofs_days
  const storageResult = await cleanupOldPaymentProofFiles({ client: supabase });

  const rawDb = (dbSummary as Record<string, unknown>) || {};
  const dbBytesFreed = typeof rawDb.db_bytes_freed === 'number' ? rawDb.db_bytes_freed : 0;
  const storageBytesFreed = storageResult.storage_bytes_freed ?? 0;
  const totalBytesFreed = dbBytesFreed + storageBytesFreed;

  const combinedSummary = {
    ...rawDb,
    storage_proofs_deleted: storageResult.deletedFiles,
    storage_bytes_freed: storageBytesFreed,
    total_bytes_freed: totalBytesFreed,
  };

  // Persist combined summary into platform_settings so page reloads reflect storage freed
  try {
    await supabase
      .from('platform_settings')
      .update({
        last_retention_cleanup_summary: combinedSummary,
      })
      .eq('id', 1);
  } catch (updateErr) {
    console.warn('[runRetentionCleanupAction] Failed to update combined summary:', updateErr);
  }

  try {
    revalidatePath('/admin');
    revalidatePath('/admin/settings');
    revalidatePath('/admin/audit');
  } catch (revalErr) {
    console.warn('[runRetentionCleanupAction] revalidatePath warning:', revalErr);
  }

  return {
    success: true,
    data: {
      dbSummary: combinedSummary,
      filesDeleted: storageResult.deletedFiles,
      prunedRows: storageResult.prunedRows,
      storageBytesFreed,
      totalBytesFreed,
    },
  };
}

// -----------------------------------------------------------------------------
// 13. WRITER STUDIO ANNOUNCEMENT ACTIONS
// -----------------------------------------------------------------------------

export async function updateWriterAnnouncementAction(
  input: WriterAnnouncementInput
): Promise<ActionResult> {
  await requireRole('admin', '/admin');

  const parsed = writerAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid writer announcement input',
    };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('update_writer_announcement', {
    p_enabled: parsed.data.enabled,
    p_variant: parsed.data.variant,
    p_title_en: parsed.data.title_en,
    p_title_ur: parsed.data.title_ur,
    p_body_en: parsed.data.body_en,
    p_body_ur: parsed.data.body_ur,
    p_link_url: parsed.data.link_url,
    p_link_label: parsed.data.link_label,
    p_dismissible: parsed.data.dismissible,
  });

  if (error) {
    console.error('[updateWriterAnnouncementAction] Supabase RPC error:', error.code, error.message);
    return { success: false, error: error.message };
  }

  try {
    revalidatePath('/writer', 'layout');
    revalidatePath('/writer', 'page');
    revalidatePath('/admin', 'layout');
    revalidatePath('/admin/settings', 'page');
  } catch (revalErr) {
    console.warn('[updateWriterAnnouncementAction] revalidatePath warning:', revalErr);
  }

  return { success: true, data };
}

// -----------------------------------------------------------------------------
// 14. ADMIN DASHBOARD EXECUTIVE ANALYTICS ACTIONS
// -----------------------------------------------------------------------------

export async function getAdminDashboardAnalyticsAction(days: number = 30): Promise<{
  success: boolean;
  data?: AdminDashboardAnalytics;
  error?: string;
}> {
  await requireRole('admin', '/admin');

  const parsed = dashboardTimeframeSchema.safeParse(days);
  const normalizedDays = parsed.success ? parsed.data : 30;

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('get_admin_dashboard_analytics', {
    p_days: normalizedDays,
  });

  if (error) {
    console.error('[getAdminDashboardAnalyticsAction] Supabase RPC error:', error.code, error.message);
    return {
      success: false,
      error: error.message || 'Failed to load executive dashboard analytics.',
    };
  }

  const raw = data as unknown as Partial<AdminDashboardAnalytics> | null;

  const fallbackData: AdminDashboardAnalytics = {
    timeframe: {
      days: normalizedDays,
      is_all_time: normalizedDays <= 0,
      start_date: raw?.timeframe?.start_date || new Date().toISOString(),
      end_date: raw?.timeframe?.end_date || new Date().toISOString(),
      prev_start_date: raw?.timeframe?.prev_start_date || new Date().toISOString(),
      prev_end_date: raw?.timeframe?.prev_end_date || new Date().toISOString(),
    },
    kpis: {
      gmv_pkr: Number(raw?.kpis?.gmv_pkr ?? 0),
      prev_gmv_pkr: Number(raw?.kpis?.prev_gmv_pkr ?? 0),
      verified_orders_count: Number(raw?.kpis?.verified_orders_count ?? 0),
      prev_verified_orders_count: Number(raw?.kpis?.prev_verified_orders_count ?? 0),
      platform_fee_accrued_pkr: Number(raw?.kpis?.platform_fee_accrued_pkr ?? 0),
      platform_fee_settled_pkr: Number(raw?.kpis?.platform_fee_settled_pkr ?? 0),
      unpaid_fee_exposure_pkr: Number(raw?.kpis?.unpaid_fee_exposure_pkr ?? 0),
      writer_net_earnings_pkr: Number(raw?.kpis?.writer_net_earnings_pkr ?? 0),
      avg_order_value_pkr: Number(raw?.kpis?.avg_order_value_pkr ?? 0),
      verified_tips_pkr: Number(raw?.kpis?.verified_tips_pkr ?? 0),
      verified_tips_count: Number(raw?.kpis?.verified_tips_count ?? 0),
      conversion_rate_pct: Number(raw?.kpis?.conversion_rate_pct ?? 0),
    },
    order_funnel: {
      verified: Number(raw?.order_funnel?.verified ?? 0),
      pending_verification: Number(raw?.order_funnel?.pending_verification ?? 0),
      pending_payment: Number(raw?.order_funnel?.pending_payment ?? 0),
      rejected: Number(raw?.order_funnel?.rejected ?? 0),
      cancelled: Number(raw?.order_funnel?.cancelled ?? 0),
      disputed: Number(raw?.order_funnel?.disputed ?? 0),
      refunded_adjusted: Number(raw?.order_funnel?.refunded_adjusted ?? 0),
      total_orders: Number(raw?.order_funnel?.total_orders ?? 0),
    },
    daily_series: Array.isArray(raw?.daily_series)
      ? raw.daily_series.map((item) => ({
          date: String(item.date || ''),
          gmv_pkr: Number(item.gmv_pkr ?? 0),
          platform_fee_pkr: Number(item.platform_fee_pkr ?? 0),
          orders_count: Number(item.orders_count ?? 0),
        }))
      : [],
    genre_breakdown: Array.isArray(raw?.genre_breakdown)
      ? raw.genre_breakdown.map((item) => ({
          genre_id: String(item.genre_id || ''),
          name_en: String(item.name_en || ''),
          name_ur: String(item.name_ur || ''),
          slug: String(item.slug || ''),
          gmv_pkr: Number(item.gmv_pkr ?? 0),
          orders_count: Number(item.orders_count ?? 0),
          novels_count: Number(item.novels_count ?? 0),
        }))
      : [],
    decision_radar: {
      stale_pending_orders_24h: Number(raw?.decision_radar?.stale_pending_orders_24h ?? 0),
      open_disputes_count: Number(raw?.decision_radar?.open_disputes_count ?? 0),
      pending_refund_requests_count: Number(raw?.decision_radar?.pending_refund_requests_count ?? 0),
      pending_writer_applications_count: Number(raw?.decision_radar?.pending_writer_applications_count ?? 0),
      pending_novel_moderation_count: Number(raw?.decision_radar?.pending_novel_moderation_count ?? 0),
      overdue_invoices_count: Number(raw?.decision_radar?.overdue_invoices_count ?? 0),
      failed_emails_count: Number(raw?.decision_radar?.failed_emails_count ?? 0),
    },
    top_novels: Array.isArray(raw?.top_novels)
      ? raw.top_novels.map((item) => ({
          novel_id: String(item.novel_id || ''),
          title_en: String(item.title_en || ''),
          title_ur: String(item.title_ur || ''),
          slug: String(item.slug || ''),
          writer_name: String(item.writer_name || ''),
          writer_name_ur: item.writer_name_ur ? String(item.writer_name_ur) : undefined,
          copies_sold: Number(item.copies_sold ?? 0),
          gmv_pkr: Number(item.gmv_pkr ?? 0),
        }))
      : [],
    top_writers: Array.isArray(raw?.top_writers)
      ? raw.top_writers.map((item) => ({
          writer_id: String(item.writer_id || ''),
          pen_name_en: String(item.pen_name_en || ''),
          pen_name_ur: String(item.pen_name_ur || ''),
          published_novels_count: Number(item.published_novels_count ?? 0),
          copies_sold: Number(item.copies_sold ?? 0),
          gmv_pkr: Number(item.gmv_pkr ?? 0),
          writer_net_pkr: Number(item.writer_net_pkr ?? 0),
        }))
      : [],
    infrastructure: {
      db_size_bytes: Number(raw?.infrastructure?.db_size_bytes ?? 0),
      db_quota_limit_bytes: Number(raw?.infrastructure?.db_quota_limit_bytes ?? 524288000),
      table_counts: {
        orders: Number(raw?.infrastructure?.table_counts?.orders ?? 0),
        chapters: Number(raw?.infrastructure?.table_counts?.chapters ?? 0),
        audit_logs: Number(raw?.infrastructure?.table_counts?.audit_logs ?? 0),
        chapter_reads: Number(raw?.infrastructure?.table_counts?.chapter_reads ?? 0),
        email_outbox: Number(raw?.infrastructure?.table_counts?.email_outbox ?? 0),
        notifications: Number(raw?.infrastructure?.table_counts?.notifications ?? 0),
      },
      active_payment_proofs_count: Number(raw?.infrastructure?.active_payment_proofs_count ?? 0),
      pruned_payment_proofs_count: Number(raw?.infrastructure?.pruned_payment_proofs_count ?? 0),
    },
  };

  return {
    success: true,
    data: fallbackData,
  };
}
