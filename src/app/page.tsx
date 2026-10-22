import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { UrduText } from "@/components/urdu/UrduText";
import { NovelCard, NovelSummary } from "@/components/home/novel-card";
import { 
  BookMarked, 
  Feather, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  Smartphone, 
  Send, 
  KeyRound, 
  Sparkles,
  Award
} from "lucide-react";

// Initial realistic Urdu fiction literary showcase
const FEATURED_NOVELS: NovelSummary[] = [
  {
    id: "dasht-e-wafa",
    slug: "dasht-e-wafa",
    titleUrdu: "دشتِ وفا کے مسافر",
    titleEn: "Dasht-e-Wafa Ke Musafir",
    authorNameUrdu: "زینب بتول",
    authorNameEn: "Zainab Batool",
    synopsisUrdu: "محبت، وفا اور خاندانی انا کے پس منظر میں لکھی گئی ایک پرتاثیر معاشرتی داستان، جو روایتی قدروں اور جدید سوچ کے درمیان کشمکش کو اجاگر کرتی ہے۔",
    genreEn: "Social & Romantic",
    genreUrdu: "معاشرتی و رومانی",
    pricePKR: 450,
    totalChapters: 24,
    rating: 4.9,
    hasFreePreview: true,
    coverGradient: "bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#312E81]",
  },
  {
    id: "lahore-ka-khooni",
    slug: "lahore-ka-khooni",
    titleUrdu: "شاہی قلعے کا پراسرار قیدی",
    titleEn: "Shahi Qile Ka Pur-Israr Qaidi",
    authorNameUrdu: "طارق اسماعیل",
    authorNameEn: "Tariq Ismail",
    synopsisUrdu: "پرانے لاہور کی تاریک گلیوں اور تاریخی تہہ خانوں میں چھپے ایک صدی پرانے راز اور پراسرار قتل کی سراغ رسانی پر مبنی ایک شاندار سسپنس تھرلر۔",
    genreEn: "Mystery & Crime Thriller",
    genreUrdu: "پراسرار و سسپنس تھرلر",
    pricePKR: 550,
    totalChapters: 30,
    rating: 4.8,
    hasFreePreview: true,
    coverGradient: "bg-gradient-to-br from-[#1C1917] via-[#292524] to-[#451A03]",
  },
  {
    id: "gard-e-safarnama",
    slug: "gard-e-safarnama",
    titleUrdu: "اندلس کی آخری صدا",
    titleEn: "Andalus Ki Aakhri Sada",
    authorNameUrdu: "حماد مرزا",
    authorNameEn: "Hammad Mirza",
    synopsisUrdu: "سقوطِ غرناطہ کے بعد ایک مسلم دانشور اور خطاط کی داستانِ ہجرت، جہاں علم، عشق اور تاریخ کے اوراق ایک لازوال رومان میں تبدیل ہو جاتے ہیں۔",
    genreEn: "Historical & Classical",
    genreUrdu: "تاریخی و کلاسیکی",
    pricePKR: 600,
    totalChapters: 36,
    rating: 5.0,
    hasFreePreview: true,
    coverGradient: "bg-gradient-to-br from-[#1B3B2B] via-[#0F291E] to-[#14532D]",
  },
  {
    id: "khuwab-dar-khuwab",
    slug: "khuwab-dar-khuwab",
    titleUrdu: "خواب در خواب جلتی راتیں",
    titleEn: "Khuwab Dar Khuwab Jalti Raatein",
    authorNameUrdu: "فاطمہ رضوی",
    authorNameEn: "Fatima Rizvi",
    synopsisUrdu: "شہری تنہائی، روحانی کشمکش اور انسانی رشتوں کی نزاکتوں کو بیان کرتا ہوا جدید اردو فکشن کا ایک نادر شہکار۔",
    genreEn: "Literary & Philosophical",
    genreUrdu: "ادبی و فلسفیانہ",
    pricePKR: 400,
    totalChapters: 18,
    rating: 4.7,
    hasFreePreview: true,
    coverGradient: "bg-gradient-to-br from-[#3B0764] via-[#2E1065] to-[#1E1B4B]",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-b from-ivory-light via-ivory to-background py-16 sm:py-24 border-b border-border/60">
        
        {/* Subtle decorative background watermark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none opacity-[0.03] text-navy font-urdu text-[16rem] whitespace-nowrap z-0">
          اردو فکشن
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: English Value Prop + CTAs */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              
              {/* Trust Tag */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/15 border border-accent/30 text-navy text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>Pakistan&apos;s Independent Urdu Fiction Marketplace</span>
              </div>

              {/* Urdu Master Headline */}
              <div className="pt-2">
                <UrduText
                  as="h1"
                  size="4xl"
                  variant="title"
                  className="text-navy font-bold leading-[2.4] text-center lg:text-right"
                >
                  خالص اردو ادب کا گہوارہ، براہِ راست مصنّفین کی سرپرستی
                </UrduText>
              </div>

              {/* English Editorial Subheading */}
              <p className="font-serif text-2xl sm:text-3xl text-navy/90 font-medium leading-snug">
                Read Handcrafted Urdu Novels Directly from the Writers You Love.
              </p>

              {/* Value Proposition Paragraph */}
              <p className="text-base text-secondary max-w-2xl leading-relaxed">
                No subscription traps or automated payment gateway headaches. Pay authors directly into their personal JazzCash, EasyPaisa, or Pakistani Bank account. Upon payment verification, access complete novels forever in your private digital reader.
              </p>

              {/* Dual Action CTAs */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link
                  href="/novels"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-navy hover:bg-navy-light text-white font-medium text-sm transition-all shadow-md hover:shadow-lg"
                >
                  <BookMarked className="w-4 h-4 text-accent" />
                  <span>Explore All Novels</span>
                </Link>

                <Link
                  href="/writers/onboarding"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white hover:bg-ivory border border-border text-navy font-medium text-sm transition-all shadow-sm hover:shadow"
                >
                  <Feather className="w-4 h-4 text-accent" />
                  <span>Sell Your Novels (For Writers)</span>
                </Link>
              </div>

              {/* Supported Direct Payment Badges */}
              <div className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-2 text-xs text-secondary">
                <span className="font-medium text-navy">Direct Payment:</span>
                <span className="px-2.5 py-1 rounded-md bg-white border border-border font-medium text-slate-800 shadow-xs">
                  JazzCash
                </span>
                <span className="px-2.5 py-1 rounded-md bg-white border border-border font-medium text-slate-800 shadow-xs">
                  EasyPaisa
                </span>
                <span className="px-2.5 py-1 rounded-md bg-white border border-border font-medium text-slate-800 shadow-xs">
                  Raast SBP
                </span>
                <span className="px-2.5 py-1 rounded-md bg-white border border-border font-medium text-slate-800 shadow-xs">
                  Direct Bank IBAN
                </span>
              </div>

            </div>

            {/* Right Column: Hero Spotlight Card / Direct Verification Teaser */}
            <div className="lg:col-span-5">
              <div className="bg-surface rounded-3xl p-6 sm:p-8 border border-border shadow-book relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex items-center justify-between pb-4 border-b border-border/80">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-navy text-accent flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-serif text-sm font-bold text-navy">
                        Zero Middleman Guarantee
                      </h3>
                      <p className="text-[11px] text-secondary">
                        Transparent Writer Verification
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">
                    Writer-Direct
                  </span>
                </div>

                <div className="py-4 space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-ivory/80 border border-border/60">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong className="text-navy block font-semibold">
                        Reader-to-Writer Direct Remittance
                      </strong>
                      <span className="text-secondary leading-normal">
                        Money flows straight to the author&apos;s mobile wallet or bank account.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-ivory/80 border border-border/60">
                    <KeyRound className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong className="text-navy block font-semibold">
                        TID Receipt Protection
                      </strong>
                      <span className="text-secondary leading-normal">
                        Authors match reader transaction references (TID) to prevent fraud and unlock novels smoothly.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-ivory/80 border border-border/60">
                    <Award className="w-5 h-5 text-navy shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong className="text-navy block font-semibold">
                        Fair Platform Commission ({siteConfig.defaultCommissionPercentage}%)
                      </strong>
                      <span className="text-secondary leading-normal">
                        Platform charges only {siteConfig.defaultCommissionPercentage}% on verified sales, tracked in an immutable writer ledger.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Callout quote in Nastaliq */}
                <div className="mt-2 pt-3 border-t border-border/60">
                  <UrduText size="sm" variant="quote" className="text-navy/85">
                    &quot;قارئین کے تعاون سے ہی اردو ادب کا چراغ روشن رہ سکتا ہے۔&quot;
                  </UrduText>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>


      {/* 2. HOW DIRECT PAYMENT & VERIFICATION WORKS (4-STEP TRANSPARENT BANNER) */}
      <section className="py-16 sm:py-20 bg-surface border-b border-border/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent font-sans">
              Fair & Transparent Commerce
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-navy">
              How Direct Payment Works
            </h2>
            <UrduText size="base" className="text-navy/80 text-center py-0">
              چار آسان مراحل میں اپنے پسندیدہ ناول تک براہِ راست رسائی حاصل کریں
            </UrduText>
            <p className="text-sm text-secondary leading-relaxed">
              We eliminated expensive corporate payment gateways. Readers transfer funds directly to authors via local Pakistani payment channels.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Step 1 */}
            <div className="relative p-6 rounded-2xl bg-ivory/60 border border-border hover:border-accent/40 transition-colors flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-navy text-accent flex items-center justify-center font-serif text-lg font-bold mb-4 shadow-sm">
                  1
                </div>
                <h3 className="font-serif text-lg font-bold text-navy mb-1">
                  Browse & Read Preview
                </h3>
                <UrduText size="sm" className="text-navy/70 mb-2 py-0">
                  ناول منتخب کریں اور مفت نمونہ پڑھیں
                </UrduText>
                <p className="text-xs text-secondary leading-relaxed">
                  Explore literary fiction, thrillers, and romance. Read the opening prologue and sample chapters free before buying.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-[11px] text-accent font-semibold flex items-center gap-1">
                <span>Free Preview Available</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative p-6 rounded-2xl bg-ivory/60 border border-border hover:border-accent/40 transition-colors flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-accent text-navy flex items-center justify-center font-serif text-lg font-bold mb-4 shadow-sm">
                  2
                </div>
                <h3 className="font-serif text-lg font-bold text-navy mb-1">
                  Direct Wallet / Bank Pay
                </h3>
                <UrduText size="sm" className="text-navy/70 mb-2 py-0">
                  مصنف کے اکاؤنٹ میں رقم منتقل کریں
                </UrduText>
                <p className="text-xs text-secondary leading-relaxed">
                  Send the exact book price directly to the author&apos;s verified JazzCash, EasyPaisa, Raast, or Bank IBAN.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Zero gateway processing cuts</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative p-6 rounded-2xl bg-ivory/60 border border-border hover:border-accent/40 transition-colors flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-navy text-accent flex items-center justify-center font-serif text-lg font-bold mb-4 shadow-sm">
                  3
                </div>
                <h3 className="font-serif text-lg font-bold text-navy mb-1">
                  Submit TID & Screenshot
                </h3>
                <UrduText size="sm" className="text-navy/70 mb-2 py-0">
                  ٹرانزیکشن آئی ڈی (TID) اور رسید اپ لوڈ کریں
                </UrduText>
                <p className="text-xs text-secondary leading-relaxed">
                  Enter your payment TID (Transaction Reference) and upload the receipt screenshot on the checkout confirmation page.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-[11px] text-navy font-semibold flex items-center gap-1">
                <Send className="w-3.5 h-3.5 text-accent" />
                <span>Instant dispatch to writer</span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="relative p-6 rounded-2xl bg-ivory/60 border border-border hover:border-accent/40 transition-colors flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-serif text-lg font-bold mb-4 shadow-sm">
                  4
                </div>
                <h3 className="font-serif text-lg font-bold text-navy mb-1">
                  Writer Verifies & Unlocks
                </h3>
                <UrduText size="sm" className="text-navy/70 mb-2 py-0">
                  تصدیق کے بعد فوری لائبریری رسائی
                </UrduText>
                <p className="text-xs text-secondary leading-relaxed">
                  The writer checks their bank account, confirms receipt, and the complete novel is permanently added to your reader library.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Lifetime library access</span>
              </div>
            </div>

          </div>

        </div>
      </section>


      {/* 3. FEATURED NOVELS SHOWCASE */}
      <section className="py-16 sm:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col md:flex-row items-baseline justify-between gap-4 mb-10 pb-4 border-b border-border">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-accent font-sans">
                Curated Collection
              </span>
              <h2 className="font-serif text-3xl font-bold text-navy">
                Featured Urdu Novels
              </h2>
            </div>
            
            <div className="flex items-center gap-4">
              <UrduText as="span" size="sm" className="text-secondary hidden sm:inline py-0">
                منتخب اور مقبول ترین ناولز
              </UrduText>
              <Link
                href="/novels"
                className="inline-flex items-center gap-1 text-sm font-medium text-navy hover:text-accent transition-colors group"
              >
                <span>View Full Catalog</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Grid of Novel Cards (Aspect Ratio 2:3, Realistic Urdu Typography) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {FEATURED_NOVELS.map((novel) => (
              <NovelCard key={novel.id} novel={novel} />
            ))}
          </div>

        </div>
      </section>


      {/* 4. WRITER CALL-TO-ACTION BANNER */}
      <section className="py-16 bg-navy text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="bg-navy-light/60 border border-slate-700/80 rounded-3xl p-8 sm:p-12 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-8">
            
            <div className="space-y-4 max-w-2xl text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 border border-accent/30 text-accent text-xs font-semibold">
                <Feather className="w-3.5 h-3.5" />
                <span>For Pakistani Novelists & Authors</span>
              </div>

              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-white">
                Retain Your Royalties. Sell Directly to Readers.
              </h2>

              <UrduText size="lg" className="text-slate-300 py-1 leading-[2.4]">
                اپنے ناولز کی فروخت پر مکمل اختیار پائیں اور رقم براہِ راست اپنے اکاؤنٹ میں وصول کریں۔
              </UrduText>

              <p className="text-sm text-slate-300 leading-relaxed">
                Connect directly with passionate Urdu readers across Pakistan and the global diaspora. Receive payments straight to your JazzCash, EasyPaisa, or Bank. We only track a transparent {siteConfig.defaultCommissionPercentage}% platform commission after you verify payment receipt.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0 w-full sm:w-auto">
              <Link
                href="/writers/onboarding"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-accent hover:bg-accent-light text-navy font-semibold text-sm transition-all shadow-gold"
              >
                <span>Start Selling Novels</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/writers/guidelines"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-medium text-sm transition-all"
              >
                <span>Read Writer Guidelines</span>
              </Link>
            </div>

          </div>
        </div>
      </section>

    </div>
  );
}
