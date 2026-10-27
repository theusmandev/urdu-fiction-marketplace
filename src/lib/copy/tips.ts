/**
 * UNB Premium — Tip Jar & Author Appreciation Microcopy
 * 
 * Strict Repository Copy Guardrails:
 * 1. Appreciation, never begging.
 * 2. Words like "donate", "donation", "please help", "charity", "fundraiser" are FORBIDDEN.
 * 3. Honest disclosure: Optional gift, 100% direct to author, 0% platform commission, unlocks nothing.
 * 4. Dual-language (English and Urdu Nastaliq).
 */

export interface TipPresetOption {
  id: string;
  amount: number;
  labelEnglish: string;
  labelUrdu: string;
  descriptionEnglish: string;
  descriptionUrdu: string;
}

export const TIP_PRESETS: TipPresetOption[] = [
  {
    id: 'chai',
    amount: 100,
    labelEnglish: 'Chai',
    labelUrdu: 'چائے',
    descriptionEnglish: 'A small warm gesture',
    descriptionUrdu: 'ایک گرما گرم کپ چائے کے ساتھ داد',
  },
  {
    id: 'mithai',
    amount: 250,
    labelEnglish: 'Mithai',
    labelUrdu: 'مٹھائی',
    descriptionEnglish: 'A sweet appreciation',
    descriptionUrdu: 'کہانی کی مٹھاس کا میٹھا سا شکریہ',
  },
  {
    id: 'eidi',
    amount: 500,
    labelEnglish: 'Eidi',
    labelUrdu: 'عیدی',
    descriptionEnglish: 'Generous encouragement',
    descriptionUrdu: 'خاص موقع پر دل کھول کر حوصلہ افزائی',
  },
];

