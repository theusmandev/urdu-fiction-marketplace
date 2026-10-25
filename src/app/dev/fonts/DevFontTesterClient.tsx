'use client';

import React, { useState } from 'react';
import { UrduText } from '@/components/urdu/UrduText';
import { ArabicText } from '@/components/urdu/ArabicText';

const SIZES = [16, 18, 20, 24, 28] as const;
const LINE_HEIGHTS = [1.6, 1.8, 2.0, 2.2] as const;

const SAMPLE_DATA = {
  novelParagraph: `شام کے سائے گہرے ہو رہے تھے اور قدیم حویلی کی بوسیدہ کھڑکیوں سے چھنتی ہوئی زرد روشنی فرش پر پراسرار لکیریں کھینچ رہی تھی۔ زلیخا نے اپنے کانپتے ہاتھوں سے وہ پرانی کتاب کھولی جس کے زرد صفحات پر برسوں کی داستانیں منجمد تھیں۔ ہر صفحہ ایک نئی سرگوشی کرتا ہوا محسوس ہوتا تھا جیسے ماضی کے گمشدہ کردار دوبارہ زندہ ہو کر اس تاریک دالان میں سانس لینے لگے ہوں۔ ہوا کے تیز جھونکے نے چراغ کی لو کو لرزایا، مگر اس کی نگاہیں متن کی گہرائیوں میں غرق تھیں۔`,
  titleWithAscenders: `تخلیقی فن پاروں کی سرکشی، طوفانی لہریں اور کہکشاں کی سرگوشیاں`,
  mixedBilingual: `آرڈر نمبر #ORD-2026-9812 کی فوری تصدیق بذریعہ JazzCash یا Raast P2M پر PKR 5,000 میں مکمل کر دی گئی ہے۔ مصنف کو 20% کمیشن کی کٹوتی کے بعد رقم منتقل ہوگی۔ تکنیکی معاونت کے لیے support@unbpremium.pk پر ای میل فرمائیں۔`,
  digitsAndPunctuation: `اردو ہندسے اور علاماتِ اوقاف: ۰ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹ — قیمت: ۲,۴۵۰ روپے؛ کیا آپ کو معلوم ہے؟ ہاں، یہ حقیقت ہے، مگر: ”کوشش اور سچائی ہی فتح کی ضامن ہے!“`,
  poetryCouplet: [
    `ہزاروں خواہشیں ایسی کہ ہر خواہش پہ دم نکلے`,
    `بہت نکلے مرے ارمان لیکن پھر بھی کم نکلے`,
  ],
  quranicVerses: [
    `بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ`,
    `الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ۝ الرَّحْمَٰنِ الرَّحِيمِ ۝ مَالِكِ يَوْمِ الدِّينِ`,
  ],
};

