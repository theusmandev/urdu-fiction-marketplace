import React from 'react';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapSingleQuery } from '@/lib/supabase/query';
import { AdminTipDetailClient, type AdminTipDetail } from './AdminTipDetailClient';

interface AdminTipDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Inspect Tip | Admin | UNB Premium',
};

export default async function AdminTipDetailPage({ params }: AdminTipDetailPageProps) {
  const { id } = await params;
  await requireRole('admin', `/admin/tips/${id}`);

  const supabase = await createServerClient();
  const tipRes = await supabase.rpc('admin_get_tip', {
    p_tip_id: id,
  });

  const { data: tip, error: tipError } = unwrapSingleQuery<AdminTipDetail>(tipRes, {
    context: 'AdminTipDetailPage.admin_get_tip',
  });

  if (tipError) {
    console.error('AdminTipDetailPage error:', tipError);
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-3">
        <h1 className="text-xl font-bold text-rose-700">Unable to load tip</h1>
        <p className="text-xs text-secondary">{tipError.message}</p>
      </div>
    );
  }

  if (!tip) {
    notFound();
  }

  return <AdminTipDetailClient initialTip={tip} />;
}
