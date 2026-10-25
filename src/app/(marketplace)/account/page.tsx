import React from 'react';
import { requireAuth } from '@/lib/auth/requireRole';
import { ProfileEditForm } from './profile-edit-form';


export default async function AccountPage() {
  const { user, profile } = await requireAuth('/account');

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 md:p-8 shadow-card">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-serif text-navy tracking-tight">
            Account Profile
          </h1>
          <p className="mt-1 text-sm text-secondary">
            Manage your personal reader information and avatar.
          </p>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <ProfileEditForm user={user} profile={profile} />
        </div>
      </div>
    </div>
  );
}
