import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getRoleDashboard } from '@/lib/auth/getRoleDashboard';
import { ForgotPasswordForm } from './forgot-password-form';

export default async function ForgotPasswordPage() {
  const current = await getCurrentUser();

  if (current.user && current.profile) {
    const dashboard = getRoleDashboard(current.profile.role, current.writerProfile?.status);
    redirect(dashboard);
  }

  return <ForgotPasswordForm />;
}
