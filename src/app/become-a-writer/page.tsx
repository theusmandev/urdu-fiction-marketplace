import React from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/requireRole';
import { BecomeWriterForm } from './become-writer-form';
import { Feather, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';


export default async function BecomeWriterPage() {
  const { writerProfile } = await requireAuth('/become-a-writer');

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 mb-2">
            <Feather className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Publish on UNB Premium
          </h1>
          <UrduText size="lg" className="text-amber-400 font-medium">
            اپنے اردو ناولز اور کہانیاں قارئین تک براہِ راست پہنچائیں
          </UrduText>
          <p className="text-sm text-stone-400 max-w-xl mx-auto">
            Sell full serials and novels with direct reader-to-writer bank deposits, zero automated gateway middlemen, and transparent commission reconciliation.
          </p>
        </div>

        {writerProfile?.status === 'approved' ? (
          <div className="rounded-2xl border border-emerald-800/80 bg-emerald-950/40 p-8 text-center space-y-4 backdrop-blur-md">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">You are an Approved Author!</h2>
            <p className="text-sm text-emerald-200/90 max-w-md mx-auto">
              Your pen name is verified and your author account is active. You can create novels, manage chapters, and verify incoming reader deposits in your Writer Studio.
            </p>
            <div className="pt-2">
              <Link
                href="/writer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors shadow-lg"
              >
                <span>Open Writer Studio</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : writerProfile?.status === 'pending_approval' ? (
          <div className="rounded-2xl border border-amber-800/80 bg-amber-950/40 p-8 text-center space-y-4 backdrop-blur-md">
            <Clock className="mx-auto h-12 w-12 text-amber-400 animate-pulse" />
            <h2 className="text-xl font-bold text-white">Application Under Editorial Review</h2>
            <p className="text-sm text-amber-200/90 max-w-lg mx-auto leading-relaxed">
              We have received your application for pen name{' '}
              <strong className="text-white font-semibold font-urdu text-base">{writerProfile.pen_name_urdu}</strong>{' '}
              ({writerProfile.pen_name_english}). Our editorial team reviews sample writings and profiles within 24–48 hours.
            </p>
            <div className="pt-2">
              <Link
                href="/account"
                className="inline-flex items-center gap-2 rounded-lg border border-stone-700 bg-stone-900 px-5 py-2 text-sm font-medium text-stone-300 hover:text-white transition-colors"
              >
                <span>View Account Settings</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-6 md:p-10 backdrop-blur-xl shadow-2xl">
            <BecomeWriterForm existingProfile={writerProfile} />
          </div>
        )}
      </div>
    </div>
  );
}
