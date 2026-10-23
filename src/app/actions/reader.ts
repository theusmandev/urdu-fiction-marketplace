'use server';

import { createServerClient } from '@/lib/supabase/server';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server action to record chapter reading bookmark for the authenticated user.
 */
export async function saveReadingProgressAction(
  novelId: string,
  chapterNumber: number
): Promise<ActionResult> {
  if (!novelId || typeof chapterNumber !== 'number' || chapterNumber < 1) {
    return { success: false, error: 'Invalid progress parameters.' };
  }

  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: 'Authentication required.' };
  }

  const { data, error } = await supabase.rpc('upsert_reading_progress', {
    p_novel_id: novelId,
    p_chapter_number: chapterNumber,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}
