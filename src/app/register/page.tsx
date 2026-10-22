import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getRoleDashboard } from '@/lib/auth/getRoleDashboard';
import { RegisterForm } from './register-form';

interface RegisterPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const current = await getCurrentUser();

  if (current.user && current.profile) {
    const dashboard = getRoleDashboard(current.profile.role, current.writerProfile?.status);
    redirect(dashboard);
  }

  return <RegisterForm searchParams={searchParams} />;
}
