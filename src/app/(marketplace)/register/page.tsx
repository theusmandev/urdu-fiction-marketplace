import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getRoleDashboard } from '@/lib/auth/getRoleDashboard';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create Account',
  robots: {
    index: false,
    follow: false,
  },
};

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
