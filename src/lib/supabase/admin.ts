import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Dedicated server-only administrative Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Restricted strictly to authorized server actions and administrative route handlers
 * (e.g. generating secure support impersonation magic links).
 * NEVER import this file in client components or leak the client instance to browsers.
 */
export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL for admin Supabase client.');
  }

  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Administrative operations require the service role key in the server environment.'
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

