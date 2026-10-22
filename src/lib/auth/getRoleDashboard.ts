import type { UserRole, WriterStatus } from '@/types/database';

/**
 * Returns the canonical dashboard route for an authenticated user based on their
 * role and writer verification status.
 *
 * Routing Rules:
 * 1. Admin users -> /admin
 * 2. Writers (role = 'writer' OR writerProfile status in ['approved', 'pending_approval']) -> /writer
 * 3. Readers (role = 'reader' or fallback) -> /library
 */
export function getRoleDashboard(
  role: UserRole | string | null | undefined,
  writerStatus?: WriterStatus | string | null | undefined
): string {
  if (role === 'admin') {
    return '/admin';
  }

  if (
    role === 'writer' ||
    writerStatus === 'approved' ||
    writerStatus === 'pending_approval'
  ) {
    return '/writer';
  }

  return '/library';
}
