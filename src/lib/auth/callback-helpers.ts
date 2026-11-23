import { getSafeRedirectUrl } from './safe-redirect.ts';

export type CallbackErrorCode = 'oauth_cancelled' | 'oauth_failed';

export interface CallbackErrorResult {
  errorCode: CallbackErrorCode;
  redirectPath: string;
}

/**
 * Maps OAuth error query parameters returned by auth providers (e.g. Google consent cancellation)
 * into safe application error codes. Never echoes raw provider error descriptions into URLs.
 */
export function mapOAuthCallbackError(
  errorParam: string | null | undefined,
  errorCodeParam?: string | null | undefined
): CallbackErrorResult | null {
  if (!errorParam && !errorCodeParam) {
    return null;
  }

  const err = (errorParam || '').toLowerCase();
  const code = (errorCodeParam || '').toLowerCase();

  // Google OAuth cancellation returns error=access_denied and error_code=403
  if (
    err === 'access_denied' ||
    code === '403' ||
    err.includes('cancel') ||
    err.includes('denied')
  ) {
    return {
      errorCode: 'oauth_cancelled',
      redirectPath: '/login?error=oauth_cancelled',
    };
  }

  // Any other provider error (e.g. server_error, configuration error)
  return {
    errorCode: 'oauth_failed',
    redirectPath: '/login?error=oauth_failed',
  };
}

/**
 * Determines the safe post-auth redirect target honoring whitelisted next parameters.
 */
export function resolveSafePostAuthRedirect(
  nextParam: string | null | undefined,
  fallback: string = '/account'
): string {
  return getSafeRedirectUrl(nextParam, fallback);
}
