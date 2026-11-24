/**
 * Server-side helper to authoritatively evaluate whether Google OAuth sign-in is enabled.
 * Evaluates both NEXT_PUBLIC_GOOGLE_AUTH_ENABLED and GOOGLE_AUTH_ENABLED runtime environment variables.
 */
export function isGoogleAuthEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' ||
    process.env.GOOGLE_AUTH_ENABLED === 'true'
  );
}
