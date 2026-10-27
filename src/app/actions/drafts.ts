'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export interface UpsertDraftParams {
  novelId: string;
  chapterId?: string | null;
  clientKey: string;
  titleUrdu?: string | null;
  contentUrdu: string;
  chapterNumber?: number | null;
  baseChapterUpdatedAt?: string | null;
  expectedServerRevision: number;
  deviceLabel?: string | null;
}

export type UpsertDraftResult =
  | {
      status: 'ok';
      server_revision: number;
      updated_at: string;
    }
  | {
      status: 'conflict';
      server_revision: number;
      server_updated_at: string;
      device_label: string | null;
      content_urdu: string;
      title_urdu: string | null;
    };

export interface DraftMetadata {
  id: string;
  novel_id: string;
  chapter_id: string | null;
  client_key: string;
  title_urdu: string | null;
  chapter_number: number | null;
  base_chapter_updated_at: string | null;
  server_revision: number;
  device_label: string | null;
  created_at: string;
  updated_at: string;
  character_count: number;
}

export interface DraftFullDetail extends DraftMetadata {
  content_urdu: string;
}

export interface DraftActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  authExpired?: boolean;
}

/**
 * Server action to atomically upsert a chapter draft to the cloud draft store.
 * NEVER writes into public.chapters.
 */
export async function upsertDraftAction(
  params: UpsertDraftParams
): Promise<DraftActionResponse<UpsertDraftResult>> {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        authExpired: true,
        error: 'Please sign in again to sync; your text is safe on this device.',
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('upsert_chapter_draft', {
      p_novel_id: params.novelId,
      p_chapter_id: params.chapterId || null,
      p_client_key: params.clientKey,
      p_title_urdu: params.titleUrdu || null,
      p_content_urdu: params.contentUrdu,
      p_chapter_number: params.chapterNumber ?? null,
      p_base_chapter_updated_at: params.baseChapterUpdatedAt || null,
      p_expected_server_revision: params.expectedServerRevision,
      p_device_label: params.deviceLabel || null,
    });

    if (error) {
      const isAuthErr =
        error.message.includes('Authentication required') ||
        error.message.includes('JWT') ||
        error.code === 'PGRST301' ||
        error.code === '42501';

      return {
        success: false,
        authExpired: isAuthErr,
        error: error.message,
      };
    }

    return {
      success: true,
      data: data as unknown as UpsertDraftResult,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Draft sync failed.';
    return {
      success: false,
      error: msg,
    };
  }
}

/**
 * Server action to fetch full draft details including content by client_key.
 */
export async function getDraftAction(
  clientKey: string
): Promise<DraftActionResponse<DraftFullDetail | null>> {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        authExpired: true,
        error: 'Authentication required.',
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_chapter_draft', {
      p_client_key: clientKey,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data as unknown as DraftFullDetail) || null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch draft.';
    return { success: false, error: msg };
  }
}

/**
 * Server action to list metadata of all drafts for the calling writer (optionally by novel).
 */
export async function listMyDraftsAction(
  novelId?: string
): Promise<DraftActionResponse<DraftMetadata[]>> {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        authExpired: true,
        error: 'Authentication required.',
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('list_my_chapter_drafts', {
      p_novel_id: novelId || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data as unknown as DraftMetadata[]) || [],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list drafts.';
    return { success: false, error: msg };
  }
}

/**
 * Server action to discard a draft row and record an audit log entry.
 */
export async function discardDraftAction(
  clientKey: string
): Promise<DraftActionResponse<{ discarded: boolean }>> {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        authExpired: true,
        error: 'Authentication required.',
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('discard_chapter_draft', {
      p_client_key: clientKey,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const res = data as unknown as { status: string; discarded: boolean };
    return {
      success: true,
      data: { discarded: Boolean(res?.discarded) },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to discard draft.';
    return { success: false, error: msg };
  }
}

/**
 * Server action to resolve a draft conflict ('keep_mine' | 'keep_server').
 */
export async function resolveDraftConflictAction(
  clientKey: string,
  choice: 'keep_mine' | 'keep_server',
  contentUrdu?: string | null,
  titleUrdu?: string | null
): Promise<DraftActionResponse<UpsertDraftResult>> {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        authExpired: true,
        error: 'Authentication required.',
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('resolve_chapter_draft_conflict', {
      p_client_key: clientKey,
      p_choice: choice,
      p_content_urdu: contentUrdu || null,
      p_title_urdu: titleUrdu || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: data as unknown as UpsertDraftResult,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Conflict resolution failed.';
    return { success: false, error: msg };
  }
}

/**
 * Helper to fetch live chapter updated_at and basic fields for base comparison.
 */
export async function getLiveChapterStatusAction(
  chapterId: string
): Promise<DraftActionResponse<{ id: string; updated_at: string; title_urdu: string; content_urdu: string } | null>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('chapters')
      .select('id, updated_at, title_urdu, content_urdu')
      .eq('id', chapterId)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: data || null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to check live chapter.';
    return { success: false, error: msg };
  }
}
