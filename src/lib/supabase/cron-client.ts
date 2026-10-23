import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client reserved strictly for background cron tasks (/api/cron/*).
 * Uses SUPABASE_SERVICE_ROLE_KEY to invoke SECURITY DEFINER RPCs for queue processing.
 * NEVER import this file in client components or ordinary server actions.
 */
export function createCronSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL for cron client.");
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Cron background processing requires service role key in server environment."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
