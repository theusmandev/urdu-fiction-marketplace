import React from 'react';
import Link from 'next/link';
import { requireWriter } from '@/lib/auth/requireRole';
import { UrduText } from '@/components/urdu/UrduText';
import { Feather, Clock, FileText, User, LogOut } from 'lucide-react';
import { logoutUser } from '@/app/actions/auth';

export default async function WriterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, writerProfile, isPendingApproval } = await requireWriter('/writer');

  // If application is awaiting editorial approval, present the pending state
  if (isPendingApproval) {
    return (
      <div className="min-h-screen bg-ivory py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                Application Under Editorial Review
              </span>
              <h1 className="text-2xl font-serif font-bold text-navy">
                Author Studio Access Pending
              </h1>
              <p className="text-sm text-secondary">
                Thank you for applying to publish on UNB Premium,{' '}
                <strong className="text-main">{writerProfile.pen_name_english}</strong>.
              </p>
            </div>

            <div className="p-4 bg-ivory rounded-xl border border-border text-right space-y-2" dir="rtl">
              <div className="text-xs text-secondary font-urdu">قلمی نام:</div>
              <UrduText as="div" size="xl" className="text-navy">
                {writerProfile.pen_name_urdu}
              </UrduText>
              <p className="text-xs text-secondary leading-relaxed font-urdu">
                آپ کی مصنّف کی درخواست اس وقت ہماری ادارتی ٹیم کے زیرِ جائزہ ہے۔ منظوری کے بعد آپ اپنے ناولز شائع کر سکیں گے اور قارئین کی براہِ راست ادائیگیوں کی تصدیق کر سکیں گے۔
              </p>
            </div>

            <div className="text-xs text-secondary bg-slate-50 p-4 rounded-xl text-left space-y-1">
              <div><strong>Application Submitted:</strong> {new Date(writerProfile.created_at).toLocaleDateString()}</div>
              <div><strong>Account Email:</strong> {profile.email}</div>
              <div><strong>Terms Accepted:</strong> UNB Author & Payment Agreement v1.0</div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/account"
                className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold rounded-lg bg-surface border border-border text-main hover:bg-ivory"
              >
                <User className="w-4 h-4 mr-1.5" />
                View Account Profile
              </Link>
              <Link
                href="/writer/agreement"
                className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold rounded-lg bg-navy text-white hover:bg-navy-light"
              >
                <FileText className="w-4 h-4 mr-1.5" />
                Review Author Agreement
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Approved author studio layout
  return (
    <div className="min-h-screen bg-ivory">
      {/* Top Writer Navigation Bar */}
      <header className="sticky top-0 z-40 bg-navy text-white border-b border-navy-light shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/writer" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
                  <Feather className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="font-serif text-lg font-bold tracking-tight text-white leading-none">
                    Writer Studio
                  </span>
                  <span className="text-[10px] text-accent font-medium">
                    UNB Premium
                  </span>
                </div>
              </Link>

              <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
                <Link
                  href="/writer"
                  className="px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-navy-light transition-colors"
                >
                  Overview
                </Link>
                <Link
                  href="/writer/novels"
                  className="px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-navy-light transition-colors"
                >
                  My Novels
                </Link>
                <Link
                  href="/writer/earnings"
                  className="px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-navy-light transition-colors"
                >
                  Earnings
                </Link>
                <Link
                  href="/writer/commission"
                  className="px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-navy-light transition-colors"
                >
                  Commission
                </Link>
                <Link
                  href="/writer/payment-methods"
                  className="px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-navy-light transition-colors"
                >
                  Payment Methods
                </Link>
                <Link
                  href="/writer/profile"
                  className="px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-navy-light transition-colors"
                >
                  Profile
                </Link>
                <Link
                  href="/writer/orders"
                  className="px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-navy-light transition-colors"
                >
                  Verify Payments
                </Link>
                <Link
                  href="/writer/agreement"
                  className="px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-navy-light transition-colors"
                >
                  Agreement
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-white">
                  {writerProfile.pen_name_english}
                </span>
                <span className="text-[10px] text-accent">
                  {writerProfile.pen_name_urdu}
                </span>
              </div>
              <Link
                href="/account"
                className="w-8 h-8 rounded-full bg-navy-light border border-slate-600 flex items-center justify-center text-slate-300 hover:text-white"
                title="Account Settings"
              >
                <User className="w-4 h-4" />
              </Link>
              <form action={logoutUser}>
                <button
                  type="submit"
                  className="text-xs text-slate-300 hover:text-rose-400 p-1.5 rounded transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