export const tipsCopy = {
  card: {
    titleEnglish: 'Say thanks to the author',
    titleUrdu: 'مصنف کو شکریہ کہیں',
    taglineEnglish: 'Did you enjoy this story? You can send a direct appreciation gift to the author.',
    taglineUrdu: 'یہ کہانی پسند آئی؟ آپ مصنف کو براہِ راست شکریہ کا تحفہ بھیج سکتے ہیں۔',
    honestLineEnglish: 'Optional. The whole amount goes directly to the author; UNB Premium takes no share.',
    honestLineUrdu: 'اختیاری ہے۔ پوری رقم براہِ راست مصنف کو جاتی ہے؛ یو این بی پریمیم کوئی حصہ نہیں لیتا۔',
    customAmountLabelEnglish: 'Custom amount (PKR)',
    customAmountLabelUrdu: 'اپنی مرضی کی رقم (روپے)',
    messageLabelEnglish: 'Add an appreciation note (optional)',
    messageLabelUrdu: 'تعریفی پیغام شامل کریں (اختیاری)',
    messagePlaceholderEnglish: 'Write a warm note to encourage the author...',
    messagePlaceholderUrdu: 'مصنف کی حوصلہ افزائی کے لیے تعریفی جملے لکھیں...',
    anonymousLabelEnglish: 'Send anonymously',
    anonymousLabelUrdu: 'نام ظاہر کیے بغیر بھیجیں',
    anonymousSubtextEnglish: 'Your name will not be shown to the author or other readers.',
    anonymousSubtextUrdu: 'آپ کا نام مصنف یا دیگر قارئین کو ظاہر نہیں کیا جائے گا۔',
    ctaContinueEnglish: 'Continue to payment',
    ctaContinueUrdu: 'ادائیگی کی طرف بڑھیں',
    howItWorksLinkEnglish: 'How does this work?',
    howItWorksLinkUrdu: 'یہ کیسے کام کرتا ہے؟',
    signInPromptEnglish: 'Sign in to say thanks',
    signInPromptUrdu: 'شکریہ کہنے کے لیے لاگ ان کریں',
  },

  modal: {
    titleEnglish: 'How Reader Appreciation Works',
    titleUrdu: 'قاری کی طرف سے داد اور شکریہ کا طریقہ کار',
    points: [
      {
        titleEnglish: '100% Direct to the Author',
        titleUrdu: '۱۰۰٪ براہِ راست مصنف کے اکاؤنٹ میں',
        descEnglish: 'You transfer funds directly to the author\'s own Pakistani account (JazzCash, EasyPaisa, Raast, or Bank). UNB Premium never touches or holds this money.',
        descUrdu: 'آپ رقم براہِ راست مصنف کے اپنے اکاؤنٹ میں بھیجتے ہیں۔ یو این بی پریمیم اس رقم کو نہ تو لیتا ہے اور نہ روکتا ہے۔',
      },
      {
        titleEnglish: 'Zero Platform Commission',
        titleUrdu: 'پلیٹ فارم کا زیرو کمیشن',
        descEnglish: 'The platform takes 0% cut. Every single rupee goes directly into the writer\'s pocket.',
        descUrdu: 'پلیٹ فارم کوئی فیس یا کمیشن نہیں کاٹتا۔ پورا روپیہ مصنف کی محنت کا صلہ ہے۔',
      },
      {
        titleEnglish: 'Voluntary Gift — Unlocks Nothing',
        titleUrdu: 'خالصتاً تحفہ — کوئی مواد ان لاک نہیں ہوتا',
        descEnglish: 'Saying thanks is completely voluntary and non-refundable. It does not unlock any novels, chapters, or special features.',
        descUrdu: 'شکریہ کہنا مکمل طور پر اختیاری اور ناقابلِ واپسی ہے۔ اس سے کوئی ناول یا باب ان لاک نہیں ہوتا، یہ محض مصنف کی حوصلہ افزائی ہے۔',
      },
      {
        titleEnglish: 'Receipt Confirmation',
        titleUrdu: 'مصنف کی طرف سے تصدیق',
        descEnglish: 'After you submit your transaction reference (TID), the author will verify the deposit and send you a warm thank-you message.',
        descUrdu: 'جب آپ ٹرانزیکشن ریفرنس جمع کروائیں گے، تو مصنف بینک اسٹیٹمنٹ چیک کر کے آپ کا شکریہ وصول کرنے کی تصدیق کرے گا۔',
      },
    ],
    closeButtonEnglish: 'I understand',
    closeButtonUrdu: 'میں سمجھ گیا',
  },

  checkout: {
    step1Title: 'Select Amount & Message',
    step2Title: 'Direct Account Transfer',
    step3Title: 'Submit Payment Reference (TID)',
    warningNoticeEnglish: 'Important: Transfer the exact amount to the author\'s account shown below. Never send funds to any other account.',
    warningNoticeUrdu: 'اہم: براہِ کرم نیچے دیئے گئے مصنف کے اکاؤنٹ میں ہو بہو رقم منتقل کریں۔ کسی اور اکاؤنٹ پر رقم مت بھیجیں۔',
    tidLabelEnglish: 'Transaction Reference ID (TID)',
    tidLabelUrdu: 'ٹرانزیکشن ریفرنس آئی ڈی (TID)',
    tidPlaceholderEnglish: 'e.g. 1234567890',
    screenshotLabelEnglish: 'Payment Screenshot (Optional but recommended)',
    screenshotLabelUrdu: 'ادائیگی کا اسکرین شاٹ (اختیاری مگر تجویز کردہ)',
    senderNameLabelEnglish: 'Account Sender Name (Optional)',
    senderNameLabelUrdu: 'رقم بھیجنے والے کا نام (اختیاری)',
    submitButtonEnglish: 'Submit Payment Reference',
    submitButtonUrdu: 'ادائیگی کی تفصیلات جمع کروائیں',
    cancelButtonEnglish: 'Cancel Tip',
    cancelButtonUrdu: 'منسوخ کریں',
  },

  status: {
    pending_payment: {
      labelEnglish: 'Pending Payment',
      labelUrdu: 'ادائیگی کا انتظار',
      descEnglish: 'Please complete your bank transfer and submit the transaction reference (TID).',
      descUrdu: 'براہِ کرم بینک ٹرانسفر مکمل کر کے ٹرانزیکشن ریفرنس درج کریں۔',
    },
    payment_submitted: {
      labelEnglish: 'Sent — Awaiting Author Confirmation',
      labelUrdu: 'بھیج دیا گیا — مصنف کی تصدیق کا انتظار ہے',
      descEnglish: 'Your payment reference was submitted. The author will confirm receipt after checking their account statement.',
      descUrdu: 'آپ کی ادائیگی کا ریفرنس جمع ہو گیا ہے۔ مصنف اپنے اکاؤنٹ کی تصدیق کے بعد شکریہ قبول کرے گا۔',
    },
    confirmed: {
      labelEnglish: 'Confirmed by Author',
      labelUrdu: 'مصنف نے قبول کر لیا',
      descEnglish: 'The author has received your gift and sent you a personalized appreciation note.',
      descUrdu: 'مصنف نے آپ کا شکریہ وصول کر لیا ہے اور جوابی پیغام بھیجا ہے۔',
    },
    not_received: {
      labelEnglish: 'Deposit Not Found',
      labelUrdu: 'ادائیگی موصول نہیں ہوئی',
      descEnglish: 'The author was unable to find this deposit in their account.',
      descUrdu: 'مصنف کو اکاؤنٹ میں یہ رقم موصول نہیں ہوئی ہے۔ براہِ کرم تفصیلات دوبارہ چیک کریں۔',
    },
    cancelled: {
      labelEnglish: 'Cancelled',
      labelUrdu: 'منسوخ شدہ',
      descEnglish: 'This tip was cancelled before payment submission.',
      descUrdu: 'یہ ٹپ ادائیگی جمع کروانے سے پہلے منسوخ کر دی گئی تھی۔',
    },
    expired: {
      labelEnglish: 'Expired',
      labelUrdu: 'میعاد ختم',
      descEnglish: 'This pending tip expired after 7 days without payment submission.',
      descUrdu: 'سات دن تک ادائیگی جمع نہ ہونے کے باعث اس ٹپ کی میعاد ختم ہو چکی ہے۔',
    },
  },

  writer: {
    title: 'Say Thanks (Tip Jar)',
    titleUrdu: 'شکریہ (ٹپ جار)',
    pageTitle: 'Reader Appreciation & Tips',
    pageSubtitle: 'Readers who love your stories can send you a voluntary direct gift with 0% platform fee.',
    reminderBannerTitle: 'Voluntary Reader Gifts — Not a Substitute for Book Sales',
    reminderBannerBody: 'Tips are optional gifts and unlock nothing. Asking readers to tip instead of purchasing novels is strictly against the Writer Agreement.',
    agreementNotice: 'Reminder: Tips are gifts and unlock nothing. Demanding tips or offering chapters in exchange for tips is strictly against the Writer Agreement.',
    enableSwitchLabel: 'Accept reader appreciation tips',
    enableSwitchSubtext: 'When enabled, a respectful "Say thanks" card appears at the end of your chapters and on your profile.',
    enableSwitchDesc: 'When enabled, a respectful "Say thanks" card appears at the end of your chapters and on your profile.',
    thankYouMessageLabel: 'Default Thank-You Message',
    thankYouMessageHelp: 'This message will be shown to readers when you confirm receiving their appreciation.',
    accountsLabel: 'Payment accounts for tips',
    accountsHelp: 'Select which of your active payment methods should accept direct tip transfers.',
    presetsLabel: 'Preset appreciation amounts (PKR)',
    presetsHelp: 'Configure up to 4 suggested amounts for readers.',
    minMaxLabel: 'Custom Amount Bounds',
    minHelp: 'Minimum allowed custom amount (PKR)',
    maxHelp: 'Maximum allowed custom amount (PKR)',
    livePreviewTitle: 'Live Preview (Reader View)',
    saveSettingsButton: 'Save Tip Settings',
    savedSuccess: 'Your tip settings have been updated.',
    tabs: {
      awaiting: 'Awaiting Confirmation',
      confirmed: 'Confirmed',
      not_received: 'Not Received',
      all: 'All Tips',
    },
    actions: {
      received: 'I received it',
      notReceived: 'Not received',
      replyPlaceholder: 'Add a personal thank-you message (prefilled with your default)...',
      reasonPlaceholder: 'Explain briefly why this payment was not found in your account...',
      confirmAction: 'Confirm & Send Thanks',
      rejectAction: 'Mark Not Received',
    },
    analytics: {
      totalConfirmedTitle: 'Total Confirmed Appreciation',
      supportersCountTitle: 'Generous Readers',
      pendingTitle: 'Awaiting Your Confirmation',
      privateNotice: 'These statistics are strictly private to you. UNB Premium never publishes supporter counts or financial totals.',
    },
  },

  supportContact: {
    helpLineEnglish: 'Still waiting after 72 hours? Contact our reader support team.',
    helpLineUrdu: 'اگر ۷۲ گھنٹے بعد بھی تصدیق نہ ہو تو کسٹمر سپورٹ سے رابطہ کریں۔',
    linkText: 'Contact Support',
  },
} as const;

