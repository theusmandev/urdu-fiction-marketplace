/**
 * UNB Premium — PostgreSQL Database Schema Types
 * 
 * Strict TypeScript interfaces mirroring every Supabase table, enum,
 * and RPC function. Generated to provide 100% type safety for Supabase client calls.
 * 
 * Synchronized with Migrations 0001 through 0006 (Security & Financial Hardening Patch).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ----------------------------------------------------------------------
// 1. DATABASE ENUMS
// ----------------------------------------------------------------------

export type UserRole = "reader" | "writer" | "admin";

export type WriterStatus =
  | "pending_approval"
  | "approved"
  | "suspended"
  | "rejected";

export type PaymentMethodType =
  | "jazzcash"
  | "easypaisa"
  | "raast"
  | "bank_iban";

export type NovelStatus =
  | "draft"
  | "under_review"
  | "published"
  | "rejected"
  | "suspended";

export type OrderStatus =
  | "pending_payment"
  | "payment_submitted"
  | "verified"
  | "rejected"
  | "disputed"
  | "cancelled"
  | "refunded_adjusted";

export type CommissionInvoiceStatus =
  | "open"
  | "invoiced"
  | "payment_reported"
  | "settled"
  | "disputed";

export type DisputeStatus =
  | "open"
  | "under_review"
  | "resolved_for_reader"
  | "resolved_for_writer"
  | "closed";

export type LedgerEntryType =
  | "sale_verified"
  | "refund_adjustment"
  | "manual_correction";

// ----------------------------------------------------------------------
// 2. TABLE ROW TYPES
// ----------------------------------------------------------------------

export interface PlatformSettingsRow {
  id: number;
  default_commission_rate: number;
  default_unpaid_commission_limit: number;
  dispute_window_days: number;
  min_novel_price_pkr: number;
  max_novel_price_pkr?: number;
  max_orders_per_hour: number;
  max_chapter_reads_per_window: number;
  chapter_read_window_minutes: number;
  support_email: string;
  updated_at: string;
}

export interface ChapterReadsRow {
  id: string;
  reader_id: string;
  chapter_id: string;
  novel_id: string;
  read_at: string;
}

export interface ChapterReaderPayload {
  novel_id: string;
  novel_title: string;
  novel_title_urdu: string;
  novel_title_english: string;
  novel_slug: string;
  total_chapters: number;
  chapter_number: number;
  chapter_title: string;
  chapter_title_english: string | null;
  content_urdu: string;
  word_count: number;
  previous_chapter_number: number | null;
  next_chapter_number: number | null;
  access_reason: 'free_preview' | 'entitled' | 'owner' | 'admin';
  watermark_code: string | null;
  reader_progress: number | null;
}

export interface LibraryItem {
  novel_id: string;
  novel_slug: string;
  title_urdu: string;
  title_english: string;
  cover_url: string | null;
  writer_pen_name: string;
  writer_pen_name_urdu: string | null;
  writer_pen_name_english: string | null;
  writer_username: string | null;
  total_chapters: number;
  last_chapter_number: number | null;
  order_number: string | null;
  granted_at: string;
  is_temporarily_unavailable: boolean;
}

export interface AdminOrderItemSummary {
  id: string;
  order_number: string;
  status: OrderStatus;
  amount_pkr: number;
  currency: string;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
  is_stuck: boolean;
  reader_id: string;
  reader_display_name: string;
  reader_username: string | null;
  writer_id: string;
  writer_pen_name: string;
  novel_id: string;
  novel_title: string;
  novel_slug: string;
  payment_method_type: string;
  has_duplicate_submission: boolean;
}

export interface AdminOrdersListResponse {
  orders: AdminOrderItemSummary[];
  total_count: number;
  limit: number;
  offset: number;
}

export interface AdminOrderDetailResponse {
  order: {
    id: string;
    order_number: string;
    status: OrderStatus;
    amount_pkr: number;
    currency: string;
    applied_commission_rate: number | null;
    calculated_commission_pkr: number | null;
    calculated_writer_share_pkr: number | null;
    payment_instructions_snapshot: Json;
    novel_title_snapshot: string;
    created_at: string;
    updated_at: string;
    verified_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    is_stuck: boolean;
  };
  reader: {
    id: string;
    display_name: string;
    username: string | null;
  };
  writer: {
    id: string;
    pen_name: string;
    pen_name_english: string | null;
    pen_name_urdu: string | null;
  };
  novel: {
    id: string;
    slug: string;
    title_english: string;
    title_urdu: string;
    cover_url: string | null;
    status: NovelStatus;
  };
  submissions: Array<{
    id: string;
    transaction_reference_tid: string;
    paid_amount_claimed_pkr: number;
    sender_account_name: string | null;
    reader_note: string | null;
    screenshot_path: string;
    is_duplicate_tid: boolean;
    reviewer_status: string;
    reviewer_note: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>;
  disputes: Array<{
    id: string;
    reason: string;
    status: DisputeStatus;
    resolution_note: string | null;
    admin_resolution_notes: string | null;
    created_at: string;
    resolved_at: string | null;
  }>;
  ledger: Array<{
    id: string;
    entry_type: LedgerEntryType;
    gross_amount_pkr: number;
    platform_commission_pkr: number;
    writer_payout_pkr: number;
    is_reconciled: boolean;
    created_at: string;
  }>;
  entitlement: {
    id: string;
    granted_at: string;
    is_revoked: boolean;
    revoked_at: string | null;
    revoked_reason: string | null;
  } | null;
}

export interface CheckoutNovelSummary {
  id: string;
  title_english: string;
  title_urdu: string;
  slug: string;
  price_pkr: number;
  cover_image_url: string | null;
  writer_id: string;
  writer_pen_name: string;
}

export interface CheckoutPaymentMethod {
  id: string;
  method_type: PaymentMethodType;
  bank_name: string | null;
  account_title: string;
  masked_account: string;
  instructions_note: string | null;
}

export interface CheckoutOptionsResponse {
  novel: CheckoutNovelSummary;
  payment_methods: CheckoutPaymentMethod[];
  existing_order_number: string | null;
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WriterProfileRow {
  id: string;
  pen_name_urdu: string;
  pen_name_english: string;
  bio_urdu: string | null;
  bio_english: string | null;
  status: WriterStatus;
  custom_commission_rate: number | null;
  unpaid_commission_limit: number;
  current_unpaid_commission: number;
  is_orders_paused_for_commission: boolean;
  agreement_accepted_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WriterPaymentMethodRow {
  id: string;
  writer_id: string;
  method_type: PaymentMethodType;
  account_title: string;
  account_number_or_iban: string;
  bank_name: string | null;
  instructions_note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface GenreRow {
  id: string;
  slug: string;
  name_english: string;
  name_urdu: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface NovelGenreRow {
  novel_id: string;
  genre_id: string;
}

export interface NovelRow {
  id: string;
  writer_id: string;
  slug: string;
  title_urdu: string;
  title_english: string;
  synopsis_urdu: string;
  description_urdu: string | null;
  cover_url: string | null;
  cover_public_id: string | null;
  price_pkr: number;
  language: string;
  status: NovelStatus;
  moderation_reason: string | null;
  total_chapters: number;
  is_featured: boolean;
  rights_declaration_accepted: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterRow {
  id: string;
  novel_id: string;
  chapter_number: number;
  title_urdu: string;
  content_urdu: string;
  is_free_preview: boolean;
  word_count: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChapterRevisionRow {
  id: string;
  chapter_id: string;
  content_urdu: string;
  edited_by: string | null;
  created_at: string;
}

export interface ReaderProgressRow {
  reader_id: string;
  novel_id: string;
  last_chapter_number: number;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  order_number: string;
  reader_id: string;
  writer_id: string;
  novel_id: string;
  novel_title_snapshot: string;
  amount_pkr: number;
  currency: string;
  applied_commission_rate: number;
  calculated_commission_pkr: number;
  calculated_writer_share_pkr: number;
  selected_payment_method_id: string | null;
  payment_instructions_snapshot: Json | null;
  status: OrderStatus;
  verified_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentSubmissionRow {
  id: string;
  order_id: string;
  reader_id: string;
  writer_id: string;
  transaction_reference_tid: string;
  normalized_tid: string;
  screenshot_url: string;
  screenshot_path: string | null;
  screenshot_public_id: string | null;
  paid_amount_claimed_pkr: number | null;
  sender_account_name: string | null;
  reader_note: string | null;
  is_duplicate_tid_flagged: boolean;
  duplicate_of_submission_id: string | null;
  reviewer_status: "pending" | "verified" | "rejected";
  reviewer_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface PurchaseEntitlementRow {
  id: string;
  reader_id: string;
  novel_id: string;
  order_id: string;
  granted_at: string;
  is_revoked: boolean;
  revoked_reason: string | null;
}

export interface SalesLedgerRow {
  id: string;
  order_id: string;
  writer_id: string;
  reader_id: string;
  novel_id: string;
  entry_type: LedgerEntryType;
  gross_amount_pkr: number;
  commission_rate: number;
  platform_commission_pkr: number;
  writer_net_pkr: number;
  original_ledger_entry_id: string | null;
  commission_invoice_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface CommissionInvoiceRow {
  id: string;
  invoice_number: string;
  writer_id: string;
  period_start: string;
  period_end: string;
  total_sales_count: number;
  total_gross_pkr: number;
  total_commission_owed_pkr: number;
  amount_settled_pkr: number;
  status: CommissionInvoiceStatus;
  writer_reported_tid: string | null;
  writer_reported_screenshot_url: string | null;
  settled_by_admin_id: string | null;
  settled_at: string | null;
  created_at: string;
}

export interface CommissionPaymentRow {
  id: string;
  invoice_id: string;
  writer_id: string;
  amount_pkr: number;
  transaction_reference: string;
  screenshot_url: string | null;
  confirmed_by_admin_id: string | null;
  confirmed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface DisputeRow {
  id: string;
  order_id: string;
  raised_by_id: string;
  opened_by: string | null;
  reason: string;
  status: DisputeStatus;
  resolution_note: string | null;
  admin_resolution_notes: string | null;
  resolved_by: string | null;
  resolved_by_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  body: string | null;
  link: string | null;
  entity_refs: Json | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string;
  previous_state: Json | null;
  new_state: Json | null;
  created_at: string;
}

export interface PublicGenreItem {
  id: string;
  slug: string;
  name_urdu: string;
  name_english: string;
  display_order: number;
}

export interface PublicNovel {
  id: string;
  slug: string;
  title_urdu: string;
  title_english: string;
  synopsis_urdu: string;
  description_urdu: string | null;
  cover_url: string | null;
  price_pkr: number;
  currency: string;
  language: string;
  total_chapters: number;
  is_featured: boolean;
  published_at: string;
  writer_id: string;
  writer_username: string | null;
  writer_pen_name_urdu: string;
  writer_pen_name_english: string;
  writer_avatar_url: string | null;
  genres: PublicGenreItem[];
}

export interface PublicWriter {
  id: string;
  username: string | null;
  pen_name_urdu: string;
  pen_name_english: string;
  bio_urdu: string | null;
  bio_english: string | null;
  avatar_url: string | null;
  published_novels_count: number;
}

export interface PublicGenre {
  id: string;
  slug: string;
  name_english: string;
  name_urdu: string;
  display_order: number;
  published_novels_count: number;
}

export interface PublicFreePreviewChapter {
  id: string;
  novel_id: string;
  novel_slug: string;
  chapter_number: number;
  title_urdu: string;
  content_urdu: string;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface PublicNovelChapterMeta {
  id: string;
  chapter_number: number;
  title_urdu: string;
  word_count: number;
  is_free_preview: boolean;
}

export interface PublicNovelSearchResult extends PublicNovel {
  total_count: number;
}

// ----------------------------------------------------------------------
// 3. COMPLETE SUPABASE DATABASE TYPE DEFINITION
// ----------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      platform_settings: {
        Row: PlatformSettingsRow;
        Insert: Partial<PlatformSettingsRow> & { id?: number };
        Update: Partial<PlatformSettingsRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      writer_profiles: {
        Row: WriterProfileRow;
        Insert: {
          id: string;
          pen_name_urdu: string;
          pen_name_english: string;
          bio_urdu?: string | null;
          bio_english?: string | null;
          status?: WriterStatus;
          custom_commission_rate?: number | null;
          unpaid_commission_limit?: number;
          current_unpaid_commission?: number;
          is_orders_paused_for_commission?: boolean;
          agreement_accepted_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<WriterProfileRow>;
        Relationships: [];
      };
      writer_payment_methods: {
        Row: WriterPaymentMethodRow;
        Insert: {
          id?: string;
          writer_id: string;
          method_type: PaymentMethodType;
          account_title: string;
          account_number_or_iban: string;
          bank_name?: string | null;
          instructions_note?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<WriterPaymentMethodRow>;
        Relationships: [];
      };
      genres: {
        Row: GenreRow;
        Insert: {
          id?: string;
          slug: string;
          name_english: string;
          name_urdu: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<GenreRow>;
        Relationships: [];
      };
      novel_genres: {
        Row: NovelGenreRow;
        Insert: NovelGenreRow;
        Update: Partial<NovelGenreRow>;
        Relationships: [];
      };
      novels: {
        Row: NovelRow;
        Insert: {
          id?: string;
          writer_id: string;
          slug: string;
          title_urdu: string;
          title_english: string;
          synopsis_urdu: string;
          description_urdu?: string | null;
          cover_url?: string | null;
          cover_public_id?: string | null;
          price_pkr: number;
          language?: string;
          status?: NovelStatus;
          moderation_reason?: string | null;
          total_chapters?: number;
          is_featured?: boolean;
          rights_declaration_accepted?: boolean;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<NovelRow>;
        Relationships: [];
      };
      chapters: {
        Row: ChapterRow;
        Insert: {
          id?: string;
          novel_id: string;
          chapter_number: number;
          title_urdu: string;
          content_urdu: string;
          is_free_preview?: boolean;
          word_count?: number;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ChapterRow>;
        Relationships: [];
      };
      chapter_revisions: {
        Row: ChapterRevisionRow;
        Insert: {
          id?: string;
          chapter_id: string;
          content_urdu: string;
          edited_by?: string | null;
          created_at?: string;
        };
        Update: Partial<ChapterRevisionRow>;
        Relationships: [];
      };
      reader_progress: {
        Row: ReaderProgressRow;
        Insert: {
          reader_id: string;
          novel_id: string;
          last_chapter_number: number;
          updated_at?: string;
        };
        Update: Partial<ReaderProgressRow>;
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: {
          id?: string;
          order_number?: string;
          reader_id: string;
          writer_id: string;
          novel_id: string;
          novel_title_snapshot: string;
          amount_pkr: number;
          currency?: string;
          applied_commission_rate: number;
          calculated_commission_pkr: number;
          calculated_writer_share_pkr: number;
          selected_payment_method_id?: string | null;
          payment_instructions_snapshot?: Json | null;
          status?: OrderStatus;
          verified_at?: string | null;
          rejected_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<OrderRow>;
        Relationships: [];
      };
      payment_submissions: {
        Row: PaymentSubmissionRow;
        Insert: {
          id?: string;
          order_id: string;
          reader_id: string;
          writer_id: string;
          transaction_reference_tid: string;
          screenshot_url: string;
          screenshot_path?: string | null;
          screenshot_public_id?: string | null;
          paid_amount_claimed_pkr?: number | null;
          sender_account_name?: string | null;
          reader_note?: string | null;
          is_duplicate_tid_flagged?: boolean;
          duplicate_of_submission_id?: string | null;
          reviewer_status?: "pending" | "verified" | "rejected";
          reviewer_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<PaymentSubmissionRow>;
        Relationships: [];
      };
      purchase_entitlements: {
        Row: PurchaseEntitlementRow;
        Insert: {
          id?: string;
          reader_id: string;
          novel_id: string;
          order_id: string;
          granted_at?: string;
          is_revoked?: boolean;
          revoked_reason?: string | null;
        };
        Update: Partial<PurchaseEntitlementRow>;
        Relationships: [];
      };
      sales_ledger: {
        Row: SalesLedgerRow;
        Insert: {
          id?: string;
          order_id: string;
          writer_id: string;
          reader_id: string;
          novel_id: string;
          entry_type: LedgerEntryType;
          gross_amount_pkr: number;
          commission_rate: number;
          platform_commission_pkr: number;
          writer_net_pkr: number;
          original_ledger_entry_id?: string | null;
          commission_invoice_id?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<SalesLedgerRow>;
        Relationships: [];
      };
      commission_invoices: {
        Row: CommissionInvoiceRow;
        Insert: {
          id?: string;
          invoice_number: string;
          writer_id: string;
          period_start: string;
          period_end: string;
          total_sales_count?: number;
          total_gross_pkr?: number;
          total_commission_owed_pkr?: number;
          amount_settled_pkr?: number;
          status?: CommissionInvoiceStatus;
          writer_reported_tid?: string | null;
          writer_reported_screenshot_url?: string | null;
          settled_by_admin_id?: string | null;
          settled_at?: string | null;
          created_at?: string;
        };
        Update: Partial<CommissionInvoiceRow>;
        Relationships: [];
      };
      commission_payments: {
        Row: CommissionPaymentRow;
        Insert: {
          id?: string;
          invoice_id: string;
          writer_id: string;
          amount_pkr: number;
          transaction_reference: string;
          screenshot_url?: string | null;
          confirmed_by_admin_id?: string | null;
          confirmed_at?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<CommissionPaymentRow>;
        Relationships: [];
      };
      disputes: {
        Row: DisputeRow;
        Insert: {
          id?: string;
          order_id: string;
          raised_by_id: string;
          opened_by?: string | null;
          reason: string;
          status?: DisputeStatus;
          resolution_note?: string | null;
          admin_resolution_notes?: string | null;
          resolved_by?: string | null;
          resolved_by_id?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<DisputeRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: {
          id?: string;
          user_id: string;
          type?: string;
          title: string;
          message: string;
          body?: string | null;
          link?: string | null;
          entity_refs?: Json | null;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: {
          id?: string;
          actor_id?: string | null;
          actor_role?: string | null;
          action_type: string;
          entity_type: string;
          entity_id: string;
          previous_state?: Json | null;
          new_state?: Json | null;
          created_at?: string;
        };
        Update: Partial<AuditLogRow>;
        Relationships: [];
      };
      chapter_reads: {
        Row: ChapterReadsRow;
        Insert: {
          id?: string;
          reader_id: string;
          chapter_id: string;
          novel_id: string;
          read_at?: string;
        };
        Update: Partial<ChapterReadsRow>;
        Relationships: [];
      };
    };
    Views: {
      public_novels: {
        Row: PublicNovel;
        Relationships: [];
      };
      public_writers: {
        Row: PublicWriter;
        Relationships: [];
      };
      public_genres: {
        Row: PublicGenre;
        Relationships: [];
      };
      public_free_preview_chapters: {
        Row: PublicFreePreviewChapter;
        Relationships: [];
      };
    };
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      has_novel_entitlement: {
        Args: { p_novel_id: string };
        Returns: boolean;
      };
      get_writer_unpaid_commission: {
        Args: { p_writer_id: string };
        Returns: number;
      };
      reconcile_writer_unpaid_commission: {
        Args: { p_writer_id: string };
        Returns: number;
      };
      create_order: {
        Args: {
          p_novel_id: string;
          p_payment_method_id: string;
        };
        Returns: {
          success: boolean;
          order_id: string;
          order_number: string;
          amount_pkr: number;
          currency: string;
          payment_instructions: Json;
        };
      };
      submit_payment: {
        Args: {
          p_order_id: string;
          p_tid: string;
          p_screenshot_path: string;
          p_claimed_amount?: number | null;
          p_sender_name?: string | null;
          p_note?: string | null;
        };
        Returns: {
          success: boolean;
          order_id: string;
          submission_id: string;
          status: string;
        };
      };
      verify_order_payment: {
        Args: {
          p_order_id: string;
          p_submission_id: string;
          p_writer_note?: string | null;
        };
        Returns: {
          success: boolean;
          order_id: string;
          entitlement_id: string;
          ledger_id: string;
          current_unpaid_commission: number;
          is_orders_paused_for_commission: boolean;
        };
      };
      admin_force_verify: {
        Args: {
          p_order_id: string;
          p_admin_note: string;
        };
        Returns: {
          success: boolean;
          order_id: string;
          entitlement_id: string;
          ledger_id: string;
          current_unpaid_commission: number;
          is_orders_paused_for_commission: boolean;
        };
      };
      reject_order_payment: {
        Args: {
          p_order_id: string;
          p_submission_id: string;
          p_rejection_reason: string;
        };
        Returns: {
          success: boolean;
          order_id: string;
          status: string;
        };
      };
      record_refund_adjustment: {
        Args: {
          p_order_id: string;
          p_reason: string;
        };
        Returns: {
          success: boolean;
          order_id: string;
          adjustment_ledger_id: string;
          writer_unpaid_balance: number;
        };
      };
      generate_commission_invoice: {
        Args: {
          p_writer_id: string;
          p_period_start: string;
          p_period_end: string;
        };
        Returns: {
          success: boolean;
          invoice_id: string;
          invoice_number: string;
          total_sales_count: number;
          total_commission_owed_pkr: number;
        };
      };
      report_commission_payment: {
        Args: {
          p_invoice_id: string;
          p_tid: string;
          p_screenshot_path: string;
          p_amount_pkr: number;
        };
        Returns: {
          success: boolean;
          invoice_id: string;
          status: string;
        };
      };
      confirm_commission_settlement: {
        Args: {
          p_invoice_id: string;
          p_amount_pkr: number;
          p_admin_note?: string | null;
        };
        Returns: {
          success: boolean;
          invoice_id: string;
          amount_settled: number;
          writer_unpaid_balance: number;
          is_orders_paused_for_commission: boolean;
        };
      };
      open_dispute: {
        Args: {
          p_order_id: string;
          p_reason: string;
        };
        Returns: {
          success: boolean;
          dispute_id: string;
          status: string;
        };
      };
      resolve_dispute: {
        Args: {
          p_dispute_id: string;
          p_resolution: string;
          p_resolution_note: string;
        };
        Returns: {
          success: boolean;
          dispute_id: string;
          resolution: string;
        };
      };
      approve_writer: {
        Args: { p_writer_id: string };
        Returns: { success: boolean; writer_id: string; status: string };
      };
      reject_writer: {
        Args: { p_writer_id: string; p_reason: string };
        Returns: { success: boolean; writer_id: string; status: string };
      };
      suspend_writer: {
        Args: { p_writer_id: string; p_reason: string };
        Returns: { success: boolean; writer_id: string; status: string };
      };
      approve_novel: {
        Args: { p_novel_id: string; p_checklist?: Json | null };
        Returns: { success: boolean; novel_id: string; status: string };
      };
      reject_novel: {
        Args: { p_novel_id: string; p_reason: string };
        Returns: { success: boolean; novel_id: string; status: string };
      };
      suspend_novel: {
        Args: { p_novel_id: string; p_reason: string };
        Returns: { success: boolean; novel_id: string; status: string };
      };
      unsuspend_novel: {
        Args: { p_novel_id: string };
        Returns: { success: boolean; novel_id: string; status: string };
      };
      set_novel_featured: {
        Args: { p_novel_id: string; p_featured: boolean };
        Returns: { success: boolean; novel_id: string; is_featured: boolean };
      };
      create_genre: {
        Args: {
          p_slug?: string | null;
          p_name_english: string;
          p_name_urdu: string;
          p_display_order?: number | null;
        };
        Returns: { success: boolean; genre_id: string; slug: string };
      };
      update_genre: {
        Args: {
          p_genre_id: string;
          p_name_english: string;
          p_name_urdu: string;
          p_slug?: string | null;
          p_is_active?: boolean | null;
        };
        Returns: { success: boolean; genre_id: string };
      };
      reorder_genres: {
        Args: { p_genre_orders: Json };
        Returns: { success: boolean; updated_count: number };
      };
      delete_genre: {
        Args: { p_genre_id: string };
        Returns: { success: boolean; deleted_id: string };
      };
      update_platform_settings: {
        Args: {
          p_default_commission_rate: number;
          p_default_unpaid_commission_limit: number;
          p_dispute_window_days: number;
          p_min_novel_price_pkr: number;
          p_max_novel_price_pkr: number;
          p_support_email: string;
          p_max_orders_per_hour?: number;
          p_max_chapter_reads_per_window?: number;
          p_chapter_read_window_minutes?: number;
        };
        Returns: {
          success: boolean;
        };
      };
      set_writer_commission_terms: {
        Args: {
          p_writer_id: string;
          p_custom_rate?: number | null;
          p_unpaid_limit?: number | null;
          p_reason: string;
        };
        Returns: {
          success: boolean;
          writer_id: string;
          custom_commission_rate: number | null;
          unpaid_commission_limit: number;
        };
      };
      admin_update_user_role_status: {
        Args: {
          p_user_id: string;
          p_role: UserRole;
          p_is_active: boolean;
          p_reason: string;
        };
        Returns: {
          success: boolean;
          user_id: string;
          role: UserRole;
          is_active: boolean;
        };
      };
      purge_old_payment_screenshots: {
        Args: { p_retention_days?: number };
        Returns: {
          success: boolean;
          retention_days: number;
          purged_screenshot_references: number;
        };
      };
      cancel_order: {
        Args: {
          p_order_id: string;
          p_reason?: string | null;
        };
        Returns: {
          success: boolean;
          order_id: string;
          status: string;
        };
      };
      apply_as_writer: {
        Args: {
          p_pen_name_urdu: string;
          p_pen_name_english: string;
          p_bio_urdu?: string | null;
          p_bio_english?: string | null;
          p_accept_agreement: boolean;
        };
        Returns: {
          success: boolean;
          writer_id: string;
          status: string;
        };
      };
      upsert_writer_payment_method: {
        Args: {
          p_method_type: PaymentMethodType;
          p_account_title: string;
          p_account_number_or_iban: string;
          p_method_id?: string | null;
          p_bank_name?: string | null;
          p_instructions_note?: string | null;
        };
        Returns: {
          success: boolean;
          payment_method_id: string;
        };
      };
      deactivate_writer_payment_method: {
        Args: {
          p_method_id: string;
        };
        Returns: {
          success: boolean;
          payment_method_id: string;
          is_active: boolean;
        };
      };
      submit_novel_for_review: {
        Args: {
          p_novel_id: string;
        };
        Returns: {
          success: boolean;
          novel_id: string;
          status: string;
        };
      };
      withdraw_novel_submission: {
        Args: {
          p_novel_id: string;
        };
        Returns: {
          success: boolean;
          novel_id: string;
          status: string;
        };
      };
      unpublish_own_novel: {
        Args: {
          p_novel_id: string;
        };
        Returns: {
          success: boolean;
          novel_id: string;
          status: string;
        };
      };
      create_novel: {
        Args: {
          p_title_urdu: string;
          p_title_english: string;
          p_synopsis_urdu: string;
          p_description_urdu?: string | null;
          p_cover_url?: string | null;
          p_cover_public_id?: string | null;
          p_price_pkr?: number;
          p_language?: string;
          p_rights_declaration_accepted?: boolean;
          p_genre_ids?: string[];
        };
        Returns: {
          success: boolean;
          novel_id: string;
          slug: string;
        };
      };
      update_novel: {
        Args: {
          p_novel_id: string;
          p_title_urdu: string;
          p_title_english: string;
          p_synopsis_urdu: string;
          p_description_urdu?: string | null;
          p_cover_url?: string | null;
          p_cover_public_id?: string | null;
          p_price_pkr?: number;
          p_language?: string;
          p_genre_ids?: string[];
        };
        Returns: {
          success: boolean;
          novel_id: string;
        };
      };
      reorder_chapters: {
        Args: {
          p_novel_id: string;
          p_chapter_ids: string[];
        };
        Returns: {
          success: boolean;
          novel_id: string;
        };
      };
      generate_unique_novel_slug: {
        Args: {
          p_title_english: string;
          p_novel_id: string;
        };
        Returns: string;
      };
      get_public_novel_chapters: {
        Args: {
          p_novel_slug: string;
        };
        Returns: PublicNovelChapterMeta[];
      };
      search_public_novels: {
        Args: {
          p_query?: string | null;
          p_genre_slug?: string | null;
          p_sort?: string | null;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: PublicNovelSearchResult[];
      };
      get_checkout_options: {
        Args: {
          p_novel_id: string;
        };
        Returns: CheckoutOptionsResponse;
      };
      get_my_unread_notification_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      mark_notifications_as_read: {
        Args: {
          p_notification_ids?: string[] | null;
        };
        Returns: number;
      };
      get_chapter_for_reader: {
        Args: {
          p_novel_slug: string;
          p_chapter_number: number;
        };
        Returns: ChapterReaderPayload;
      };
      upsert_reading_progress: {
        Args: {
          p_novel_id: string;
          p_chapter_number: number;
        };
        Returns: {
          success: boolean;
          novel_id: string;
          last_chapter_number: number;
        };
      };
      get_my_library: {
        Args: Record<string, never>;
        Returns: LibraryItem[];
      };
      admin_list_orders: {
        Args: {
          p_status?: string | null;
          p_search?: string | null;
          p_only_stuck?: boolean;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: AdminOrdersListResponse;
      };
      admin_get_order: {
        Args: {
          p_order_id: string;
        };
        Returns: AdminOrderDetailResponse;
      };
    };
    Enums: {
      user_role: UserRole;
      writer_status: WriterStatus;
      payment_method_type: PaymentMethodType;
      novel_status: NovelStatus;
      order_status: OrderStatus;
      commission_invoice_status: CommissionInvoiceStatus;
      dispute_status: DisputeStatus;
      ledger_entry_type: LedgerEntryType;
    };
    CompositeTypes: Record<string, never>;
  };
}

// ----------------------------------------------------------------------
// 4. CONVENIENCE COMPOUND DOMAIN TYPES
// ----------------------------------------------------------------------

export interface NovelWithWriter extends NovelRow {
  writer: {
    id: string;
    pen_name_urdu: string;
    pen_name_english: string;
    avatar_url: string | null;
  };
  genres?: GenreRow[];
}

export interface OrderWithDetails extends OrderRow {
  novel: Pick<NovelRow, "id" | "slug" | "title_urdu" | "title_english" | "cover_url">;
  reader: Pick<ProfileRow, "id" | "email" | "full_name" | "username">;
  writer: Pick<WriterProfileRow, "id" | "pen_name_urdu" | "pen_name_english">;
  submission?: PaymentSubmissionRow;
}
