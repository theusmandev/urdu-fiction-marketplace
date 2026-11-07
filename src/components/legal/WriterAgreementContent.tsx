import React from 'react';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';

interface WriterAgreementContentProps {
  showHeader?: boolean;
  className?: string;
}

export function WriterAgreementContent({
  showHeader = true,
  className = '',
}: WriterAgreementContentProps) {
  return (
    <div className={`space-y-8 text-main ${className}`}>
      {showHeader && (
        <div className="border-b border-border pb-6">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/25 text-accent-strong flex items-center justify-center shrink-0 shadow-2xs">
              <ShieldCheck className="h-7 w-7 text-accent-strong" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-serif text-navy tracking-tight">
                Writer Platform Agreement
              </h1>
              <UrduText size="sm" className="text-accent-strong mt-0.5 leading-[2.2]">
                مصنفین کے لیے ضابطہ اخلاق اور معاہدہ شراکت
              </UrduText>
            </div>
          </div>
          <p className="mt-3 text-xs sm:text-sm text-secondary leading-relaxed">
            This Agreement governs the relationship between independent Urdu authors and UNB Premium. By applying to publish or publishing stories on the platform, you unconditionally agree to these operating standards and financial rules.
          </p>
        </div>
      )}

      {/* Agreement Clauses */}
      <div className="space-y-8 text-sm text-secondary leading-relaxed">
        {/* Clause 1 */}
        <section className="space-y-2.5 p-5 rounded-2xl border border-border/80 bg-surface shadow-2xs">
          <h2 className="text-base font-semibold text-navy flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span>1. Direct Reader-to-Writer Payout Model</span>
          </h2>
          <p>
            UNB Premium connects Urdu fiction authors directly with verified readers. Readers deposit payments directly to your designated Pakistani bank or mobile wallet accounts (JazzCash, EasyPaisa, Raast, or Direct Bank Transfer). You receive 100% of reader payments directly upon deposit verification. UNB Premium never holds, escrows, or routes your book sales earnings.
          </p>
          <div className="pt-1 border-t border-border/40" dir="rtl">
            <UrduText as="p" size="xs" className="text-secondary leading-[2.2]">
              قارئین براہِ راست مصنف کے فراہم کردہ اکاؤنٹ (جاز کیش، ایزی پیسہ، راست یا بینک اکاؤنٹ) میں رقم منتقل کرتے ہیں۔ رقم کی تصدیق کے بعد پوری رقم براہِ راست آپ کو ملتی ہے۔ پلیٹ فارم آپ کی سیلز کی رقم کو اپنے پاس نہیں رکھتا۔
            </UrduText>
          </div>
        </section>

        {/* Clause 2 */}
        <section className="space-y-2.5 p-5 rounded-2xl border border-border/80 bg-surface shadow-2xs">
          <h2 className="text-base font-semibold text-navy flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span>2. Platform Fee &amp; Accrual Threshold</span>
          </h2>
          <p>
            The platform fee is a percentage of each verified sale. It is owed by the author to the platform and is settled separately; readers pay no platform fee. The platform records an automated 20% platform fee (or agreed custom rate) on each verified sale. You agree to settle accrued platform fees with the platform once your balance reaches the unpaid limit of PKR 5,000. Orders remain active and uninterrupted while within this limit.
          </p>
          <div className="pt-1 border-t border-border/40" dir="rtl">
            <UrduText as="p" size="xs" className="text-secondary leading-[2.2]">
              پلیٹ فارم فیس ہر تصدیق شدہ آرڈر کی ۲۰ فیصد (یا طے شدہ شرح) ہے۔ یہ فیس مصنف کی طرف واجب الادا ہوتی ہے اور قاری سے کوئی اضافی فیس نہیں لی جاتی۔ ۵۰۰۰ روپے کی حد تک پہنچنے پر آپ فیس ادا کرنے کے پابند ہیں۔
            </UrduText>
          </div>
        </section>

        {/* Clause 3 */}
        <section className="space-y-2.5 p-5 rounded-2xl border border-border/80 bg-surface shadow-2xs">
          <h2 className="text-base font-semibold text-navy flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span>3. Copyright &amp; Original Authorship</span>
          </h2>
          <p>
            You warrant that all published Urdu stories, serialized novels, and literary content submitted under your pen name are your original intellectual property. Plagiarism, unlicensed adaptations, digital piracy, or copyright infringement will result in immediate suspension, entitlement revocation, and forfeiture of publishing privileges.
          </p>
          <div className="pt-1 border-t border-border/40" dir="rtl">
            <UrduText as="p" size="xs" className="text-secondary leading-[2.2]">
              آپ ضمانت دیتے ہیں کہ شائع شدہ تمام ناول، افسانے اور تحریریں آپ کی اپنی ذاتی اور اصل تخلیق ہیں۔ کسی دوسرے کی تحریر چوری کرنے یا کاپی رائٹ کی خلاف ورزی پر اکاؤنٹ فوری طور پر معطل کر دیا جائے گا۔
            </UrduText>
          </div>
        </section>

        {/* Clause 4 */}
        <section className="space-y-2.5 p-5 rounded-2xl border border-border/80 bg-surface shadow-2xs">
          <h2 className="text-base font-semibold text-navy flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span>4. Verification Obligations &amp; Timelines</span>
          </h2>
          <p>
            You agree to inspect bank receipts and transaction references (TID) submitted by readers in good faith within 24 to 48 hours. Falsely confirming unreceived funds or unfairly rejecting valid reader deposits constitutes a breach of platform integrity and may trigger administrative dispute intervention.
          </p>
          <div className="pt-1 border-t border-border/40" dir="rtl">
            <UrduText as="p" size="xs" className="text-secondary leading-[2.2]">
              آپ قارئین کی جانب سے جمع کروائی گئی ادائیگی اور رسید کی تصدیق ۲۴ سے ۴۸ گھنٹوں کے اندر نیک نیتی کے ساتھ کرنے کے پابند ہیں۔ غیر موصول رقم کی غلط تصدیق یا درست ادائیگی کو بلاوجہ مسترد کرنا قواعد کی خلاف ورزی ہے۔
            </UrduText>
          </div>
        </section>

        {/* Clause 5 */}
        <section className="space-y-2.5 p-5 rounded-2xl border border-border/80 bg-surface shadow-2xs">
          <h2 className="text-base font-semibold text-navy flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span>5. Reader Appreciation Gifts (&ldquo;Tips&rdquo;)</span>
          </h2>
          <p>
            Eligible authors may opt in to accept voluntary reader appreciation gifts (&ldquo;Tips&rdquo;). Tips are non-refundable voluntary gifts from readers. UNB Premium charges 0% platform fee on tips and never holds or processes tip funds.
          </p>
          <p>
            Tips unlock no content. Authors are strictly prohibited from demanding tips, locking chapters behind tips, conditioning story releases on tips, or substituting tips for book sales. Any such attempt constitutes a material breach of this Agreement.
          </p>
          <div className="pt-1 border-t border-border/40" dir="rtl">
            <UrduText as="p" size="xs" className="text-secondary leading-[2.2]">
              قارئین کی جانب سے بھیجی گئی داد یا شکریہ کا تحفہ خالصتاً اختیاری ہے اور اس پر پلیٹ فارم کی کوئی فیس نہیں۔ ٹپس کے عوض مواد لاک کرنا، تحفے کا مطالبہ کرنا یا کتاب کی خریداری کے بدلے ٹپ طلب کرنا سختی سے منع ہے۔
            </UrduText>
          </div>
        </section>
      </div>
    </div>
  );
}

