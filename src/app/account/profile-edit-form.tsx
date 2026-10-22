'use client';

import React, { useState, useTransition } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import type { ProfileRow } from '@/types/database';
import { ImageUploader } from '@/components/ui/image-uploader';
import { updateProfile } from '@/app/actions/profile';
import { Loader2, CheckCircle2, AlertCircle, Save } from 'lucide-react';

interface ProfileEditFormProps {
  user: SupabaseUser;
  profile: ProfileRow;
}

export function ProfileEditForm({ user, profile }: ProfileEditFormProps) {
  const [fullName, setFullName] = useState(profile.full_name || '');
  const [username, setUsername] = useState(profile.username || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('username', username);
    if (avatarUrl) {
      formData.append('avatarUrl', avatarUrl);
    }

    startTransition(async () => {
      const result = await updateProfile(formData);

      if (!result.success) {
        setError(result.error || 'Failed to update profile.');
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else {
        setSuccessMessage(result.message || 'Profile updated successfully!');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {successMessage && (
        <div className="rounded-lg bg-emerald-950/60 border border-emerald-800/80 p-4 flex items-start gap-3 text-emerald-200 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-950/60 border border-red-800/80 p-4 flex items-start gap-3 text-red-200 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Avatar Uploader */}
      <div>
        <ImageUploader
          bucket="novel-assets"
          preset="avatar"
          folder={user.id}
          value={avatarUrl}
          onChange={(url) => setAvatarUrl(url)}
          label="Profile Picture"
          helperText="Max 400x400px. Stored in public novel-assets bucket under your user folder."
          disabled={isPending}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Full Name */}
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-stone-300">
            Full Name
          </label>
          <input
            id="fullName"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isPending}
            className="mt-1 block w-full rounded-lg border border-stone-700 bg-stone-950/80 py-2.5 px-3 text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm disabled:opacity-50"
          />
          {fieldErrors.fullName && (
            <p className="mt-1 text-xs text-red-400">{fieldErrors.fullName[0]}</p>
          )}
        </div>

        {/* Username */}
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-stone-300">
            Username
          </label>
          <input
            id="username"
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            disabled={isPending}
            className="mt-1 block w-full rounded-lg border border-stone-700 bg-stone-950/80 py-2.5 px-3 text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm disabled:opacity-50"
          />
          {fieldErrors.username && (
            <p className="mt-1 text-xs text-red-400">{fieldErrors.username[0]}</p>
          )}
        </div>

        {/* Email (Read Only) */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-stone-400">
            Email Address (Verified)
          </label>
          <input
            id="email"
            type="email"
            readOnly
            disabled
            value={profile.email}
            className="mt-1 block w-full rounded-lg border border-stone-800 bg-stone-950/40 py-2.5 px-3 text-stone-400 text-sm cursor-not-allowed"
          />
          <p className="mt-1 text-[11px] text-stone-500">
            Primary email address cannot be changed directly.
          </p>
        </div>

        {/* Role & Member Since */}
        <div>
          <label className="block text-sm font-medium text-stone-400">
            Account Status & Role
          </label>
          <div className="mt-1 flex items-center gap-2 h-[42px] px-3 rounded-lg border border-stone-800 bg-stone-950/40 text-stone-300 text-sm">
            <span className="uppercase font-bold text-xs tracking-wider text-amber-400">
              {profile.role}
            </span>
            <span className="text-stone-600">•</span>
            <span className="text-xs text-stone-400">
              Member since {new Date(profile.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving Changes...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Save Profile Changes</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
