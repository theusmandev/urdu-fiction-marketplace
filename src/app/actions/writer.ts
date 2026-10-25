'use server';

import { revalidatePath } from 'next/cache';
import { requireWriter } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { cleanUrduText } from '@/lib/text/clean-urdu';
import {
  writerProfileSchema,
  paymentMethodSchema,
  createNovelFormSchema,
  chapterFormSchema,
  type WriterProfileInput,
  type PaymentMethodInput,
  type NovelFormInput,
  type ChapterFormInput,
} from '@/lib/writer/schemas';

export interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Update Writer Profile (pen names, bio, avatar)
 */
export async function updateWriterProfileAction(
  data: WriterProfileInput
): Promise<ActionResponse> {
  try {
    const { user } = await requireWriter('/writer/profile');
    const parsed = writerProfileSchema.safeParse(data);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Please correct the highlighted errors.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { pen_name_urdu, pen_name_english, bio_urdu, bio_english, avatar_url } = parsed.data;
    const supabase = await createClient();

    // 1. Update writer_profiles table
    const { error: wpError } = await supabase
      .from('writer_profiles')
      .update({
        pen_name_urdu: cleanUrduText(pen_name_urdu),
        pen_name_english: pen_name_english.trim(),
        bio_urdu: bio_urdu ? cleanUrduText(bio_urdu) : null,
        bio_english: bio_english ? bio_english.trim() : null,
      })
      .eq('id', user.id);

    if (wpError) {
      return { success: false, error: wpError.message };
    }

    // 2. Update avatar_url on public.profiles if provided
    if (avatar_url !== undefined) {
      await supabase
        .from('profiles')
        .update({
          avatar_url: avatar_url || null,
        })
        .eq('id', user.id);
    }

    revalidatePath('/writer/profile');
    revalidatePath('/writer');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { success: false, error: msg };
  }
}

/**
 * Upsert Writer Payment Method (JazzCash, EasyPaisa, Raast, Bank IBAN)
 */
