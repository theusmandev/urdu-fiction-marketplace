import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import {
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  FileText,
  LifeBuoy,
} from "lucide-react";

export const revalidate = 86400; // 24 hours ISR

export const metadata: Metadata = {
  title: "How to Pay the Writer & Submit TID — ادائیگی اور رسید کا طریقہ",
  description:
    "Step-by-step reader guide for direct payments to Pakistani authors via JazzCash, EasyPaisa, Raast, or Bank IBAN on UNB Premium.",
};

const PAYMENT_STEPS = [
  {
    step: 1,
    title: "Choose Novel & Click 'Buy Novel'",
    titleUrdu: "ناول کا انتخاب اور آرڈر کا آغاز",
    description:
      "Open any novel in the catalog. You can read all available free preview chapters first. When ready for full novel access, click 'Buy Novel' to proceed to checkout.",
  },
  {
    step: 2,
    title: "Create Your Order & Select Payment Method",
    titleUrdu: "آرڈر نمبر اور ادائیگی کے طریقے کا انتخاب",
    description:
      "Select your preferred Pakistani payment channel (JazzCash, EasyPaisa, Raast Instant ID, or Bank Account). The system creates a unique order number (e.g., ORD-XXXXXX) and records it in your order history.",
  },
  {
    step: 3,
    title: "Transfer the Exact Amount to the Author's Account",
    titleUrdu: "مصنف کے اکاؤنٹ میں مطلوبہ رقم منتقل کریں",
    description:
      "Open your mobile wallet or banking app. Transfer the exact novel price to the author's account title and number displayed on your order screen. Include your order number in the bank transfer note/purpose.",
  },
  {
    step: 4,
    title: "Submit TID, Sender Account Name & Receipt Screenshot",
    titleUrdu: "ٹرانزیکشن آئی ڈی (TID) اور رسید جمع کریں",
    description:
      "After transferring funds, enter the Transaction Reference ID (TID) from your bank or wallet SMS/receipt, provide your sender account name, and upload a clear screenshot of the completed transfer.",
  },
  {
    step: 5,
    title: "Author Verifies Bank Credit",
    titleUrdu: "مصنف کی جانب سے رقم کی تصدیق",
    description:
      "The author receives a real-time notification to cross-reference the TID against their bank or wallet account statement. Once the deposit is verified in the author's personal account, access is unlocked.",
  },
  {
    step: 6,
    title: "Access Unlocks in 'My Library'",
    titleUrdu: "ناول فوری طور پر 'میری لائبریری' میں دستیاب",
    description:
      "Once approved, all premium chapters become immediately readable from 'My Library' on any phone, tablet, or desktop in custom Urdu Nastaliq typography.",
  },
];

const SAFETY_TIPS = [
  {
    title: "Pay Only the Exact PKR Amount",
    desc: "Always send the exact amount specified on your order summary. Overpaying or underpaying creates reconciliation delays for the writer.",
  },
  {
    title: "Pay ONLY to the Account on Your Order Page",
    desc: "Only send payments to the specific account number, IBAN, or wallet title explicitly shown on your order page. Never send funds to a number received in social media comments, private chat, or emails.",
  },
  {
    title: "Keep Your Transaction Reference (TID) & Screenshot",
    desc: "Your bank/wallet confirmation SMS or transaction slip contains a unique TID. Keep your receipt screenshot saved until the writer confirms your order.",
  },
  {
    title: "A Screenshot Alone Never Unlocks Content",
    desc: "Access is granted only when the author cross-checks their actual bank or wallet balance. Submitting fake, altered, or duplicate receipts will result in immediate order rejection and account suspension.",
  },
];

const TROUBLESHOOTING_CASES = [
  {
    title: "Payment Submission Rejected",
    desc: "If the author rejects the payment (for example, if the TID was typed incorrectly or the screenshot was unreadable), the order details page will display the author's rejection reason. You can resubmit with the correct TID/screenshot or cancel the order if you have not sent funds.",
  },
  {
    title: "Author Has Not Verified Yet (Waiting Period)",
    desc: "Authors typically verify payments within a few hours, though it can take up to the platform's standard verification window (usually up to 24 hours depending on author availability). You will receive an on-platform notification the moment your payment is verified.",
  },
  {
    title: "Author Does Not Respond After the Waiting Period",
    desc: "If the verification waiting period has expired without response, an 'Open Dispute' button activates automatically on your order page. A platform administrator will inspect the bank reference and resolve the entitlement.",
  },
  {
    title: "Transferred Wrong Amount or to Wrong Account",
    desc: "If you transferred an incorrect amount, enter the actual amount transferred in the payment submission form reader notes. For direct payment issues, review our Refund Policy or contact reader support.",
  },
];

