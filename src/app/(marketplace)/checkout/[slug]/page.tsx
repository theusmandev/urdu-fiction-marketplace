'use server';

import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';
import { CheckoutForm } from './CheckoutForm';
import type { CheckoutOptionsResponse } from '@/types/database';

interface CheckoutPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { slug } = await params;
  const { user } = await requireAuth(`/checkout/${slug}`);
  const supabase = await createClient();

  // 1. Fetch novel by slug
  const novelRes = await supabase
    .from('novels')
    .select('id, title_english, title_urdu, slug, status, price_pkr, writer_id')
    .eq('slug', slug)
    .maybeSingle();

  const { data: novel, error: novelError } = unwrapSingleQuery<{
    id: string;
    title_english: string;
    title_urdu: string;
    slug: string;
    status: string;
    price_pkr: number;
    writer_id: string;
  }>(novelRes, {
    context: 'CheckoutPage.fetchNovel',
  });

  if (novelError) {
    return (
      <div className="min-h-screen bg-ivory text-main py-16 px-4 sm:px-6">
        <div className="max-w-xl mx-auto text-center space-y-4 bg-surface border border-border p-8 rounded-2xl shadow-card">
          <h1 className="text-xl font-bold font-serif text-danger-text">Checkout Error</h1>
          <p className="text-sm text-secondary">{novelError.message}</p>
        </div>
      </div>
    );
  }

  if (!novel || novel.status !== 'published') {
    notFound();
  }

  // 2. Author check
  if (novel.writer_id === user.id) {
    redirect(`/novels/${slug}?error=self_purchase`);
  }

  // 3. Call get_checkout_options RPC
  const checkoutRes = await supabase.rpc(
    'get_checkout_options',
    {
      p_novel_id: novel.id,
    }
  );

  const { data: checkoutData, error: checkoutError } = unwrapQuery<CheckoutOptionsResponse>(checkoutRes, {
    context: 'CheckoutPage.get_checkout_options',
  });

  if (checkoutError) {
    const msg = checkoutError.message.toLowerCase();
    if (msg.includes('already hold an active purchase entitlement')) {
      redirect(`/novels/${slug}?notice=already_owned`);
    }
    if (msg.includes('authors cannot purchase their own novels')) {
      redirect(`/novels/${slug}?error=self_purchase`);
    }
    // Render error state if unable to proceed
    return (
      <div className="min-h-screen bg-ivory text-main py-16 px-4 sm:px-6">
        <div className="max-w-xl mx-auto text-center space-y-4 bg-surface border border-border p-8 rounded-2xl shadow-card">
          <h1 className="text-xl font-bold font-serif text-danger-text">Checkout Unavailable</h1>
          <p className="text-sm text-secondary">{checkoutError.message}</p>
          <div className="pt-4">
            <a
              href={`/novels/${slug}`}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-surface-muted hover:bg-surface-muted border border-border text-sm font-semibold text-navy transition-colors shadow-sm"
            >
              Return to Novel Details
            </a>
          </div>
        </div>
      </div>
    );
  }

  const options = checkoutData as unknown as CheckoutOptionsResponse;

  // 4. If reader already has an open order, redirect to that order
  if (options.existing_order_number) {
    redirect(`/orders/${options.existing_order_number}?notice=existing_order`);
  }

  return (
    <div className="min-h-screen bg-ivory text-main py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <CheckoutForm options={options} />
      </div>
    </div>
  );
}
