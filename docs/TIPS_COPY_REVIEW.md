# UNB Premium — Tip Jar & Reader Appreciation Copy Review

## 1. Overview & Guardrails
This document catalogs all reader- and writer-facing microcopy in the Tip Jar / Reader Appreciation flow across UNB Premium.

### Mandatory Linguistic & Policy Guardrails:
1. **Appreciation, Never Begging**: Prohibits words like "donate", "donation", "please help", "charity", "support me", or "fundraiser".
2. **0% Platform Fee Disclosure**: The reader is always reminded that 100% of the funds go directly into the author's account with zero platform fee.
3. **Voluntary Gift**: Unlocks nothing; completely voluntary; never a substitute for buying book chapters.
4. **Authentic Urdu Nastaliq**: Renders through `font-urdu` with safe line-heights (`leading-[2.2]`+) to avoid calligraphy clipping.

---

## 2. Issues Found and Resolved

| File Location | Previous String | Corrected String | Reason |
| :--- | :--- | :--- | :--- |
| `src/app/(marketplace)/tips/page.tsx` | `فی الوقت کوئی ناول دستیاب نہیں ہے` | `ابھی تک آپ نے کسی مصنف کو شکریہ نہیں بھیجا` | Bug: EmptyState defaulted to novel catalog copy. |
| `src/app/(marketplace)/tips/page.tsx` | `Explore Masterworks` | `Browse novels` | Clear, reader-oriented call to action. |
| `src/app/(marketplace)/tips/page.tsx` | `شکریہ کے پیغامات` | `میرے شکریے` | Unified reader-facing terminology (`My Thanks`). |
| `src/app/writer/tips/WriterTipsClient.tsx` | `شکریہ (ٹپ جار)` | `موصول شکریے` | Unified writer-facing terminology (`Thanks received`). |
| `src/app/writer/profile/WriterProfileForm.tsx` | `مصنف کا تعارف (اردو بایو)` | `مصنف کا تعارف` | Removed developer artifact/parenthetical jargon. |
| `src/app/(marketplace)/writers/page.tsx` | `پلیٹ فارم کے تصدیق شدہ ناول نگار` | `پلیٹ فارم کے منظور شدہ ناول نگار` | Replaced false verification claim with accurate admin approval statement. |
| `src/app/(marketplace)/writers/[username]/page.tsx` | `Verified Pakistani Author` | `Approved author` | Admin approval is not identity or nationality verification. |
| `src/app/writer/page.tsx` | `Verified Author` | `Approved author` | System-wide badge alignment. |
| `src/components/layout/shared/AccountMenu.tsx` | `Verified Author` | `Approved author` | System-wide badge alignment. |

---

## 3. String Audit Across Screens

### A. Public Reader Component (`TipCard.tsx` & `WriterProfileTipButton.tsx`)
- **Button label**: `Say thanks / شکریہ کہیں` (Sized ~1.2x Latin text, baseline aligned, 44px min touch height).
- **Owner notice on own profile**: `Readers see a "Say thanks" button here. / قارئین کو یہاں "شکریہ کہیں" کا بٹن دکھائی دیتا ہے۔`
- **Sign-in prompt**: `Sign in to say thanks / شکریہ کہنے کے لیے لاگ ان کریں` (with `?next=` redirection).
- **Disabled notice**: `Appreciation is currently paused for this author. / مصنف نے فی الوقت قارئین کے تحائف وصول کرنے کا اختیار بند کر رکھا ہے۔`
- **Maintenance / Kill switch**: `Reader appreciation is temporarily paused platform-wide. / پلیٹ فارم پر شکریہ کی سروس عارضی طور پر معطل ہے۔`
- **Preset badges**:
  - Chai (PKR 100): `چائے` — `ایک گرما گرم کپ چائے کے ساتھ داد`
  - Mithai (PKR 250): `مٹھائی` — `کہانی کی مٹھاس کا میٹھا سا شکریہ`
  - Eidi (PKR 500): `عیدی` — `خاص موقع پر دل کھول کر حوصلہ افزائی`
- **Honest line**: `Optional. The whole amount goes directly to the author; UNB Premium takes no share.` / `اختیاری ہے۔ پوری رقم براہِ راست مصنف کو جاتی ہے؛ یو این بی پریمیم کوئی حصہ نہیں لیتا۔`

### B. Reader Management (`/tips` & `/tips/[tipNumber]`)
- **Section title**: `My Thanks / میرے شکریے`
- **Empty state**: `No thanks sent yet` / `ابھی تک آپ نے کسی مصنف کو شکریہ نہیں بھیجا`
- **Status badges**:
  - `pending_payment`: `Pending Payment / ادائیگی کا انتظار`
  - `payment_submitted`: `Sent — Awaiting Author Confirmation / بھیج دیا گیا — مصنف کی تصدیق کا انتظار ہے`
  - `confirmed`: `Confirmed by Author / مصنف نے قبول کر لیا`
  - `not_received`: `Deposit Not Found / ادائیگی موصول نہیں ہوئی`
  - `cancelled`: `Cancelled / منسوخ شدہ`
  - `expired`: `Expired / میعاد ختم`

### C. Writer Studio (`/writer/tips`)
- **Section title**: `Thanks received / موصول شکریے`
- **Toggle label**: `Accept reader appreciation tips` with high-contrast `ON • فعال` and `OFF • غیر فعال` indicator.
- **Live Preview mock**: Non-interactive preview with `PREVIEW • پیش منظر` banner and dimmed caption `Tips are off — readers do not see this card` when switched off.
- **Static 3-Step Reader Modal**: `قاری کے لیے شکریہ بھیجنے کے ۳ مراحل` (Select Amount -> Transfer & TID -> Confirmation & Reply).
- **Thank-you reply textareas**: `dir="auto"`, `font-urdu`, `leading-[2.2]`, live counter `{length} / 500`.
