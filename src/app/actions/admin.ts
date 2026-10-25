'use server';

import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
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
} from '@/lib/admin/schemas';
import type { UserRole } from '@/types/database';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// -----------------------------------------------------------------------------
// 1. WRITER APPROVAL & GOVERNANCE ACTIONS
// -----------------------------------------------------------------------------

export async function adminApproveWriterAction(writerId: string): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  const { error } = await supabase.rpc('approve_writer', {
    p_writer_id: writerId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/writers');
  revalidatePath(`/admin/writers/${writerId}`);
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

// -----------------------------------------------------------------------------
// 2. NOVEL MODERATION & GOVERNANCE ACTIONS
// -----------------------------------------------------------------------------

export async function adminApproveNovelAction(
  novelId: string,
  checklist?: Record<string, boolean> | null
): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

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
  return { success: true };
}

export async function adminUnsuspendNovelAction(novelId: string): Promise<ActionResult> {
  await requireRole('admin', '/admin');
  const parsed = unsuspendNovelSchema.safeParse({ novelId });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc('unsuspend_novel', {
    p_novel_id: parsed.data.novelId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/novels');
  revalidatePath(`/admin/novels/${novelId}`);
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
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/settings');
  revalidatePath('/writer');
  revalidatePath('/writer/commission');
  revalidatePath('/writer/earnings');
  revalidatePath('/', 'layout');
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
  return { success: true, data };
}