export const PRESET_LABELS: Record<number, { name: string; nameUrdu: string }> = {
  100: { name: 'Chai', nameUrdu: 'چائے' },
  250: { name: 'Mithai', nameUrdu: 'مٹھائی' },
  500: { name: 'Eidi', nameUrdu: 'عیدی' },
};

export const TIP_CARD_COPY = {
  title: 'Say thanks',
  titleUrdu: 'شکریہ کہیں',
  tagline: 'Did you enjoy this story? You can send a direct appreciation gift to the author.',
  taglineUrdu: 'یہ کہانی پسند آئی؟ مصنف کو شکریہ کہیں',
  honestLine: 'Optional. The whole amount goes directly to the author; UNB Premium takes no share.',
  honestLineUrdu: 'اختیاری ہے۔ پوری رقم براہِ راست مصنف کو جاتی ہے؛ یو این بی پریمیم کوئی حصہ نہیں لیتا۔',
  customLabel: 'Custom',
  customLabelUrdu: 'دیگر رقم',
  messagePlaceholder: 'Write a warm note to encourage the author...',
  anonymousLabel: 'Send anonymously',
  anonymousOption: 'Send anonymously',
  anonymousSubtext: 'Your name will not be shown to the author or other readers.',
  continueButton: 'Continue',
  continueButtonUrdu: 'جاری رکھیں',
  howItWorks: 'How it works',
  howItWorksUrdu: 'یہ کیسے کام کرتا ہے',
  signInToTip: 'Sign in to say thanks',
  errors: {
    amountRequired: 'Please choose or enter an appreciation amount.',
    failedToCreate: 'Unable to start tip. Please try again.',
  },
} as const;

export const HOW_TIPS_WORK = {
  title: 'How Appreciation Works',
  titleUrdu: 'قاری کی طرف سے داد اور شکریہ کا طریقہ کار',
  honestLine: 'Optional. The whole amount goes directly to the author; UNB Premium takes no share.',
  honestLineUrdu: 'اختیاری ہے۔ پوری رقم براہِ راست مصنف کو جاتی ہے؛ یو این بی پریمیم کوئی حصہ نہیں لیتا۔',
  points: {
    zeroCommission: '100% Direct to the Author (0% Commission)',
    zeroCommissionDesc: 'You transfer funds directly to the author\'s own Pakistani account (JazzCash, EasyPaisa, Raast, or Bank). UNB Premium never touches or holds this money.',
    giftOnly: 'Voluntary Gift — Unlocks Nothing',
    giftOnlyDesc: 'A tip is a non-refundable gift to say thanks. It does not unlock any novels, chapters, or special features.',
    directConfirmation: 'Receipt Confirmation',
    directConfirmationDesc: 'After you submit your transaction reference (TID), the author verifies the deposit and sends you a warm thank-you message.',
  },
} as const;

export const WRITER_STUDIO_COPY = tipsCopy.writer;