export async function upsertPaymentMethodAction(
  data: PaymentMethodInput
): Promise<ActionResponse<{ payment_method_id: string }>> {
  try {
    await requireWriter('/writer/payment-methods');
    const parsed = paymentMethodSchema.safeParse(data);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Please check your payment method details.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { method_id, method_type, account_title, account_number_or_iban, bank_name, instructions_note } = parsed.data;
    const cleanAccount = account_number_or_iban.replace(/[\s\-]/g, '');

    const supabase = await createClient();

    const { data: rpcData, error } = await supabase.rpc('upsert_writer_payment_method', {
      p_method_type: method_type,
      p_account_title: account_title.trim(),
      p_account_number_or_iban: cleanAccount,
      p_method_id: method_id || null,
      p_bank_name: bank_name ? bank_name.trim() : null,
      p_instructions_note: instructions_note ? instructions_note.trim() : null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = rpcData as { success: boolean; payment_method_id: string };

    revalidatePath('/writer/payment-methods');
    return { success: true, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save payment method.';
    return { success: false, error: msg };
  }
}

/**
 * Deactivate Writer Payment Method
 */
export async function deactivatePaymentMethodAction(
  methodId: string
): Promise<ActionResponse> {
  try {
    await requireWriter('/writer/payment-methods');
    const supabase = await createClient();

    const { error } = await supabase.rpc('deactivate_writer_payment_method', {
      p_method_id: methodId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/writer/payment-methods');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to deactivate payment method.';
    return { success: false, error: msg };
  }
}

/**
 * Create a new Novel draft
 */
export async function createNovelAction(
  data: NovelFormInput
): Promise<ActionResponse<{ novel_id: string; slug: string }>> {
  try {
    await requireWriter('/writer/novels/new');
    const supabase = await createClient();

    // Fetch dynamic bounds from platform_settings
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('min_novel_price_pkr, max_novel_price_pkr')
      .eq('id', 1)
      .maybeSingle();

    const minPrice = settings?.min_novel_price_pkr ?? 50;
    const maxPrice = settings?.max_novel_price_pkr ? Number(settings.max_novel_price_pkr) : 5000;
    const schema = createNovelFormSchema({ minPrice, maxPrice });
    const parsed = schema.safeParse(data);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Please correct the highlighted form errors.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const val = parsed.data;

    const { data: rpcData, error } = await supabase.rpc('create_novel', {
      p_title_urdu: cleanUrduText(val.title_urdu),
      p_title_english: val.title_english.trim(),
      p_synopsis_urdu: cleanUrduText(val.synopsis_urdu),
      p_description_urdu: val.description_urdu ? cleanUrduText(val.description_urdu) : null,
      p_cover_url: val.cover_url || null,
      p_cover_public_id: val.cover_public_id || null,
      p_price_pkr: val.price_pkr,
      p_language: val.language || 'ur',
      p_rights_declaration_accepted: val.rights_declaration_accepted,
      p_genre_ids: val.genre_ids,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = rpcData as { success: boolean; novel_id: string; slug: string };

    revalidatePath('/writer/novels');
    revalidatePath('/writer');
    return { success: true, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create novel.';
    return { success: false, error: msg };
  }
}

/**
 * Update Novel metadata and genres
 */
export async function updateNovelAction(
  novelId: string,
  data: NovelFormInput
): Promise<ActionResponse<{ novel_id: string }>> {
  try {
    await requireWriter(`/writer/novels/${novelId}/edit`);
    const supabase = await createClient();

    // Fetch dynamic bounds from platform_settings
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('min_novel_price_pkr, max_novel_price_pkr')
      .eq('id', 1)
      .maybeSingle();

    const minPrice = settings?.min_novel_price_pkr ?? 50;
    const maxPrice = settings?.max_novel_price_pkr ? Number(settings.max_novel_price_pkr) : 5000;
    const schema = createNovelFormSchema({ minPrice, maxPrice });
    const parsed = schema.safeParse(data);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Please correct the highlighted form errors.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const val = parsed.data;

    const { data: rpcData, error } = await supabase.rpc('update_novel', {
      p_novel_id: novelId,
      p_title_urdu: cleanUrduText(val.title_urdu),
      p_title_english: val.title_english.trim(),
      p_synopsis_urdu: cleanUrduText(val.synopsis_urdu),
      p_description_urdu: val.description_urdu ? cleanUrduText(val.description_urdu) : null,
      p_cover_url: val.cover_url || null,
      p_cover_public_id: val.cover_public_id || null,
      p_price_pkr: val.price_pkr,
      p_language: val.language || 'ur',
      p_genre_ids: val.genre_ids,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = rpcData as { success: boolean; novel_id: string };

    revalidatePath('/writer/novels');
    revalidatePath(`/writer/novels/${novelId}/edit`);
    revalidatePath(`/writer/novels/${novelId}/chapters`);
    return { success: true, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update novel.';
    return { success: false, error: msg };
  }
}

/**
 * Submit Novel for Review
 */
export async function submitNovelForReviewAction(
  novelId: string
): Promise<ActionResponse<{ novel_id: string; status: string }>> {
  try {
    await requireWriter(`/writer/novels/${novelId}/chapters`);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('submit_novel_for_review', {
      p_novel_id: novelId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/writer/novels');
    revalidatePath(`/writer/novels/${novelId}/chapters`);
    return { success: true, data: data as { novel_id: string; status: string } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Submission failed.';
    return { success: false, error: msg };
  }
}

/**
 * Withdraw Novel Submission back to draft
 */
export async function withdrawNovelSubmissionAction(
  novelId: string
): Promise<ActionResponse> {
  try {
    await requireWriter('/writer/novels');
    const supabase = await createClient();

    const { error } = await supabase.rpc('withdraw_novel_submission', {
      p_novel_id: novelId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/writer/novels');
    revalidatePath(`/writer/novels/${novelId}/chapters`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to withdraw submission.';
    return { success: false, error: msg };
  }
}

/**
 * Unpublish an author's own published novel (if no open orders exist)
 */
export async function unpublishNovelAction(
  novelId: string
): Promise<ActionResponse> {
  try {
    await requireWriter('/writer/novels');
    const supabase = await createClient();

    const { error } = await supabase.rpc('unpublish_own_novel', {
      p_novel_id: novelId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/writer/novels');
    revalidatePath(`/writer/novels/${novelId}/chapters`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to unpublish novel.';
    return { success: false, error: msg };
  }
}

/**
 * Save Chapter (Create or Update)
 */
export async function saveChapterAction(
  novelId: string,
  chapterData: ChapterFormInput & { chapterId?: string }
): Promise<ActionResponse<{ chapter_id: string }>> {
  try {
    const { user } = await requireWriter(`/writer/novels/${novelId}/chapters`);
    const parsed = chapterFormSchema.safeParse(chapterData);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Please fix the chapter input errors.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { chapter_number, title_urdu, content_urdu, is_free_preview, is_published } = parsed.data;
    const cleanContent = cleanUrduText(content_urdu);
    const cleanTitle = cleanUrduText(title_urdu);

    const supabase = await createClient();

    // Verify novel exists and belongs to author
    const { data: novel, error: novelError } = await supabase
      .from('novels')
      .select('id, status, writer_id')
      .eq('id', novelId)
      .single();

    if (novelError || !novel) {
      return { success: false, error: 'Novel not found.' };
    }

    if (novel.writer_id !== user.id) {
      return { success: false, error: 'Unauthorized.' };
    }

    if (novel.status === 'under_review' || novel.status === 'suspended') {
      return { success: false, error: `Chapters cannot be edited while novel is ${novel.status}.` };
    }

    if (chapterData.chapterId) {
      // Update existing chapter
      const { data: updatedChapter, error: updateError } = await supabase
        .from('chapters')
        .update({
          chapter_number,
          title_urdu: cleanTitle,
          content_urdu: cleanContent,
          is_free_preview,
          is_published,
          updated_at: new Date().toISOString(),
        })
        .eq('id', chapterData.chapterId)
        .eq('novel_id', novelId)
        .select('id')
        .single();

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      revalidatePath(`/writer/novels/${novelId}/chapters`);
      revalidatePath(`/writer/novels/${novelId}/chapters/${chapterData.chapterId}`);
      return { success: true, data: { chapter_id: updatedChapter.id } };
    } else {
      // Insert new chapter
      const { data: newChapter, error: insertError } = await supabase
        .from('chapters')
        .insert({
          novel_id: novelId,
          chapter_number,
          title_urdu: cleanTitle,
          content_urdu: cleanContent,
          is_free_preview,
          is_published,
        })
        .select('id')
        .single();

      if (insertError) {
        return { success: false, error: insertError.message };
      }

      revalidatePath(`/writer/novels/${novelId}/chapters`);
      return { success: true, data: { chapter_id: newChapter.id } };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save chapter.';
    return { success: false, error: msg };
  }
}

/**
 * Delete Chapter (Allowed only while novel is in draft)
 */
export async function deleteChapterAction(
  novelId: string,
  chapterId: string
): Promise<ActionResponse> {
  try {
    const { user } = await requireWriter(`/writer/novels/${novelId}/chapters`);
    const supabase = await createClient();

    const { data: novel } = await supabase
      .from('novels')
      .select('status, writer_id')
      .eq('id', novelId)
      .single();

    if (!novel || novel.writer_id !== user.id) {
      return { success: false, error: 'Unauthorized.' };
    }

    if (novel.status !== 'draft') {
      return {
        success: false,
        error: 'Chapters cannot be permanently deleted once a novel has been submitted or published. Please unpublish the chapter instead.',
      };
    }

    const { error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', chapterId)
      .eq('novel_id', novelId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/writer/novels/${novelId}/chapters`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete chapter.';
    return { success: false, error: msg };
  }
}

/**
 * Reorder chapters using collision-free RPC
 */
export async function reorderChaptersAction(
  novelId: string,
  chapterIds: string[]
): Promise<ActionResponse> {
  try {
    await requireWriter(`/writer/novels/${novelId}/chapters`);
    const supabase = await createClient();

    const { error } = await supabase.rpc('reorder_chapters', {
      p_novel_id: novelId,
      p_chapter_ids: chapterIds,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/writer/novels/${novelId}/chapters`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reorder chapters.';
    return { success: false, error: msg };
  }
}

/**
 * Import chapters batch from parsed manuscript
 */
export async function importChaptersAction(
  novelId: string,
  chapters: Array<{
    title_urdu: string;
    content_urdu: string;
    is_free_preview?: boolean;
    is_published?: boolean;
  }>
): Promise<ActionResponse<{ imported_count: number }>> {
  try {
    const { user } = await requireWriter(`/writer/novels/${novelId}/chapters`);
    const supabase = await createClient();

    // Verify novel
    const { data: novel } = await supabase
      .from('novels')
      .select('status, writer_id')
      .eq('id', novelId)
      .single();

    if (!novel || novel.writer_id !== user.id) {
      return { success: false, error: 'Unauthorized.' };
    }

    if (novel.status === 'under_review' || novel.status === 'suspended') {
      return { success: false, error: `Chapters cannot be imported while novel is ${novel.status}.` };
    }

    // Determine highest existing chapter number
    const { data: existingChapters } = await supabase
      .from('chapters')
      .select('chapter_number')
      .eq('novel_id', novelId)
      .order('chapter_number', { ascending: false })
      .limit(1);

    let startNumber = (existingChapters && existingChapters[0]?.chapter_number) || 0;

    const rowsToInsert = chapters.map((c) => {
      startNumber++;
      return {
        novel_id: novelId,
        chapter_number: startNumber,
        title_urdu: cleanUrduText(c.title_urdu),
        content_urdu: cleanUrduText(c.content_urdu),
        is_free_preview: Boolean(c.is_free_preview),
        is_published: c.is_published ?? true,
      };
    });

    const { error: insertError } = await supabase
      .from('chapters')
      .insert(rowsToInsert);

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    revalidatePath(`/writer/novels/${novelId}/chapters`);
    return { success: true, data: { imported_count: rowsToInsert.length } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to import chapters.';
    return { success: false, error: msg };
  }
}
