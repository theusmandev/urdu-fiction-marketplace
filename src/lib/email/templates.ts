/**
 * UNB Premium — Luxury Email Templates & Sanitization
 *
 * Visual Aesthetic (Editorial Ivory & Warm Brown):
 * - Canvas Background: Sand Ivory (#F1ECDF)
 * - Card Container: Crisp White (#FFFFFF) with warm border (#E6DFD0) and 10px radius
 * - Typography: Georgia bold italic header in Brand Brown (#813B09)
 * - Header Badge: Dark Brown (#5F2F16) pill with Gold border and dashes (#D39A2A)
 * - Text: Dark Slate (#22262B) for high legibility, Muted Neutral (#5B6470) for secondary notes
 * - Callouts & Accents: Soft Cream (#FAF6EE), Warm Gold (#D39A2A / #8E6410)
 *
 * Strict Non-Sensitive Email Invariant:
 * Platform emails NEVER include writer or reader bank account numbers, IBANs,
 * transaction reference IDs (TIDs), or screenshot URLs.
 * They only contain a branded operational message and a secure link
 * directing the user to inspect the details directly on UNB Premium.
 */

export interface EmailRenderInput {
  template: string;
  subject: string;
  bodyText: string;
  recipientEmail?: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateMetadata {
  badgeText: string;
  badgeUrdu: string;
  ctaLabel: string;
  ctaPath: string;
  whatHappenedEn: string;
  whatHappenedUr: string;
  actionGuidanceEn: string;
  actionGuidanceUr: string;
}

export const TEMPLATE_REGISTRY: Record<string, TemplateMetadata> = {
  // ---------------------------------------------------------------------------
  // 1. ORDERS & PAYMENTS (Reader & Writer)
  // ---------------------------------------------------------------------------
  payment_verified: {
    badgeText: "Novel Unlocked",
    badgeUrdu: "رسائی مل گئی",
    ctaLabel: "Open My Library",
    ctaPath: "/library",
    whatHappenedEn: "The author has verified your payment, and your novel access has been granted.",
    whatHappenedUr: "مصنف نے آپ کی ادائیگی کی تصدیق کر دی ہے اور ناول تک مکمل رسائی مل گئی ہے۔",
    actionGuidanceEn: "The novel is permanently added to your personal library. Tap below to start reading all unlocked chapters immediately.",
    actionGuidanceUr: "یہ ناول مستقل طور پر آپ کی لائبریری میں شامل ہو چکا ہے۔ نیچے دیے گئے بٹن پر کلک کر کے فوری مطالعہ شروع کریں۔",
  },
  order_payment_submitted: {
    badgeText: "Payment Verification",
    badgeUrdu: "ادائیگی کی تصدیق",
    ctaLabel: "Review Payment in Studio",
    ctaPath: "/writer/orders",
    whatHappenedEn: "A reader submitted payment reference details for an order.",
    whatHappenedUr: "قاری نے آرڈر کے لیے ادائیگی کی رسید اور تفصیلات جمع کرا دی ہیں۔",
    actionGuidanceEn: "Check your bank or wallet statement (JazzCash, EasyPaisa, Raast, or Bank Transfer) for the deposit, then verify the order in Writer Studio to unlock the novel.",
    actionGuidanceUr: "اپنے اکاؤنٹ میں رقم کی وصولی کی تصدیق کریں، پھر قاری کو ناول فراہم کرنے کے لیے رائٹر اسٹوڈیو سے آرڈر کی توثیق کریں۔",
  },
  payment_rejected: {
    badgeText: "Payment Declined",
    badgeUrdu: "ادائیگی مسترد",
    ctaLabel: "View Order Details",
    ctaPath: "/orders",
    whatHappenedEn: "The author was unable to verify the payment reference submitted for your order.",
    whatHappenedUr: "مصنف آپ کی جمع کرائی گئی ادائیگی کی تصدیق نہیں کر سکے۔",
    actionGuidanceEn: "Please review the author's note on your order page and double-check your transaction receipt or TID. You can resubmit or contact support if your account was debited.",
    actionGuidanceUr: "براہ کرم اپنے آرڈر پیج پر مصنف کا نوٹ دیکھیں اور اپنی بینک رسید یا ٹرانزیکشن آئی ڈی دوبارہ چیک کریں۔ اگر رقم کٹ چکی ہے تو سپورٹ سے رابطہ کریں۔",
  },

  // ---------------------------------------------------------------------------
  // 2. WRITER ONBOARDING & NOVEL MODERATION
  // ---------------------------------------------------------------------------
  writer_approved: {
    badgeText: "Writer Studio",
    badgeUrdu: "رائٹر اسٹوڈیو",
    ctaLabel: "Set Up Payment Methods",
    ctaPath: "/writer/payment-methods",
    whatHappenedEn: "Your writer application on UNB Premium has been approved!",
    whatHappenedUr: "مبارک ہو! اردو ناول بینک پریمیئم پر بطور مصنف آپ کی درخواست منظور ہو گئی ہے۔",
    actionGuidanceEn: "Configure your payment receiving methods (JazzCash, EasyPaisa, Raast, or Bank Transfer) in Writer Studio so readers can purchase your novels directly.",
    actionGuidanceUr: "قارئین سے براہ راست ادائیگی وصول کرنے کے لیے رائٹر اسٹوڈیو میں اپنے ادائیگی کے طریقے (JazzCash، EasyPaisa، Raast یا بینک اکاؤنٹ) سیٹ کریں۔",
  },
  writer_rejected: {
    badgeText: "Application Status",
    badgeUrdu: "درخواست کا فیصلہ",
    ctaLabel: "Visit UNB Premium",
    ctaPath: "/",
    whatHappenedEn: "Your application to become a writer on UNB Premium was reviewed and could not be approved at this time.",
    whatHappenedUr: "آپ کی بطور مصنف درخواست کا جائزہ لیا گیا تاہم اس مرحلے پر اسے منظور نہیں کیا جا سکا۔",
    actionGuidanceEn: "Please review the feedback note below. You are welcome to continue exploring and reading novels on UNB Premium, or contact support with any questions.",
    actionGuidanceUr: "براہ کرم نیچے دیا گیا فیڈ بیک دیکھیں۔ آپ بطور قاری اردو ناول بینک پر کتب کا مطالعہ جاری رکھ سکتے ہیں یا سوالات کے لیے سپورٹ سے رابطہ کر سکتے ہیں۔",
  },
  novel_approved: {
    badgeText: "Novel Published",
    badgeUrdu: "ناول شائع شدہ",
    ctaLabel: "View Published Novel",
    ctaPath: "/writer/novels",
    whatHappenedEn: "Your novel passed editorial moderation and is now published on UNB Premium.",
    whatHappenedUr: "آپ کا ناول ادارتی جائزے کے بعد کامیابی سے شائع کر دیا گیا ہے۔",
    actionGuidanceEn: "Your novel is live for readers to discover and purchase. Visit Writer Studio to add new chapters, track orders, and view reader engagement.",
    actionGuidanceUr: "آپ کا ناول اب مارکیٹ پلیس پر قارئین کے لیے دستیاب ہے۔ نئے ابواب شامل کرنے اور آرڈرز دیکھنے کے لیے رائٹر اسٹوڈیو وزٹ کریں۔",
  },
  novel_rejected: {
    badgeText: "Moderation Notice",
    badgeUrdu: "نظر ثانی",
    ctaLabel: "Edit Novel in Studio",
    ctaPath: "/writer/novels",
    whatHappenedEn: "Your novel submission requires revisions before it can be published.",
    whatHappenedUr: "اشاعت سے قبل آپ کے ناول میں کچھ ترامیم درکار ہیں۔",
    actionGuidanceEn: "Please read the moderator notes below. Update your novel details or chapter contents in Writer Studio and submit again for editorial review.",
    actionGuidanceUr: "براہ کرم نیچے دی گئی ادارتی تجاویز پڑھیں، رائٹر اسٹوڈیو میں ناول کی تدوین کریں اور دوبارہ جائزے کے لیے جمع کرائیں۔",
  },

  // ---------------------------------------------------------------------------
  // 3. DISPUTES & REFUNDS
  // ---------------------------------------------------------------------------
  dispute_opened: {
    badgeText: "Dispute Opened",
    badgeUrdu: "تنازعہ درج",
    ctaLabel: "Open Dispute Thread",
    ctaPath: "/disputes",
    whatHappenedEn: "A payment dispute has been opened regarding an order.",
    whatHappenedUr: "اس آرڈر کے متعلق ایک تنازعہ درج کر دیا گیا ہے۔",
    actionGuidanceEn: "Review the dispute reason and evidence on the dispute page. Submit your response and banking proof so administrators can mediate a fair resolution.",
    actionGuidanceUr: "تنازعے کی تفصیلات اور شواہد دیکھیں اور اپنا تفصیلی موقف یا بینک ریکارڈ فراہم کریں تاکہ انتظامیہ منصفانہ فیصلہ کر سکے۔",
  },
  dispute_message: {
    badgeText: "Dispute Message",
    badgeUrdu: "نیا پیغام",
    ctaLabel: "Open Dispute Thread",
    ctaPath: "/disputes",
    whatHappenedEn: "A new message or evidence update has been posted to your dispute thread.",
    whatHappenedUr: "تنازعے کی گفتگو میں ایک نیا پیغام یا شواہد شامل کیے گئے ہیں۔",
    actionGuidanceEn: "Open the dispute thread to review the update and post your reply or additional documentation.",
    actionGuidanceUr: "نیا پیغام دیکھنے اور اپنا جواب یا دستاویزات جمع کرانے کے لیے نیچے دیا گیا لنک کھولیں۔",
  },
  dispute_resolved: {
    badgeText: "Dispute Resolved",
    badgeUrdu: "تنازعہ حل شدہ",
    ctaLabel: "View Dispute Resolution",
    ctaPath: "/disputes",
    whatHappenedEn: "Platform administrators have concluded their review and resolved the dispute.",
    whatHappenedUr: "انتظامیہ نے تمام شواہد کا جائزہ لے کر تنازعے کا حتمی فیصلہ کر دیا ہے۔",
    actionGuidanceEn: "Visit your disputes portal to review the administrator resolution notes, order status, and entitlement updates.",
    actionGuidanceUr: "انتظامیہ کا حتمی فیصلہ، آرڈر کی صورتحال اور مکمل تفصیلات دیکھنے کے لیے ڈسپیوٹ پورٹل وزٹ کریں۔",
  },
  refund_requested: {
    badgeText: "Refund Request",
    badgeUrdu: "ریفنڈ درخواست",
    ctaLabel: "View Order Details",
    ctaPath: "/orders",
    whatHappenedEn: "A refund request has been initiated for an order.",
    whatHappenedUr: "اس آرڈر کے لیے ریفنڈ کی درخواست دائر کی گئی ہے۔",
    actionGuidanceEn: "Review the refund request reason and order details on your orders page according to the platform refund policy.",
    actionGuidanceUr: "پلیٹ فارم کی ریفنڈ پالیسی کے مطابق آرڈرز پیج پر جا کر درخواست کی تفصیلات اور وجہ ملاحظہ فرمائیں۔",
  },
  refund_approved: {
    badgeText: "Refund Approved",
    badgeUrdu: "ریفنڈ منظور",
    ctaLabel: "View Order Details",
    ctaPath: "/orders",
    whatHappenedEn: "The refund request for your order has been approved.",
    whatHappenedUr: "آپ کے آرڈر پر ریفنڈ کی درخواست منظور کر لی گئی ہے۔",
    actionGuidanceEn: "The order status has been updated and access entitlements have been reconciled. View the updated order summary in your orders list.",
    actionGuidanceUr: "آرڈر کا اسٹیٹس اپ ڈیٹ کر دیا گیا ہے اور رسائی کا ریکارڈ درست ہو چکا ہے۔ اپنے آرڈرز میں مکمل تفصیل دیکھیں۔",
  },
  refund_rejected: {
    badgeText: "Refund Update",
    badgeUrdu: "ریفنڈ فیصلہ",
    ctaLabel: "View Order Details",
    ctaPath: "/orders",
    whatHappenedEn: "The refund request for your order was reviewed and could not be approved.",
    whatHappenedUr: "آپ کے آرڈر پر ریفنڈ کی درخواست کا جائزہ لیا گیا تاہم اسے منظور نہیں کیا جا سکا۔",
    actionGuidanceEn: "Inspect the decision details and notes on your order page. You may contact UNB Premium Support if you need further clarification.",
    actionGuidanceUr: "آرڈر پیج پر فیصلے کی وجوہات ملاحظہ فرمائیں۔ مزید وضاحت کے لیے آپ سپورٹ ڈیسک سے رابطہ کر سکتے ہیں۔",
  },

  // ---------------------------------------------------------------------------
  // 4. PLATFORM FEE STATEMENTS & SETTLEMENTS (30% Standard, PKR 5,000 Threshold)
  // ---------------------------------------------------------------------------
  invoice_issued: {
    badgeText: "Platform Fee Notice",
    badgeUrdu: "پلیٹ فارم فیس",
    ctaLabel: "View Platform Fee Invoice",
    ctaPath: "/writer/commission",
    whatHappenedEn: "Your accumulated unpaid platform fees have reached the PKR 5,000 threshold and a settlement invoice has been issued.",
    whatHappenedUr: "آپ کی غیر ادا شدہ پلیٹ فارم فیس 5,000 روپے کی حد تک پہنچ چکی ہے اور نیا انوائس جاری کر دیا گیا ہے۔",
    actionGuidanceEn: "Review your invoice breakdown in Writer Studio and submit your settlement payment proof via JazzCash, EasyPaisa, Raast, or Bank Transfer.",
    actionGuidanceUr: "رائٹر اسٹوڈیو میں جا کر انوائس چیک کریں اور فیس کی ادائیگی کی رسید جمع کرائیں تاکہ اکاؤنٹ معمول کے مطابق فعال رہے۔",
  },
  invoice_settled: {
    badgeText: "Settlement Confirmed",
    badgeUrdu: "ادائیگی مکمل",
    ctaLabel: "View Invoice Statement",
    ctaPath: "/writer/commission",
    whatHappenedEn: "Your platform fee settlement payment has been verified by platform administrators.",
    whatHappenedUr: "آپ کی پلیٹ فارم فیس کی ادائیگی کی تصدیق کر دی گئی ہے اور انوائس کلیئر ہو چکا ہے۔",
    actionGuidanceEn: "Your invoice is now marked as fully paid and your platform fee balance has been cleared. View or download your statement anytime.",
    actionGuidanceUr: "آپ کا انوائس مکمل ادا شدہ نشان زد ہو چکا ہے اور بیلنس کلیئر ہے۔ آپ رائٹر اسٹوڈیو سے اپنی اسٹیٹمنٹ ملاحظہ کر سکتے ہیں۔",
  },
  invoice_payment_rejected: {
    badgeText: "Payment Declined",
    badgeUrdu: "ادائیگی مسترد",
    ctaLabel: "Review Invoice Details",
    ctaPath: "/writer/commission",
    whatHappenedEn: "Platform administrators were unable to verify the payment reference submitted for your platform fee invoice.",
    whatHappenedUr: "پلیٹ فارم فیس کے انوائس کے لیے جمع کرائی گئی ادائیگی کی تصدیق نہیں ہو سکی۔",
    actionGuidanceEn: "Please review the rejection reason in Writer Studio, verify the deposit with your bank, and submit an updated transaction reference.",
    actionGuidanceUr: "براہ کرم رائٹر اسٹوڈیو میں ایڈمن کا نوٹ دیکھیں، بینک ریکارڈ چیک کریں اور درست رسید دوبارہ جمع کرائیں۔",
  },
  invoice_overdue: {
    badgeText: "Platform Fee Overdue",
    badgeUrdu: "پلیٹ فارم فیس واجب الادا",
    ctaLabel: "View Platform Fee Invoice",
    ctaPath: "/writer/commission",
    whatHappenedEn: "Your platform fee invoice remains unpaid past the standard settlement window.",
    whatHappenedUr: "آپ کا پلیٹ فارم فیس انوائس مقررہ وقت گزرنے کے بعد بھی واجب الادا ہے۔",
    actionGuidanceEn: "Please settle your outstanding platform fee invoice in Writer Studio promptly to maintain your publishing privileges.",
    actionGuidanceUr: "نئے ابواب کی اشاعت میں رکاوٹ سے بچنے کے لیے براہ کرم فوری طور پر رائٹر اسٹوڈیو سے واجبات ادا فرمائیں۔",
  },
  invoice_due_reminder: {
    badgeText: "Platform Fee Reminder",
    badgeUrdu: "پلیٹ فارم فیس کی یاد دہانی",
    ctaLabel: "View Platform Fee Invoice",
    ctaPath: "/writer/commission",
    whatHappenedEn: "Reminder regarding your pending platform fee invoice awaiting settlement.",
    whatHappenedUr: "آپ کے زیر التواء پلیٹ فارم فیس انوائس کی یاد دہانی۔",
    actionGuidanceEn: "Review your statement in Writer Studio and submit payment verification to keep your account current.",
    actionGuidanceUr: "رائٹر اسٹوڈیو میں اسٹیٹمنٹ چیک کریں اور ادائیگی کی تصدیق جمع کرا کر اکاؤنٹ کو فعال رکھیں۔",
  },

  // ---------------------------------------------------------------------------
  // 5. SUPPORT DESK (User & Admin)
  // ---------------------------------------------------------------------------
  support_ticket_created: {
    badgeText: "Support Request",
    badgeUrdu: "نئی سپورٹ درخواست",
    ctaLabel: "Open Admin Support",
    ctaPath: "/admin/support",
    whatHappenedEn: "A user submitted a new support inquiry on UNB Premium.",
    whatHappenedUr: "صارف کی جانب سے ایک نئی سپورٹ درخواست موصول ہوئی ہے۔",
    actionGuidanceEn: "Open Admin Support to inspect the user's issue, view account history, and respond.",
    actionGuidanceUr: "ایڈمن سپورٹ پورٹل میں جا کر صارف کا مسئلہ دیکھیں اور رہنمائی فراہم کریں۔",
  },
  support_reply: {
    badgeText: "Support Desk",
    badgeUrdu: "سپورٹ ڈیسک",
    ctaLabel: "View Support Ticket",
    ctaPath: "/support",
    whatHappenedEn: "UNB Premium Support has posted a response to your inquiry.",
    whatHappenedUr: "سپورٹ ٹیم نے آپ کی درخواست کا جواب دیا ہے۔",
    actionGuidanceEn: "Tap below to read the response. You can post additional replies directly in the support thread if needed.",
    actionGuidanceUr: "تفصیلات دیکھنے کے لیے نیچے دیا گیا لنک کھولیں۔ ضرورت پڑنے پر آپ اسی تھریڈ میں مزید جواب دے سکتے ہیں۔",
  },
  support_message_received: {
    badgeText: "User Reply",
    badgeUrdu: "صارف کا جواب",
    ctaLabel: "Open Admin Support",
    ctaPath: "/admin/support",
    whatHappenedEn: "A user replied to an existing support ticket thread.",
    whatHappenedUr: "صارف نے سپورٹ ٹکٹ میں نیا جواب درج کیا ہے۔",
    actionGuidanceEn: "Open Admin Support to read the latest message and continue assisting the user.",
    actionGuidanceUr: "ایڈمن پورٹل میں جا کر صارف کا نیا جواب دیکھیں اور مناسب کارروائی کریں۔",
  },

  // ---------------------------------------------------------------------------
  // 6. SAY THANKS (TIPS) (Reader & Writer)
  // ---------------------------------------------------------------------------
  tip_submitted: {
    badgeText: "Reader Appreciation",
    badgeUrdu: "قاری کی پذیرائی",
    ctaLabel: "View Received Tips",
    ctaPath: "/writer/tips",
    whatHappenedEn: "A reader submitted a 'Say Thanks' tip to appreciate your writing.",
    whatHappenedUr: "ایک قاری نے آپ کے کام کی پذیرائی کے لیے 'شکریہ کہیں' (ٹپ) بھیجی ہے۔",
    actionGuidanceEn: "Check your bank or wallet account for the incoming payment, then confirm receipt in Writer Studio to acknowledge the reader.",
    actionGuidanceUr: "اپنے اکاؤنٹ میں رقم چیک کریں اور قاری کا شکریہ ادا کرنے کے لیے رائٹر اسٹوڈیو میں ٹپ کی توثیق کریں۔",
  },
  tip_confirmed: {
    badgeText: "Tip Confirmed",
    badgeUrdu: "ٹپ تصدیق شدہ",
    ctaLabel: "View Your Tips",
    ctaPath: "/tips",
    whatHappenedEn: "The author has confirmed receipt of your 'Say Thanks' appreciation tip!",
    whatHappenedUr: "مصنف نے آپ کی بھیجی گئی پذیرائی (ٹپ) کی وصولی کی تصدیق کر دی ہے۔",
    actionGuidanceEn: "Visit your tips page to see your confirmed appreciation history and the author's thank-you note.",
    actionGuidanceUr: "مصنف کا شکریہ کا پیغام اور اپنی تصدیق شدہ ٹپس دیکھنے کے لیے اپنا ٹپس پیج دیکھیں۔",
  },
  tip_not_received: {
    badgeText: "Tip Verification",
    badgeUrdu: "ٹپ کی تصدیق",
    ctaLabel: "View Tip Details",
    ctaPath: "/tips",
    whatHappenedEn: "The author was unable to locate the deposit for this appreciation tip in their account.",
    whatHappenedUr: "مصنف اپنے اکاؤنٹ میں اس ٹپ کی رقم کی تصدیق نہیں کر سکے۔",
    actionGuidanceEn: "Please review the author's note on your tips page and double-check your transaction receipt or TID. Reach out to support if needed.",
    actionGuidanceUr: "براہ کرم اپنے ٹپس پیج پر مصنف کا نوٹ اور اپنی رسید کی تفصیلات چیک کریں۔ ضرورت پڑنے پر آپ سپورٹ سے رابطہ کر سکتے ہیں۔",
  },
  reminder_tip_confirmation: {
    badgeText: "Tip Confirmation",
    badgeUrdu: "ٹپ تصدیق کی یاد دہانی",
    ctaLabel: "Confirm Tip in Studio",
    ctaPath: "/writer/tips",
    whatHappenedEn: "A reader appreciation tip is awaiting your confirmation in Writer Studio.",
    whatHappenedUr: "قاری کی بھیجی گئی ٹپ کی رقم تصدیق کی منتظر ہے۔",
    actionGuidanceEn: "Please check your account for the deposit and confirm receipt in Writer Studio. Unverified tips expire after 7 days.",
    actionGuidanceUr: "اپنے اکاؤنٹ میں رقم چیک کر کے رائٹر اسٹوڈیو میں توثیق فرمائیں۔ غیر تصدیق شدہ ٹپس 7 دن بعد منسوخ ہو جاتی ہیں۔",
  },
  tip_reminder: {
    badgeText: "Tip Confirmation",
    badgeUrdu: "ٹپ تصدیق کی یاد دہانی",
    ctaLabel: "Confirm Tip in Studio",
    ctaPath: "/writer/tips",
    whatHappenedEn: "A reader appreciation tip is awaiting your confirmation in Writer Studio.",
    whatHappenedUr: "قاری کی بھیجی گئی ٹپ کی رقم تصدیق کی منتظر ہے۔",
    actionGuidanceEn: "Please check your account for the deposit and confirm receipt in Writer Studio. Unverified tips expire after 7 days.",
    actionGuidanceUr: "اپنے اکاؤنٹ میں رقم چیک کر کے رائٹر اسٹوڈیو میں توثیق فرمائیں۔ غیر تصدیق شدہ ٹپس 7 دن بعد منسوخ ہو جاتی ہیں۔",
  },
  reminder_tip_expiring_7d: {
    badgeText: "Tip Expiring (7d)",
    badgeUrdu: "ٹپ کی میعاد",
    ctaLabel: "Review Tips in Studio",
    ctaPath: "/writer/tips",
    whatHappenedEn: "A pending reader tip is approaching the 7-day expiration limit.",
    whatHappenedUr: "قاری کی بھیجی گئی ٹپ 7 دن کی منسوخی کی حد کے قریب پہنچ چکی ہے۔",
    actionGuidanceEn: "Please check your bank or wallet statement and confirm the tip in Writer Studio before it automatically expires at 7 days.",
    actionGuidanceUr: "خودکار منسوخی سے قبل برائے مہربانی اپنے اکاؤنٹ میں رقم کی تصدیق کر کے رائٹر اسٹوڈیو میں ٹپ کنفرم کریں۔",
  },

  // ---------------------------------------------------------------------------
  // 7. AUTOMATED VERIFICATION REMINDERS (12h, 24h)
  // ---------------------------------------------------------------------------
  reminder_order_verification: {
    badgeText: "Order Verification",
    badgeUrdu: "آرڈر تصدیق کی یاد دہانی",
    ctaLabel: "Verify Order in Studio",
    ctaPath: "/writer/orders",
    whatHappenedEn: "A reader submitted payment for an order and is waiting for chapter access.",
    whatHappenedUr: "قاری نے آرڈر کی رقم جمع کرا دی ہے اور ناول تک رسائی کا منتظر ہے۔",
    actionGuidanceEn: "Please check your bank or mobile wallet statement and verify the order in Writer Studio so the reader can access their chapters.",
    actionGuidanceUr: "اپنے اکاؤنٹ میں رقم کی تصدیق کر کے رائٹر اسٹوڈیو سے آرڈر کی فوری منظوری دیں تاکہ قاری کو ناول مل سکے۔",
  },
  verification_reminder: {
    badgeText: "Order Verification",
    badgeUrdu: "آرڈر تصدیق کی یاد دہانی",
    ctaLabel: "Verify Order in Studio",
    ctaPath: "/writer/orders",
    whatHappenedEn: "A reader submitted payment for an order and is waiting for chapter access.",
    whatHappenedUr: "قاری نے آرڈر کی رقم جمع کرا دی ہے اور ناول تک رسائی کا منتظر ہے۔",
    actionGuidanceEn: "Please check your bank or mobile wallet statement and verify the order in Writer Studio so the reader can access their chapters.",
    actionGuidanceUr: "اپنے اکاؤنٹ میں رقم کی تصدیق کر کے رائٹر اسٹوڈیو سے آرڈر کی فوری منظوری دیں تاکہ قاری کو ناول مل سکے۔",
  },
  reminder_verification_12h: {
    badgeText: "Order Verification (12h)",
    badgeUrdu: "آرڈر تصدیق (12 گھنٹے)",
    ctaLabel: "Verify Order in Studio",
    ctaPath: "/writer/orders",
    whatHappenedEn: "An order payment has been awaiting your verification for over 12 hours.",
    whatHappenedUr: "آرڈر کی ادائیگی 12 گھنٹے سے زائد وقت سے آپ کی تصدیق کی منتظر ہے۔",
    actionGuidanceEn: "Inspect your mobile wallet or bank deposit records and verify the order in Writer Studio to ensure prompt delivery for the reader.",
    actionGuidanceUr: "اپنے اکاؤنٹ میں رقم کی تصدیق کر کے رائٹر اسٹوڈیو میں آرڈر منظور کریں تاکہ قاری کو بروقت رسائی مل سکے۔",
  },
  reminder_verification_24h: {
    badgeText: "Urgent Order Verification",
    badgeUrdu: "فوری آرڈر تصدیق",
    ctaLabel: "Verify Order in Studio",
    ctaPath: "/writer/orders",
    whatHappenedEn: "An order payment has been awaiting verification for over 24 hours.",
    whatHappenedUr: "آرڈر کی ادائیگی 24 گھنٹے سے زائد عرصے سے تصدیق کی منتظر ہے۔",
    actionGuidanceEn: "Please verify this order urgently. Under platform policies, readers become eligible to open a formal dispute once 24 hours have elapsed without verification.",
    actionGuidanceUr: "برائے مہربانی فوری طور پر تصدیق فرمائیں۔ قواعد کے مطابق 24 گھنٹے بعد قاری رسمی تنازعہ درج کرانے کا مجاز ہو جاتا ہے۔",
  },
};

const DEFAULT_METADATA: TemplateMetadata = {
  badgeText: "Notification",
  badgeUrdu: "اطلاع",
  ctaLabel: "Open UNB Premium",
  ctaPath: "/",
  whatHappenedEn: "You have a new operational notification regarding your UNB Premium account.",
  whatHappenedUr: "آپ کے اردو ناول بینک پریمیئم اکاؤنٹ کے لیے ایک نئی اطلاع موصول ہوئی ہے۔",
  actionGuidanceEn: "Log in to your UNB Premium account to review details and take any necessary action.",
  actionGuidanceUr: "تفصیلات دیکھنے اور ضروری کارروائی کے لیے اپنے اکاؤنٹ میں لاگ ان کریں۔",
};

/**
 * Strips any sensitive tokens (e.g. IBANs, long bank account digits, TIDs, or signed URLs)
 * if they accidentally appear in dynamic strings.
 */
export function sanitizeEmailContent(content: string): string {
  if (!content) return "";

  let sanitized = content;

  // Mask IBANs (e.g., PK36SCBL0000001123456701)
  sanitized = sanitized.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, "[REDACTED_ACCOUNT]");

