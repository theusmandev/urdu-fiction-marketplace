import React from 'react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { unwrapSingleQuery } from '@/lib/supabase/query';
import { TipDetailClient, type TipDetailPayload } from './TipDetailClient';

interface TipDetailPageProps {
  params: Promise<{ tipNumber: string }>;
}

export async function generateMetadata({ params }: TipDetailPageProps) {
  const { tipNumber } = await params;
  return {
    title: `Tip ${tipNumber} | UNB Premium`,
    description: 'Direct author appreciation gift status and payment details.',
  };
}

function isOver72Hours(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > 72 * 3600 * 1000;
}

export default async function TipDetailPage({ params }: TipDetailPageProps) {
  const { tipNumber } = await params;
  await requireAuth(`/tips/${tipNumber}`);

  const supabase = await createClient();
  const tipRes = await supabase.rpc('get_tip_by_number', {
    p_tip_number: tipNumber,
  });

  const { data: tip, error: tipError } = unwrapSingleQuery<TipDetailPayload>(tipRes, {
    context: 'TipDetailPage.get_tip_by_number',
  });

  if (tipError) {
    console.error('TipDetailPage fetch error:', tipError);
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-xl font-bold text-rose-700">Unable to load tip</h1>
        <p className="text-sm text-secondary">{tipError.message}</p>
      </div>
    );
  }

  if (!tip) {
    notFound();
  }

  const isWaitingOver72Hours =
    tip.status === 'payment_submitted' && isOver72Hours(tip.created_at);

  return (
    <TipDetailClient
      initialTip={tip}
      isWaitingOver72Hours={isWaitingOver72Hours}
    />
  );
}
