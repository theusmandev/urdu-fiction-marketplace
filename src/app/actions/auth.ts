'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@/lib/auth/schemas';
import { getSafeRedirectUrl } from '@/lib/auth/safe-redirect';
import { getRoleDashboard } from '@/lib/auth/getRoleDashboard';

export interface AuthActionResult {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  redirectTo?: string;
}

/**
 * Server action: User Registration
 */
export async function registerUser(formData: FormData): Promise<AuthActionResult> {
  const rawData = {
    fullName: formData.get('fullName'),
    username: formData.get('username'),
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = registerSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Please fix the errors below.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { fullName, username, email, password } = parsed.data;
  const supabase = await createClient();

  // 1. Verify username uniqueness explicitly before signup
  const { data: existingProfile, error: profileErr } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .maybeSingle();

  if (profileErr) {
    console.error('signupAction: username uniqueness check error:', profileErr);
  }

  if (existingProfile) {
    return {
      success: false,
      error: 'This username is already taken. Please choose another username.',
      fieldErrors: { username: ['This username is already in use.'] },
    };
  }

  // 2. Perform signup with Supabase Auth
  // Note: Database trigger handle_new_user strictly creates public.profiles with role = 'reader'
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        username,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
    },
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Unable to register account. Please try again.',
    };
  }

  // If email confirmation is enabled and no session is returned immediately
  if (data.user && (!data.session || data.user.identities?.length === 0)) {
    return {
      success: true,
      message: 'Account created! Please check your email to confirm your account before logging in.',
    };
  }

  return {
    success: true,
    redirectTo: '/account',
  };
}

/**
 * Server action: User Login
 */
export async function loginUser(
  formData: FormData,
  nextParam?: string | null
): Promise<AuthActionResult> {
  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = loginSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid email or password format.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return {
      success: false,
      error: 'Invalid email or password. Please try again.',
    };
  }

  // Authoritative check on profile status
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_active, role')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('signInAction: profile check error:', profileError);
  }

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return {
      success: false,
      error: 'Your account has been deactivated. Please contact support.',
    };
  }

  const { data: writerProfile, error: writerProfileErr } = await supabase
    .from('writer_profiles')
    .select('status')
    .eq('id', data.user.id)
    .maybeSingle();

  if (writerProfileErr) {
    console.error('signInAction: writerProfile check error:', writerProfileErr);
  }

  const roleDashboard = getRoleDashboard(profile?.role, writerProfile?.status);
  const safeDestination = getSafeRedirectUrl(nextParam, roleDashboard);
  return {
    success: true,
    redirectTo: safeDestination,
  };
}

/**
 * Server action: Logout
 */
export async function logoutUser(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * Server action: Request Password Reset
 * Prevents user enumeration by showing generic success message.
 */
export async function forgotPassword(formData: FormData): Promise<AuthActionResult> {
  const rawData = {
    email: formData.get('email'),
  };

  const parsed = forgotPasswordSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Please enter a valid email address.',
    };
  }

  const { email } = parsed.data;
  const supabase = await createClient();

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  // Always invoke Supabase reset
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Anti-enumeration guarantee: always return the same message
  return {
    success: true,
    message: 'If an account exists for this email address, a password reset link has been dispatched to your inbox.',
  };
}

/**
 * Server action: Complete Password Reset
 */
export async function resetPassword(formData: FormData): Promise<AuthActionResult> {
  const rawData = {
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  };

  const parsed = resetPasswordSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Passwords do not meet security requirements or do not match.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Unable to update password. Your reset link may have expired.',
    };
  }

  return {
    success: true,
    message: 'Password updated successfully. You can now log in with your new password.',
    redirectTo: '/login?message=password_updated',
  };
}

/**
 * Server action: Realtime Username Availability Check
 */
export async function checkUsernameAvailability(
  username: string
): Promise<{ available: boolean; error?: string }> {
  if (!username || username.length < 3) {
    return { available: false, error: 'Must be at least 3 characters.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', username.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('checkUsernameAvailabilityAction: query error:', error);
    return { available: false, error: 'Database check failed.' };
  }

  return { available: !data };
}
