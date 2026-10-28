import React from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/requireRole';
import { BecomeWriterForm } from './become-writer-form';
import { Feather, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';


export default async function BecomeWriterPage() {
  const { writerProfile } = await requireAuth('/become-a-writer');

  return (
    <div className="min-h-screen bg-ivory text-main py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-warning-soft border border-warning-border text-accent mb-2 shadow-sm">
            <Feather className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold font-serif tracking-tight text-navy">
            Publish on UNB Premium
          </h1>
          <UrduText size="lg" className="text-accent font-medium leading-[2.2]">
            اپنے اردو ناولز اور کہانیاں قارئین تک براہِ راست پہنچائیں
          </UrduText>
          <p className="text-sm text-secondary max-w-xl mx-auto">
            Sell full serials and novels with direct reader-to-writer bank deposits, zero automated gateway middlemen, and transparent platform fee reconciliation.
          </p>
        </div>

        {writerProfile?.status === 'approved' ? (
          <div className="rounded-2xl border border-success-border bg-success-soft p-8 text-center space-y-4 shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h2 className="text-xl font-bold font-serif text-success-text">You are an Approved Author!</h2>
            <p className="text-sm text-success-text max-w-md mx-auto">
              Your pen name is verified and your author account is active. You can create novels, manage chapters, and verify incoming reader deposits in your Writer Studio.
            </p>
            <div className="pt-2">
              <Link
                href="/writer"
                className="inline-flex items-center gap-2 rounded-xl bg-success px-6 py-2.5 text-sm font-semibold text-white hover:bg-success-hover transition-colors shadow-sm"
              >
                <span>Open Writer Studio</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : writerProfile?.status === 'pending_approval' ? (
          <div className="rounded-2xl border border-warning-border bg-warning-soft p-8 text-center space-y-4 shadow-sm">
            <Clock className="mx-auto h-12 w-12 text-accent animate-pulse" />
            <h2 className="text-xl font-bold font-serif text-warning-text">Application Under Editorial Review</h2>
            <p className="text-sm text-warning-text max-w-lg mx-auto leading-relaxed">
              We have received your application for pen name{' '}
              <span className="text-accent font-urdu text-lg">{writerProfile.pen_name_urdu}</span>{' '}
              ({writerProfile.pen_name_english}). Our editorial team reviews sample writings and profiles within 24–48 hours.
            </p>
            <div className="pt-2">
              <Link
                href="/account"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-5 py-2 text-sm font-semibold text-secondary hover:text-navy transition-colors shadow-sm"
              >
                <span>View Account Settings</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-6 md:p-10 shadow-card">
            <BecomeWriterForm existingProfile={writerProfile} />
          </div>
        )}
      </div>
    </div>
  );
}