  // Mask long digit runs (potential bank account numbers or raw TIDs >= 9 digits)
  sanitized = sanitized.replace(/\b\d{9,24}\b/g, "[REDACTED_NUMERIC_ID]");

  // Strip signed or absolute storage URLs pointing to proofs
  sanitized = sanitized.replace(/https?:\/\/[^\s]+payment-proofs[^\s]*/gi, "[SECURE_PORTAL_PROOF_LINK]");
  sanitized = sanitized.replace(/https?:\/\/[^\s]+supabase[^\s]*\/storage[^\s]*/gi, "[SECURE_PORTAL_LINK]");

  return sanitized;
}

/**
 * Returns the public application base URL from environment or production default.
 */
export function getAppBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  return "https://premium.urdunovelbanks.com";
}

/**
 * Renders an optional styled callout box for reasons, moderator feedback, or notes.
 */
export function renderCalloutBox(content: string, isUrdu = false): string {
  const textDir = isUrdu ? "rtl" : "ltr";
  const textAlign = isUrdu ? "right" : "left";
  const fontStack = isUrdu
    ? "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif"
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const lineHeight = isUrdu ? "2.05" : "1.6";
  const borderSide = isUrdu ? "border-right: 3px solid #D39A2A;" : "border-left: 3px solid #D39A2A;";

  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FAF6EE; border: 1px solid #E6DFD0; ${borderSide} border-radius: 6px; margin: 18px 0;">
    <tr>
      <td style="padding: 14px 18px; direction: ${textDir}; text-align: ${textAlign}; font-family: ${fontStack}; font-size: 15px; line-height: ${lineHeight}; color: #22262B;">
        ${escapeHtml(content)}
      </td>
    </tr>
  </table>`;
}

/**
 * Detects whether a paragraph is an operational note/reason/feedback.
 */
function isCalloutParagraph(line: string): boolean {
  return /^(reason|note|feedback|admin note|moderator note|moderation note|author note|وجہ|وضاحت|تبصرہ|نوٹ)\s*[:：]/i.test(line);
}

/**
 * Renders branded plain-text and luxury HTML emails with English & Urdu styling.
 * Matches the canonical UNB Premium reference design across all registered application templates.
 */
export function renderEmailTemplate(input: EmailRenderInput): RenderedEmail {
  const baseUrl = getAppBaseUrl();
  const preferencesUrl = `${baseUrl}/account/notifications`;
  const displayHost = baseUrl.replace(/^https?:\/\//, "");
  const sanitizedSubject = sanitizeEmailContent(input.subject);
  const sanitizedBody = sanitizeEmailContent(input.bodyText);

  const meta = TEMPLATE_REGISTRY[input.template] || DEFAULT_METADATA;
  const ctaUrl = input.ctaUrl || `${baseUrl}${meta.ctaPath}`;
  const ctaLabel = input.ctaLabel || `${meta.ctaLabel} | ${meta.badgeUrdu}`;

  // Plain-text representation
  const text = `UNB Premium | Urdu Novel Bank Premium | اردو ناول بینک
--------------------------------------------------
[${meta.badgeText} / ${meta.badgeUrdu}]
${sanitizedSubject}
--------------------------------------------------

${sanitizedBody}

Next Step:
${meta.actionGuidanceEn}

اگلا قدم:
${meta.actionGuidanceUr}

--------------------------------------------------
Action Link:
${ctaUrl}

Notification Preferences:
${preferencesUrl}

UNB Premium — Urdu Novel Bank Premium — ${displayHost}
This is an automated operational notification.
`;

  // Process body text into bilingual paragraphs
  const rawParagraphs = sanitizedBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const urduLines: string[] = [];
  const englishLines: string[] = [];

  for (const p of rawParagraphs) {
    if (/[\u0600-\u06FF]/.test(p)) {
      urduLines.push(p);
    } else {
      englishLines.push(p);
    }
  }

  // Preheader: First sentence of content plus padding entities
  const previewSnippet = (englishLines[0] || urduLines[0] || meta.whatHappenedEn || sanitizedSubject).slice(0, 120);

  // English block HTML
  const englishSource = englishLines.length > 0 ? englishLines : [meta.whatHappenedEn || sanitizedSubject];
  const englishHtml = englishSource
    .map((p) => {
      if (isCalloutParagraph(p)) {
        return renderCalloutBox(p, false);
      }
      return `<p style="margin: 0 0 14px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 25px; color: #22262B;">${escapeHtml(p)}</p>`;
    })
    .join("");

  // Urdu block HTML (with high line-height 2.05 to prevent ascenders/descenders clipping)
  const urduSource = urduLines.length > 0 ? urduLines : [meta.whatHappenedUr || "برائے مہربانی اپنے اکاؤنٹ میں لاگ ان ہو کر تفصیلات ملاحظہ فرمائیں۔"];
  const urduHtml = urduSource
    .map((p) => {
      if (isCalloutParagraph(p)) {
        return renderCalloutBox(p, true);
      }
      return `<p style="margin: 0 0 14px 0; font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif; font-size: 16px; line-height: 2.05; color: #22262B;">${escapeHtml(p)}</p>`;
    })
    .join("");

  // Luxury Branded HTML representation (Editorial Sand & Warm Brown)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(sanitizedSubject)}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .unb-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .unb-card-cell {
        padding: 24px 18px !important;
      }
      .unb-btn {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
        text-align: center !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F1ECDF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #22262B; -webkit-font-smoothing: antialiased; line-height: 1.6;">
  
  <!-- Hidden Preheader with Zero-Width Padding -->
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: #F1ECDF; font-size: 1px; line-height: 1px; mso-hide: all;">
    UNB PREMIUM &mdash; ${escapeHtml(previewSnippet)}
    &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #F1ECDF; padding: 36px 16px;">
    <tr>
      <td align="center">
        
        <!-- Main Card Container (560px max width) -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="unb-container" style="max-width: 560px; background-color: #FFFFFF; border: 1px solid #E6DFD0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);">
          
          <!-- Typography Brand Header (Centered, Zero Images) -->
          <tr>
            <td align="center" style="padding: 36px 32px 24px 32px; background-color: #FFFFFF; text-align: center;">
              <a href="${escapeHtml(baseUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
                <span style="display: block; font-family: Georgia, 'Palatino Linotype', 'Book Antiqua', serif; font-size: 32px; line-height: 38px; font-weight: bold; font-style: italic; color: #813B09; margin: 0 0 14px 0;">Urdu Novel Bank</span>
              </a>
              <!-- Centered Badge Pill -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin: 0 auto;">
                <tr>
                  <td align="center" bgcolor="#5F2F16" style="background-color: #5F2F16; border: 1px solid #D39A2A; border-radius: 4px; padding: 6px 20px 6px 24px; text-align: center;">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; font-weight: bold; letter-spacing: 4px; color: #F1ECDF; text-transform: uppercase; white-space: nowrap;">
                      <span style="color: #D39A2A; font-weight: bold;">&ndash;</span>&nbsp;PREMIUM&nbsp;<span style="color: #D39A2A; font-weight: bold;">&ndash;</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Horizontal Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background-color: #E6DFD0; line-height: 1px; font-size: 1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Main Email Content Area -->
          <tr>
            <td class="unb-card-cell" style="padding: 32px 32px 28px 32px; background-color: #FFFFFF;">
              
              <!-- English Block -->
              <div style="margin-bottom: 24px;">
                <!-- Category / Status Pill Badge -->
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 18px;">
                  <tr>
                    <td style="background-color: #FAF6EE; border: 1px solid #E6DFD0; border-radius: 9999px; padding: 4px 14px; font-size: 12px; font-weight: 700; color: #813B09; letter-spacing: 0.5px; text-transform: uppercase;">
                      ${escapeHtml(meta.badgeText)} <span style="color: #D39A2A; margin: 0 6px;">•</span> ${escapeHtml(meta.badgeUrdu)}
                    </td>
                  </tr>
                </table>

                <!-- Main Subject Heading -->
                <h1 style="margin: 0 0 18px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 24px; line-height: 32px; font-weight: bold; color: #22262B;">
                  ${escapeHtml(sanitizedSubject)}
                </h1>

                <!-- English Message Paragraphs & Notes -->
                <div style="font-size: 16px; line-height: 25px; color: #22262B;">
                  ${englishHtml}
                </div>

                <!-- English "What Happens Next" Guidance Card -->
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FAF6EE; border: 1px solid #E6DFD0; border-left: 3px solid #813B09; border-radius: 6px; margin: 20px 0;">
                  <tr>
                    <td style="padding: 14px 18px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: #22262B;">
                      <span style="display: block; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #813B09; margin-bottom: 6px;">
                        What Happens Next
                      </span>
                      ${escapeHtml(meta.actionGuidanceEn)}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Thin Section Divider -->
              <div style="height: 1px; background-color: #E6DFD0; margin: 24px 0; line-height: 1px; font-size: 1px;">&nbsp;</div>

              <!-- Urdu Block (RTL, Nastaliq typography, ample line-height) -->
              <div lang="ur" dir="rtl" align="right" style="direction: rtl; text-align: right; margin-bottom: 28px;">
                <h2 style="margin: 0 0 14px 0; font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif; font-size: 21px; line-height: 2.1; font-weight: bold; color: #22262B;">
                  ${escapeHtml(meta.badgeUrdu)}
                </h2>
                <div style="font-size: 16px; line-height: 2.05; color: #22262B;">
                  ${urduHtml}
                </div>

                <!-- Urdu "اگلا قدم" Guidance Card -->
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FAF6EE; border: 1px solid #E6DFD0; border-right: 3px solid #813B09; border-radius: 6px; margin: 20px 0; direction: rtl;">
                  <tr>
                    <td style="padding: 14px 18px; direction: rtl; text-align: right; font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif; font-size: 15px; line-height: 2.1; color: #22262B;">
                      <span style="display: block; font-size: 13px; font-weight: 700; color: #813B09; margin-bottom: 6px;">
                        اگلا قدم
                      </span>
                      ${escapeHtml(meta.actionGuidanceUr)}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- ONE Primary Table-Cell Button (Outlook-safe without VML) -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin: 32px auto 24px auto;">
                <tr>
                  <td align="center" bgcolor="#813B09" style="background-color: #813B09; border-radius: 8px;">
                    <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" class="unb-btn" style="display: inline-block; padding: 15px 30px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: bold; color: #FFFFFF !important; text-decoration: none; border-radius: 8px; text-align: center;">
                      ${escapeHtml(ctaLabel)} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Plain Fallback Link Block -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FAF6EE; border: 1px solid #E6DFD0; border-radius: 6px; margin: 20px 0;">
                <tr>
                  <td style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 19px; color: #5B6470;">
                    <p style="margin: 0 0 6px 0;">Button not working? Copy and paste this link into your browser:</p>
                    <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="color: #8E6410; word-break: break-all; text-decoration: underline; font-weight: 600;">${escapeHtml(ctaUrl)}</a>
                  </td>
                </tr>
              </table>

              <!-- Muted Fine Print (EN + UR) -->
              <div style="font-size: 13px; line-height: 20px; color: #5B6470; margin-top: 24px; padding-top: 18px; border-top: 1px solid #E6DFD0;">
                <p style="margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                  <strong style="color: #22262B;">Security Invariant:</strong> UNB Premium never asks for passwords, nor transmits unencrypted banking details or transaction references via email.
                </p>
                <p style="margin: 0; direction: rtl; text-align: right; font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif; line-height: 2.05;">
                  <strong style="color: #22262B;">حفاظتی اصول:</strong> اردو ناول بینک کبھی بھی ای میل پر پاس ورڈ یا نجی بینکنگ معلومات طلب نہیں کرتا۔
                </p>
              </div>

            </td>
          </tr>

        </table>

        <!-- Footer Outside Card on #F1ECDF Canvas -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 560px; margin-top: 24px;">
          <tr>
            <td align="center" style="text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #5B6470;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #22262B;">
                UNB Premium &mdash; Urdu Novel Bank &mdash; اردو ناول بینک
              </p>
              <p style="margin: 0 0 6px 0;">
                <a href="${escapeHtml(baseUrl)}" target="_blank" rel="noopener noreferrer" style="color: #8E6410; text-decoration: underline; font-weight: 600;">
                  ${escapeHtml(displayHost)}
                </a>
                <span style="color: #E6DFD0; margin: 0 6px;">|</span>
                <a href="${escapeHtml(preferencesUrl)}" target="_blank" rel="noopener noreferrer" style="color: #8E6410; text-decoration: underline;">
                  Notification Settings
                </a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #5B6470;">
                This is an automated operational notification regarding your UNB Premium account.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: sanitizedSubject,
    text,
    html,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
