import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getRoleDashboard } from '@/lib/auth/getRoleDashboard';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign In',
  robots: {
    index: false,
    follow: false,
  },
};

interface LoginPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const current = await getCurrentUser();

  if (current.user && current.profile) {
    const dashboard = getRoleDashboard(current.profile.role, current.writerProfile?.status);
    redirect(dashboard);
  }

  return <LoginForm searchParams={searchParams} />;
}