const FAQS = [
  {
    q: "Does the platform hold my money in an escrow account?",
    qUrdu: "کیا پلیٹ فارم میری رقم اپنے پاس رکھتا ہے؟",
    a: "No. UNB Premium operates on a direct reader-to-writer model. You pay the author directly into their personal Pakistani bank or wallet account. The platform never receives, custody, or stores your money.",
  },
  {
    q: "What payment apps can I use?",
    qUrdu: "ادائیگی کے لیے کون سی ایپس استعمال کی جا سکتی ہیں؟",
    a: "You can pay using JazzCash, EasyPaisa, Raast Instant Payment (State Bank of Pakistan), or direct interbank fund transfer (IBAN) from any Pakistani commercial bank (HBL, Meezan, Alfalah, MCB, UBL, Allied, Standard Chartered, etc.).",
  },
  {
    q: "How long does verification take?",
    qUrdu: "تصدیق میں کتنا وقت لگتا ہے؟",
    a: "Most authors verify deposits within 1 to 12 hours. We recommend allowing up to 24 hours before opening an administrative inquiry or dispute.",
  },
  {
    q: "Where do I find my TID?",
    qUrdu: "ٹرانزیکشن آئی ڈی (TID) کہاں ملے گی؟",
    a: "In JazzCash and EasyPaisa, the TID is shown on the final transaction confirmation screen and in the SMS sent to your registered phone number. In banking apps, it is labeled as 'Reference Number', 'Transaction ID', or 'Instrument Number'.",
  },
];

