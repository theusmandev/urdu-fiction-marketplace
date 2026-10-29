/**
 * UNB Premium — Centralized Platform Configuration
 * 
 * Strict configuration holding branding tokens, business rules,
 * currency settings, commission policies, and portal navigation links.
 * 
 * Change brandName, logos, and commission limits in this file to update the entire platform.
 */

export interface NavItem {
  title: string;
  titleUrdu?: string;
  href: string;
  description?: string;
  icon?: string;
  badge?: string;
}

export interface PaymentMethodMeta {
  id: "jazzcash" | "easypaisa" | "bank" | "raast" | "nayapay" | "sadapay";
  name: string;
  nameUrdu: string;
  type: "mobile_wallet" | "direct_bank" | "instant_payment";
  color: string;
  badgeText: string;
}

export interface GenreMeta {
  id: string;
  slug: string;
  nameEn: string;
  nameUrdu: string;
  description: string;
}

export interface SiteConfig {
  brandName: string;
  brandNameUrdu: string;
  brandSuffix: string;
  brandPrefix?: string;
  tagline: string;
  taglineUrdu: string;
  description: string;
  url: string;
  ogImage: string;
  defaultCurrency: "PKR";
  currencySymbol: string;
  currencySymbolUrdu: string;
  defaultCommissionPercentage: number;
  defaultUnpaidCommissionThreshold: number;
  contactEmail: string;
  supportPhone: string;
  
  navigation: {
    public: NavItem[];
    reader: NavItem[];
    writer: NavItem[];
    admin: NavItem[];
    footer: {
      about: NavItem[];
      writers: NavItem[];
      readers: NavItem[];
      legal: NavItem[];
    };
  };

  supportedPaymentMethods: PaymentMethodMeta[];
  featuredGenres: GenreMeta[];
}

