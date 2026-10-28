import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { HelpCircle, Mail } from "lucide-react";

export const revalidate = 86400; // 24 hours ISR

export const metadata: Metadata = {
  title: "Frequently Asked Questions — سوال و جواب",
  description:
    "Find answers about direct reader-to-writer payments, JazzCash/EasyPaisa verification, reading controls, and writer publishing.",
};

interface FaqItem {
  q: string;
  qUrdu: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: "How does payment work for readers?",
    qUrdu: "قارئین کے لیے ادائیگی کا کیا طریقہ کار ہے؟",
    a: "When you select a novel to buy, the system displays the author's personal verified JazzCash, EasyPaisa, Raast, or Bank IBAN details. You transfer the exact amount using your banking app and submit your Transaction Reference (TID) along with a screenshot. Once the writer checks their account and confirms receipt, your access is permanently unlocked.",
  },
  {
    q: "How long does verification take?",
    qUrdu: "ادائیگی کی تصدیق میں کتنا وقت لگتا ہے؟",
    a: "Most authors verify payments within 1 to 12 hours. If an order remains unverified for over 24 hours, it is highlighted on platform administrators' monitoring queue, and you can open an inquiry or dispute if needed.",
  },
  {
    q: "What payment methods are supported?",
    qUrdu: "کون سے پیمنٹ طریقے استعمال کیے جا سکتے ہیں؟",
    a: "All major Pakistani payment rails: JazzCash mobile wallet, EasyPaisa mobile wallet, Raast Instant ID (State Bank of Pakistan), and Direct Interbank Transfer (IBAN) across all commercial banks in Pakistan.",
  },
  {
    q: "Does the platform hold my money?",
    qUrdu: "کیا پلیٹ فارم میری رقم اپنے پاس رکھتا ہے؟",
    a: "No. UNB Premium operates on a direct-to-author payment model. Readers send funds straight to the writer's personal account. The platform never holds reader funds in escrow or custody.",
  },
  {
    q: "Can I read free preview chapters without paying?",
    qUrdu: "کیا بغیر ادائیگی کے مفت پیش منظر پڑھا جا سکتا ہے؟",
    a: "Yes! Every novel that offers free preview chapters allows anyone to read those preview chapters immediately in full Urdu Nastaliq script with custom font size, line height, and theme settings.",
  },
  {
    q: "How do authors receive their earnings?",
    qUrdu: "مصنفین کو ان کا معاوضہ کیسے ملتا ہے؟",
    a: "Authors receive 100% of reader payments directly into their own bank or wallet accounts in real-time. The platform fee is a percentage of each verified sale. It is owed by the author to the platform and is settled separately; readers pay no platform fee. Platform fee (default 20%) is calculated automatically and tracked against the writer's sales ledger.",
  },
  {
    q: "What if a writer does not unlock my novel after payment?",
    qUrdu: "اگر مصنف رقم وصول ہونے کے بعد ناول ان لاک نہ کرے تو کیا ہوگا؟",
    a: "You can submit an order dispute with your TID and bank proof. Platform administrators inspect both bank transaction logs and writer statements. If fraudulent non-fulfillment is found, the writer profile is suspended, and access is resolved.",
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      {/* Draft Legal Notice */}
      <div className="p-3 rounded-xl bg-warning/10 border border-warning-border/20 text-warning-text text-xs text-center font-medium">
        Draft — pending legal review
      </div>

      {/* Header */}
      <div className="space-y-4 text-center border-b border-border pb-8">
        <span className="text-xs font-semibold text-accent uppercase tracking-wider">
          Help & Guidance
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-navy">
          Frequently Asked Questions
        </h1>
        <UrduText
          as="p"
          size="2xl"
          className="text-secondary font-bold leading-[2.2] py-1"
        >
          اکثر پوچھے جانے والے سوالات اور ان کے جوابات
        </UrduText>
      </div>

      {/* FAQ Accordion/List */}
      <div className="space-y-4">
        {FAQS.map((faq, idx) => (
          <div
            key={idx}
            className="bg-surface p-6 rounded-2xl border border-border shadow-sm space-y-3"
          >
            <div className="space-y-1">
              <h2 className="font-serif text-lg font-bold text-navy flex items-start gap-2">
                <HelpCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <span>{faq.q}</span>
              </h2>
              <UrduText
                as="p"
                size="sm"
                className="text-accent-dark dark:text-accent font-semibold py-0 pr-7"
              >
                {faq.qUrdu}
              </UrduText>
            </div>

            <p className="text-xs text-secondary leading-relaxed pl-7">
              {faq.a}
            </p>
          </div>
        ))}
      </div>

      {/* Support Box */}
      <div className="bg-ivory/60 p-8 rounded-3xl border border-border text-center space-y-4">
        <h3 className="font-serif text-lg font-bold text-navy">
          Have more questions?
        </h3>
        <p className="text-xs text-secondary max-w-md mx-auto">
          Need assistance with an order, verification, or novel submission?
          Our support team is here to assist you.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/how-to-pay"
            className="inline-flex items-center gap-2 bg-navy text-accent font-semibold px-5 py-2.5 rounded-xl text-xs hover:bg-navy-light transition-colors"
          >
            <span>Step-by-Step Payment Guide</span>
          </Link>
          <Link
            href="/refund-policy"
            className="inline-flex items-center gap-2 bg-white text-navy font-semibold px-5 py-2.5 rounded-xl text-xs border border-border hover:bg-ivory transition-colors"
          >
            <span>Refund & Dispute Policy</span>
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-white text-navy font-semibold px-5 py-2.5 rounded-xl text-xs border border-border hover:bg-ivory transition-colors"
          >
            <Mail className="w-4 h-4 text-accent" />
            <span>Contact Support</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
