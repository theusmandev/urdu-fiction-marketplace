'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { profileUpdateSchema, becomeWriterSchema } from '@/lib/auth/schemas';

export interface ProfileActionResult {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
}

/**
 * Server action: Update profile metadata (full_name, username, avatar_url)
 * Database trigger strictly prevents modifying role, is_active, or email.
 */
export async function updateProfile(formData: FormData): Promise<ProfileActionResult> {
  const context = await requireAuth('/account');
  const supabase = await createClient();

  const rawData = {
    fullName: formData.get('fullName'),
    username: formData.get('username'),
    avatarUrl: formData.get('avatarUrl') || null,
  };

  const parsed = profileUpdateSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Please fix the validation errors.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { fullName, username, avatarUrl } = parsed.data;

  // Check username uniqueness if changed
  if (username.toLowerCase() !== context.profile.username?.toLowerCase()) {
    const { data: existing, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .neq('id', context.user.id)
      .maybeSingle();

    if (checkError) {
      console.error('updateProfileAction: username check error:', checkError);
    }

    if (existing) {
      return {
        success: false,
        error: 'This username is already taken by another account.',
        fieldErrors: { username: ['Username is unavailable.'] },
      };
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      username,
      avatar_url: avatarUrl || null,
    })
    .eq('id', context.user.id);

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        error: 'Username is already taken.',
      };
    }
    return {
      success: false,
      error: error.message || 'Failed to update profile.',
    };
  }

  revalidatePath('/account');
  return {
    success: true,
    message: 'Profile updated successfully!',
  };
}

/**
 * Server action: Apply as Writer via RPC apply_as_writer
 * Never directly mutates profiles.role.
 */
export async function applyAsWriterAction(formData: FormData): Promise<ProfileActionResult> {
  await requireAuth('/become-a-writer');
  const supabase = await createClient();

  const rawData = {
    penNameUrdu: formData.get('penNameUrdu'),
    penNameEnglish: formData.get('penNameEnglish'),
    bioUrdu: formData.get('bioUrdu') || '',
    bioEnglish: formData.get('bioEnglish') || '',
    acceptAgreement: formData.get('acceptAgreement') === 'on' || formData.get('acceptAgreement') === 'true',
  };

  const parsed = becomeWriterSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Please complete all required fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { penNameUrdu, penNameEnglish, bioUrdu, bioEnglish } = parsed.data;

  const { error } = await supabase.rpc('apply_as_writer', {
    p_pen_name_urdu: penNameUrdu,
    p_pen_name_english: penNameEnglish,
    p_bio_urdu: bioUrdu || null,
    p_bio_english: bioEnglish || null,
    p_accept_agreement: true,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to submit writer application. Please try again.',
    };
  }

  revalidatePath('/become-a-writer');
  return {
    success: true,
    message: 'Your writer application has been submitted and is pending administrator review.',
  };
}
