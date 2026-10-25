import React from 'react';
import { requireAuth } from '@/lib/auth/requireRole';
import { ProfileEditForm } from './profile-edit-form';


export default async function AccountPage() {
  const { user, profile } = await requireAuth('/account');

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-6 md:p-8 backdrop-blur-md">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            Account Profile
          </h1>
          <p className="mt-1 text-sm text-stone-400">
            Manage your personal reader information and avatar.
          </p>
        </div>

        <div className="mt-6 border-t border-stone-800 pt-6">
          <ProfileEditForm user={user} profile={profile} />
        </div>
      </div>
    </div>
  );
}
