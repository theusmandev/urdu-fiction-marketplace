import type { PostgrestError } from '@supabase/supabase-js';

export interface AppQueryError {
  code?: string;
  message: string;
  hint?: string | null;
  details?: string | null;
  isNotFound: boolean;
}

export type UnwrapResult<T> =
  | { data: T; error: null; isNotFound: boolean; count: number | null }
  | { data: null; error: AppQueryError; isNotFound: boolean; count: number | null };

export interface QueryWrapOptions {
  context?: string;
  throwInDev?: boolean;
}

/**
 * Standard server-side PostgREST query result unwrapper.
 *
 * Guarantees that:
 * 1. Supabase errors (PostgrestError) are logged with server console.error including code, message, details, and hint.
 * 2. Errors can never be silently converted into empty lists `[]` or mistaken for "not found".
 * 3. Distinguishes between database errors and true zero-row (not found) results.
 * 4. In development mode (NODE_ENV !== 'production'), optionally throws or warns if requested.
 */
export function unwrapQuery<T>(
  result: { data: T | null; error: PostgrestError | null; count?: number | null },
  optionsOrContext?: string | QueryWrapOptions
): UnwrapResult<T> {
  const options: QueryWrapOptions =
    typeof optionsOrContext === 'string'
      ? { context: optionsOrContext }
      : optionsOrContext || {};

  const contextStr = options.context ? ` [${options.context}]` : '';
  const resultCount = result.count ?? null;

  const rawError = result.error as (PostgrestError & { [key: string]: unknown }) | null;
  const hasRealError =
    Boolean(rawError) &&
    (Boolean(rawError?.message) ||
      Boolean(rawError?.code) ||
      Boolean(rawError?.details) ||
      (typeof rawError === 'object' && Object.keys(rawError || {}).length > 0));

  if (hasRealError && rawError) {
    const code = rawError.code || 'UNKNOWN';
    const message =
      rawError.message ||
      (typeof rawError === 'string' ? rawError : 'Database query error');
    const hint = rawError.hint || null;
    const details = rawError.details || null;
    const isNotFound = code === 'PGRST116';

    const errorPayload: AppQueryError = {
      code,
      message,
      hint,
      details,
      isNotFound,
    };

    console.error(`[SupabaseQueryError]${contextStr}:`, {
      code: errorPayload.code,
      message: errorPayload.message,
      hint: errorPayload.hint,
      details: errorPayload.details,
    });

    if (options.throwInDev && process.env.NODE_ENV !== 'production' && !errorPayload.isNotFound) {
      throw new Error(
        `[SupabaseDevError]${contextStr} ${errorPayload.message} (Code: ${errorPayload.code || 'UNKNOWN'})`
      );
    }

    return {
      data: null,
      error: errorPayload,
      isNotFound: errorPayload.isNotFound,
      count: resultCount,
    };
  }

  const isDataEmpty = result.data === null || result.data === undefined;

  return {
    data: (result.data as T) ?? (null as unknown as T),
    error: null,
    isNotFound: isDataEmpty,
    count: resultCount,
  };
}

/**
 * Helper specifically for single/maybeSingle queries that need strict notFound() discrimination.
 * Returns:
 * - error: AppQueryError if DB failed (render error state, do NOT call notFound)
 * - isNotFound: true if query succeeded with 0 rows (safe to call notFound())
 * - data: T if row exists
 */
export function unwrapSingleQuery<T>(
  result: { data: T | null; error: PostgrestError | null },
  optionsOrContext?: string | QueryWrapOptions
): { data: T | null; error: AppQueryError | null; isNotFound: boolean } {
  const unwrapped = unwrapQuery<T>(result, optionsOrContext);
  if (unwrapped.error) {
    return { data: null, error: unwrapped.error, isNotFound: false };
  }
  if (!unwrapped.data) {
    return { data: null, error: null, isNotFound: true };
  }
  return { data: unwrapped.data, error: null, isNotFound: false };
}