export function DevFontTesterClient() {
  const [selectedSize, setSelectedSize] = useState<number>(18);
  const [selectedLineHeight, setSelectedLineHeight] = useState<number>(2.0);
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('dark');
  const [showBoundingBox, setShowBoundingBox] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'matrix' | 'specimen' | 'quran-audit'>('matrix');

  const themeClasses = {
    light: 'bg-[#FAF8F5] text-stone-900 border-stone-200',
    dark: 'bg-[#121214] text-stone-100 border-slate-800',
    sepia: 'bg-[#F4ECD8] text-[#4A3B2C] border-[#E2D5BA]',
  }[theme];

  return (
    <div className="space-y-8">
      {/* Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'matrix' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Line-Height Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('specimen')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'specimen' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Comprehensive Specimen
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quran-audit')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'quran-audit' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Quranic Tashkeel Audit
          </button>
        </div>

        {/* Theme & Visual Guides */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showBoundingBox}
              onChange={(e) => setShowBoundingBox(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0"
            />
            <span>Visual Bounding Box</span>
          </label>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {(['light', 'dark', 'sepia'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors ${
                  theme === t ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 1: LINE-HEIGHT MATRIX                                               */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          {/* Size Selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-mono">Inspect Font Size:</span>
            <div className="flex items-center gap-1">
              {SIZES.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setSelectedSize(sz)}
                  className={`px-3 py-1 rounded-lg font-mono font-semibold transition-colors ${
                    selectedSize === sz
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {sz}px
                </button>
              ))}
            </div>
          </div>

          {/* 4 Line-Height Cards Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {LINE_HEIGHTS.map((lh) => {
              const isRecommendedBody = lh === 2.0;
              const isRecommendedTitle = lh === 1.8;

              return (
                <div
                  key={lh}
                  className={`rounded-2xl border p-5 space-y-3 transition-colors ${themeClasses}`}
                >
                  <div className="flex items-center justify-between border-b border-current/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold">
                        Line Height: {lh.toFixed(1)}
                      </span>
                      {isRecommendedBody && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Recommended Body
                        </span>
                      )}
                      {isRecommendedTitle && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Recommended Heading
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] opacity-60 font-mono">Size: {selectedSize}px</span>
                  </div>

                  {/* Paragraph Render */}
                  <div
                    className={`${showBoundingBox ? 'outline-dashed outline-1 outline-amber-500/30 p-2 rounded' : ''}`}
                    style={{
                      fontSize: `${selectedSize}px`,
                      lineHeight: lh,
                    }}
                  >
                    <UrduText as="div" className="py-0">
                      {SAMPLE_DATA.novelParagraph}
                    </UrduText>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 2: COMPREHENSIVE SPECIMEN                                           */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'specimen' && (
        <div className="space-y-8">
          {/* Selectors */}
          <div className="flex flex-wrap items-center gap-4 bg-slate-900 p-4 rounded-2xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-mono">Size:</span>
              {SIZES.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setSelectedSize(sz)}
                  className={`px-2.5 py-1 rounded font-mono font-semibold transition-colors ${
                    selectedSize === sz
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {sz}px
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-mono">Line-Height:</span>
              {LINE_HEIGHTS.map((lh) => (
                <button
                  key={lh}
                  type="button"
                  onClick={() => setSelectedLineHeight(lh)}
                  className={`px-2.5 py-1 rounded font-mono font-semibold transition-colors ${
                    selectedLineHeight === lh
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {lh.toFixed(1)}
                </button>
              ))}
            </div>
          </div>

          <div className={`rounded-2xl border p-8 space-y-8 ${themeClasses}`}>
            {/* 1. Novel Heading */}
            <div className="space-y-2 border-b border-current/10 pb-6">
              <div className="text-[11px] font-mono opacity-50 uppercase tracking-widest">
                1. Title with Ascenders &amp; Descenders (ک، گ، ط، ظ، ل، ی، ے)
              </div>
              <div
                className={showBoundingBox ? 'outline-dashed outline-1 outline-rose-500/40 p-2 rounded' : ''}
                style={{ fontSize: `${selectedSize + 8}px`, lineHeight: 1.8 }}
              >
                <UrduText as="h2" className="py-0 font-normal">
                  {SAMPLE_DATA.titleWithAscenders}
                </UrduText>
              </div>
            </div>

            {/* 2. Long Novel Paragraph */}
            <div className="space-y-2 border-b border-current/10 pb-6">
              <div className="text-[11px] font-mono opacity-50 uppercase tracking-widest">
                2. Long Novel Paragraph (Ligature Flow &amp; Vertical Stacking)
              </div>
              <div
                className={showBoundingBox ? 'outline-dashed outline-1 outline-amber-500/40 p-2 rounded' : ''}
                style={{ fontSize: `${selectedSize}px`, lineHeight: selectedLineHeight }}
              >
                <UrduText as="p" className="py-0 font-normal text-justify">
                  {SAMPLE_DATA.novelParagraph}
                </UrduText>
              </div>
            </div>

            {/* 3. Mixed Urdu-English Text */}
            <div className="space-y-2 border-b border-current/10 pb-6">
              <div className="text-[11px] font-mono opacity-50 uppercase tracking-widest">
                3. Mixed Urdu-English Text (LTR/RTL Boundary Isolation &amp; Symbols)
              </div>
              <div
                className={showBoundingBox ? 'outline-dashed outline-1 outline-emerald-500/40 p-2 rounded' : ''}
                style={{ fontSize: `${selectedSize}px`, lineHeight: selectedLineHeight }}
              >
                <UrduText as="p" className="py-0 font-normal">
                  {SAMPLE_DATA.mixedBilingual}
                </UrduText>
              </div>
            </div>

            {/* 4. Urdu Digits & Punctuation */}
            <div className="space-y-2 border-b border-current/10 pb-6">
              <div className="text-[11px] font-mono opacity-50 uppercase tracking-widest">
                4. Urdu Digits &amp; Punctuation (، ۔ ؟ ؛ ” “ !)
              </div>
              <div
                className={showBoundingBox ? 'outline-dashed outline-1 outline-blue-500/40 p-2 rounded' : ''}
                style={{ fontSize: `${selectedSize}px`, lineHeight: selectedLineHeight }}
              >
                <UrduText as="p" className="py-0 font-normal">
                  {SAMPLE_DATA.digitsAndPunctuation}
                </UrduText>
              </div>
            </div>

            {/* 5. Poetry Lines */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono opacity-50 uppercase tracking-widest">
                5. Classical Urdu Poetry (اشعار — Centered Balance)
              </div>
              <div
                className={`text-center space-y-2 ${showBoundingBox ? 'outline-dashed outline-1 outline-purple-500/40 p-4 rounded' : ''}`}
                style={{ fontSize: `${selectedSize + 2}px`, lineHeight: 2.1 }}
              >
                <UrduText as="div" className="py-0 text-center">
                  {SAMPLE_DATA.poetryCouplet[0]}
                </UrduText>
                <UrduText as="div" className="py-0 text-center">
                  {SAMPLE_DATA.poetryCouplet[1]}
                </UrduText>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 3: QURANIC HARAKAT / TASHKEEL AUDIT                                 */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'quran-audit' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-amber-400">Quranic &amp; Arabic Tashkeel Rendering Verification</div>
            <p>
              In traditional Nastaliq typography, dense Arabic diacritics (harakat / tashkeel like fatha, kasra, shaddah, sukun) can sometimes collide with diagonally stacked ligatures.
              Below is a direct side-by-side comparison of Quranic verses rendered in <span className="font-semibold text-amber-300">Gulzar (Nastaliq)</span> versus our dedicated opt-in <span className="font-semibold text-emerald-300">&lt;ArabicText&gt; component (Amiri Naskh)</span>.
            </p>
          </div>

          <div className={`rounded-2xl border p-6 space-y-8 ${themeClasses}`}>
            {SAMPLE_DATA.quranicVerses.map((verse, idx) => (
              <div key={idx} className="space-y-4 border-b border-current/10 pb-6 last:border-b-0">
                <div className="text-xs font-mono opacity-60">Verse #{idx + 1}</div>

                {/* Gulzar Nastaliq */}
                <div className="space-y-1">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Gulzar Nastaliq (font-urdu)
                  </span>
                  <div
                    className="p-4 rounded-xl bg-current/5"
                    style={{ fontSize: '24px', lineHeight: 2.2 }}
                  >
                    <UrduText as="div" className="py-0">
                      {verse}
                    </UrduText>
                  </div>
                </div>

                {/* Amiri Naskh */}
                <div className="space-y-1">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Amiri Naskh (&lt;ArabicText&gt;)
                  </span>
                  <div
                    className="p-4 rounded-xl bg-current/5"
                    style={{ fontSize: '24px', lineHeight: 2.2 }}
                  >
                    <ArabicText as="div" size="xl">
                      {verse}
                    </ArabicText>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