export default function HowToPayPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
      {/* Header */}
      <header className="space-y-4 text-center border-b border-border pb-8">
        <span className="text-xs font-semibold text-accent uppercase tracking-wider">
          Reader Payment Guide
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-navy">
          How Direct Payment & TID Submission Works
        </h1>
        <UrduText
          as="p"
          size="2xl"
          className="text-secondary leading-[2.2] py-1"
        >
          براہ راست ادائیگی، ٹرانزیکشن آئی ڈی اور رسید جمع کرنے کی مکمل رہنمائی
        </UrduText>
        <p className="text-xs sm:text-sm text-secondary max-w-2xl mx-auto leading-relaxed">
          UNB Premium operates on a 100% direct-to-author payment model. Readers transfer funds directly
          to the writer&apos;s personal bank or mobile wallet, and novel access unlocks after the author confirms
          receipt.
        </p>
      </header>

      {/* Fundamental Principle Banner */}
      <section className="bg-surface p-6 sm:p-8 rounded-3xl border border-border space-y-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent text-navy flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-serif text-lg sm:text-xl font-bold text-navy">
              Important: You Pay the Author Directly
            </h2>
            <UrduText size="sm" className="text-secondary">
              پلیٹ فارم قارئین کی رقم اپنے پاس نہیں رکھتا
            </UrduText>
          </div>
        </div>
        <div className="text-xs sm:text-sm text-secondary leading-relaxed space-y-2">
          <p>
            The platform <strong>never holds, escrows, or processes your payment directly</strong>. When you purchase
            a novel, you are sending money straight from your banking or mobile wallet app to the writer&apos;s
            personal account.
          </p>
          <p>
            Because this is a direct transfer, <strong>novel access unlocks when the author confirms receipt</strong> in
            their bank account. All orders and transaction references (TIDs) are permanently recorded on the platform
            audit ledger to protect your purchase.
          </p>
        </div>
      </section>

      {/* 6 Step-by-Step Instructions */}
      <section className="space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
            <CreditCard className="w-4 h-4" />
            <span>Step-by-Step Walkthrough</span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-navy">
            6 Steps from Purchase to Reading
          </h2>
          <UrduText size="base" className="text-secondary">
            خریداری سے مطالعے تک کے آسان مراحل
          </UrduText>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PAYMENT_STEPS.map((s) => (
            <div
              key={s.step}
              className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="w-8 h-8 rounded-lg bg-navy text-accent flex items-center justify-center font-bold text-xs">
                    {s.step}
                  </span>
                  <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
                    Step {s.step} of 6
                  </span>
                </div>
                <h3 className="font-serif text-base font-bold text-navy">
                  {s.title}
                </h3>
                <UrduText size="sm" className="text-accent py-0">
                  {s.titleUrdu}
                </UrduText>
                <p className="text-xs text-secondary leading-relaxed">
                  {s.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Safety & Integrity Guidelines */}
      <section className="space-y-6 pt-4 border-t border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-danger-text">
            <AlertTriangle className="w-4 h-4" />
            <span>Payment Security</span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-navy">
            Safety Tips for Readers
          </h2>
          <UrduText size="base" className="text-secondary">
            محفوظ ادائیگی کے لیے اہم حفاظتی تدابیر
          </UrduText>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SAFETY_TIPS.map((tip, idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-warning/10 border border-warning-border/20 space-y-2"
            >
              <div className="flex items-center gap-2 text-navy font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-accent-strong shrink-0" />
                <span>{tip.title}</span>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                {tip.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* What if Something Goes Wrong? */}
      <section className="space-y-6 pt-4 border-t border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy">
            <LifeBuoy className="w-4 h-4 text-accent" />
            <span>Problem Resolution</span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-navy">
            What if Something Goes Wrong?
          </h2>
          <UrduText size="base" className="text-secondary">
            مسائل کی صورت میں حل اور رہنمائی
          </UrduText>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TROUBLESHOOTING_CASES.map((item, idx) => (
            <div
              key={idx}
              className="bg-surface p-5 rounded-2xl border border-border space-y-2 shadow-sm"
            >
              <h3 className="font-serif text-sm font-bold text-navy flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-accent shrink-0" />
                <span>{item.title}</span>
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
          <Link
            href="/refund-policy"
            className="inline-flex items-center gap-1.5 font-semibold text-navy hover:text-accent underline transition-colors"
          >
            <span>Read Refund & Dispute Policy</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <span className="text-border">|</span>
          <Link
            href="/support"
            className="inline-flex items-center gap-1.5 font-semibold text-navy hover:text-accent underline transition-colors"
          >
            <span>Contact Reader Support</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* Reader Payment FAQs */}
      <section className="space-y-6 pt-4 border-t border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
            <HelpCircle className="w-4 h-4" />
            <span>Frequently Asked Questions</span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-navy">
            Questions About Payment & Verification
          </h2>
        </div>

        <div className="space-y-4">
          {FAQS.map((faq, idx) => (
            <div
              key={idx}
              className="bg-surface p-5 rounded-2xl border border-border space-y-2 shadow-sm"
            >
              <h3 className="font-serif text-sm font-bold text-navy">
                {faq.q}
              </h3>
              <UrduText size="sm" className="text-accent py-0">
                {faq.qUrdu}
              </UrduText>
              <p className="text-xs text-secondary leading-relaxed pt-1">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Navigation Cross-Links Banner */}
      <section className="bg-navy text-white p-6 sm:p-8 rounded-3xl space-y-6 shadow-md">
        <div className="space-y-2">
          <span className="text-xs font-semibold text-accent uppercase tracking-wider">
            Explore Helpful Resources
          </span>
          <h2 className="font-serif text-xl sm:text-2xl font-bold">
            Need More Information?
          </h2>
          <UrduText size="base" className="text-text-muted">
            مزید معلومات اور تفصیلی پالیسیاں دیکھنے کے لیے درج ذیل لنکس وزٹ کریں
          </UrduText>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            href="/how-it-works"
            className="flex items-center justify-between p-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 transition-colors text-xs font-semibold"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              <span>How It Works</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-accent" />
          </Link>

          <Link
            href="/faq"
            className="flex items-center justify-between p-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 transition-colors text-xs font-semibold"
          >
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-accent" />
              <span>General FAQ</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-accent" />
          </Link>

          <Link
            href="/refund-policy"
            className="flex items-center justify-between p-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 transition-colors text-xs font-semibold"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-accent" />
              <span>Refund Policy</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-accent" />
          </Link>

          <Link
            href="/support"
            className="flex items-center justify-between p-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 transition-colors text-xs font-semibold"
          >
            <div className="flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-accent" />
              <span>Support Desk</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-accent" />
          </Link>
        </div>
      </section>
    </div>
  );
}