export const siteConfig: SiteConfig = {
  brandName: "UNB Premium",
  brandNameUrdu: "یو این بی پریمیم",
  brandSuffix: "Premium",
  brandPrefix: "Urdu Novel Bank",
  tagline: "Independent Marketplace for Premium Digital Urdu Fiction",
  taglineUrdu: "معیاری اردو فکشن اور ناولز کی خود مختار ڈیجیٹل مارکیٹ پلیس",
  description: 
    "A direct-to-writer digital marketplace for Urdu fiction lovers. Readers pay Pakistani authors directly via JazzCash, EasyPaisa, or Bank Transfer. Instant chapter delivery upon writer verification.",
  url: "https://unbpremium.pk",
  ogImage: "/og-image.jpg",
  
  // Financial & Commission Architecture
  // NOTE: Database 'platform_settings' (id = 1) is the authoritative single source of truth
  // for all transaction rates and commission pause thresholds. The values below are client-side
  // display defaults / fallbacks only.
  defaultCurrency: "PKR",
  currencySymbol: "Rs.",
  currencySymbolUrdu: "روپے",
  defaultCommissionPercentage: 20, // Display fallback only; DB platform_settings is authoritative
  defaultUnpaidCommissionThreshold: 5000, // Display fallback only; DB platform_settings is authoritative

  contactEmail: "support@unbpremium.pk",
  supportPhone: "+92 300 0000000",

  navigation: {
    public: [
      { title: "Browse Novels", titleUrdu: "ناولز تلاش کریں", href: "/novels" },
      { title: "Genres", titleUrdu: "اصنافِ ادب", href: "/genres" },
      { title: "Featured Authors", titleUrdu: "نمایاں مصنّفین", href: "/writers" },
      { title: "How Direct Payment Works", titleUrdu: "براہ راست ادائیگی کا طریقہ", href: "/how-to-pay" },
      { title: "Sell Your Novels", titleUrdu: "اپنا ناول فروخت کریں", href: "/become-a-writer" },
    ],
    reader: [
      { title: "My Library", titleUrdu: "میری لائبریری", href: "/library" },
      { title: "Order History & TIDs", titleUrdu: "آرڈرز اور رسیدیں", href: "/orders" },
      { title: "Account Settings", titleUrdu: "اکاؤنٹ ترتیبات", href: "/account" },
    ],
    writer: [
      { title: "Writer Portal", titleUrdu: "رائٹر ڈیش بورڈ", href: "/writer" },
      { title: "Verify Reader Payments", titleUrdu: "ادائیگیوں کی تصدیق", href: "/writer/orders", badge: "Live" },
      { title: "My Novels & Chapters", titleUrdu: "ناولز اور ابواب", href: "/writer/novels" },
      { title: "Direct Bank & Wallets", titleUrdu: "بینک اور والٹ تفصیلات", href: "/writer/payment-methods" },
      { title: "Platform Fee Ledger", titleUrdu: "پلیٹ فارم فیس لیجر", href: "/writer/commission" },
    ],
    admin: [
      { title: "Platform Dashboard", href: "/admin" },
      { title: "Novels Moderation", href: "/admin/novels" },
      { title: "Writers Management", href: "/admin/writers" },
      { title: "Platform Fee Remittance", href: "/admin/commission" },
      { title: "Audit Ledger", href: "/admin/audit" },
    ],
    footer: {
      about: [
        { title: "About UNB Premium", href: "/about" },
        { title: "How Direct Payment Works", href: "/how-to-pay" },
        { title: "Platform Architecture", href: "/how-it-works" },
        { title: "Contact Support", href: "/contact" },
      ],
      writers: [
        { title: "Sell Your Novels", href: "/become-a-writer" },
        { title: "Writer Guidelines & Integrity", href: "/content-policy" },
        { title: "Platform Fee & Payout Policy", href: "/writer/agreement" },
        { title: "Writer Studio", href: "/writer" },
      ],
      readers: [
        { title: "Explore All Urdu Novels", href: "/novels" },
        { title: "How to Submit Transaction TID", href: "/how-to-pay" },
        { title: "How Direct Payment Works", href: "/how-it-works" },
        { title: "Reader FAQ & Support", href: "/faq" },
        { title: "Reader Library Access", href: "/library" },
      ],
      legal: [
        { title: "Refund & Dispute Policy", href: "/refund-policy" },
        { title: "Terms of Service", href: "/terms" },
        { title: "Privacy Policy", href: "/privacy" },
        { title: "Content & Copyright Policy", href: "/content-policy" },
      ],
    },
  },

  supportedPaymentMethods: [
    {
      id: "jazzcash",
      name: "JazzCash",
      nameUrdu: "جاز کیش",
      type: "mobile_wallet",
      color: "#EE2737",
      badgeText: "Instant Wallet",
    },
    {
      id: "easypaisa",
      name: "EasyPaisa",
      nameUrdu: "ایزی پیسہ",
      type: "mobile_wallet",
      color: "#00A859",
      badgeText: "Instant Wallet",
    },
    {
      id: "raast",
      name: "Raast (State Bank of Pakistan)",
      nameUrdu: "راست آئی ڈی",
      type: "instant_payment",
      color: "#1E3A8A",
      badgeText: "Zero Fee SBP",
    },
    {
      id: "bank",
      name: "Direct Bank Transfer",
      nameUrdu: "براہ راست بینک ٹرانسفر",
      type: "direct_bank",
      color: "#17243A",
      badgeText: "All PK Banks (IBAN)",
    },
    {
      id: "nayapay",
      name: "NayaPay",
      nameUrdu: "نیا پے",
      type: "mobile_wallet",
      color: "#FF6600",
      badgeText: "Digital Wallet",
    },
    {
      id: "sadapay",
      name: "SadaPay",
      nameUrdu: "سادہ پے",
      type: "mobile_wallet",
      color: "#00B4D8",
      badgeText: "Digital Wallet",
    },
  ],

  featuredGenres: [
    {
      id: "social-romantic",
      slug: "social-romantic",
      nameEn: "Social & Romantic",
      nameUrdu: "معاشرتی و رومانی",
      description: "Compelling family sagas, societal dilemmas, and deep romantic fiction reflecting Pakistani culture.",
    },
    {
      id: "mystery-thriller",
      slug: "mystery-thriller",
      nameEn: "Mystery & Crime Thriller",
      nameUrdu: "پراسرار و سسپنس تھرلر",
      description: "Gripping detective investigations, psychological tension, and suspenseful plot twists.",
    },
    {
      id: "historical-epic",
      slug: "historical-epic",
      nameEn: "Historical & Classical",
      nameUrdu: "تاریخی و کلاسیکی",
      description: "Grand historical epics, Islamic heritage tales, and classical literary fiction.",
    },
    {
      id: "horror-supernatural",
      slug: "horror-supernatural",
      nameEn: "Horror & Supernatural",
      nameUrdu: "خوفناک و ماورائی",
      description: "Chilling supernatural lore, haunted mysteries, and folk horror narratives.",
    },
    {
      id: "action-adventure",
      slug: "action-adventure",
      nameEn: "Action & Espionage",
      nameUrdu: "جاسوسی و مہم جوئی",
      description: "High-stakes spy operations, covert intelligence, and pulse-pounding adventures.",
    },
    {
      id: "philosophical-literary",
      slug: "philosophical-literary",
      nameEn: "Literary & Philosophical",
      nameUrdu: "ادبی و فلسفیانہ",
      description: "Thought-provoking modern Urdu prose exploring existential themes and human psychology.",
    },
  ],
};
