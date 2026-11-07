import React from 'react';
import type { Metadata } from 'next';
import { requireWriter } from '@/lib/auth/requireRole';
import { WriterAgreementClient } from './WriterAgreementClient';

export const metadata: Metadata = {
  title: 'Writer Platform Agreement | Writer Studio',
  description: 'Author terms of service, payment rules, and publishing agreement for UNB Premium writers.',
};

export default async function WriterAgreementPage() {
  const { writerProfile } = await requireWriter('/writer/agreement');

  // Fallback: If writer is already approved but agreement_accepted_at is null, use their profile creation timestamp
  const effectiveAcceptedAt =
    writerProfile.agreement_accepted_at ||
    (writerProfile.status === 'approved' ? writerProfile.created_at : null);

  const penName =
    writerProfile.pen_name_english ||
    writerProfile.pen_name_urdu ||
    'Author';

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <WriterAgreementClient
        initialAcceptedAt={effectiveAcceptedAt}
        penName={penName}
      />
    </div>
  );
}
