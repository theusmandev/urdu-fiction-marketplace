import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { WriterProfileForm } from './WriterProfileForm';
import { UrduText } from '@/components/urdu/UrduText';

export default async function WriterProfilePage() {
  const { user, profile, writerProfile } = await requireWriter('/writer/profile');

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
            Author Studio
          </span>
          <span className="text-xs text-secondary">
            User ID: {user.id.slice(0, 8)}...
          </span>
        </div>
        <h1 className="text-2xl font-serif font-bold text-navy mt-1">
          Author Profile Settings
        </h1>
        <UrduText as="p" size="base" className="text-accent py-0">
          مصنف پروفائل اور قلمی نام
        </UrduText>
      </div>

      <WriterProfileForm
        userId={user.id}
        initialPenNameUrdu={writerProfile.pen_name_urdu}
        initialPenNameEnglish={writerProfile.pen_name_english}
        initialBioUrdu={writerProfile.bio_urdu}
        initialBioEnglish={writerProfile.bio_english}
        initialAvatarUrl={profile.avatar_url}
        username={profile.username}
        status={writerProfile.status}
      />
    </div>
  );
}
