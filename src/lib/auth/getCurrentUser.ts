import { createClient } from '@/lib/supabase/server';
import type { ProfileRow, WriterProfileRow } from '@/types/database';
import type { User } from '@supabase/supabase-js';

export interface CurrentUserResult {
  user: User | null;
  profile: ProfileRow | null;
  writerProfile: WriterProfileRow | null;
  isDeactivated?: boolean;
}

/**
 * Authoritatively retrieves the currently authenticated user and their database profile.
 * Server-verified via supabase.auth.getUser() on every call.
 * Automatically signs out deactivated users (is_active = false).
 */
export async function getCurrentUser(): Promise<CurrentUserResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { user: null, profile: null, writerProfile: null };
  }

  // Fetch application profile from public.profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profile && !profile.is_active) {
    // Security enforcement: Deactivated users are immediately signed out
    await supabase.auth.signOut();
    return {
      user: null,
      profile: null,
      writerProfile: null,
      isDeactivated: true,
    };
  }

  // Check for writer profile extension (if approved, pending, or rejected)
  const { data: writerProfile } = await supabase
    .from('writer_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return {
    user,
    profile,
    writerProfile,
    isDeactivated: false,
  };
}
