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
  | "partially_paid"
  | "settled"
  | "void"
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
  invoice_due_days: number;
  overdue_grace_days: number;
  min_dispute_wait_hours: number;
  verification_reminder_hours: number;
  support_email: string;
  tips_enabled?: boolean;
  tip_min_pkr?: number;
  tip_max_pkr?: number;
  max_tips_per_hour?: number;
  tip_daily_cap_pkr_per_reader?: number;
  tip_confirm_reminder_hours?: number;
  updated_at: string;
}

export type TipStatus =
  | 'pending_payment'
  | 'payment_submitted'
  | 'confirmed'
  | 'not_received'
  | 'cancelled'
  | 'expired';

export type TipMessageStatus =
  | 'visible'
  | 'hidden_by_writer'
  | 'removed_by_admin';

export interface WriterTipSettingsRow {
  writer_id: string;
  enabled: boolean;
  thank_you_message: string;
  preset_amounts: number[];
  min_amount: number | null;
  max_amount: number | null;
  updated_at: string;
}

export interface TipRow {
  id: string;
  tip_number: string;
  reader_id: string;
  writer_id: string;
  novel_id: string | null;
  chapter_id: string | null;
  amount_pkr: number;
  currency: string;
  status: TipStatus;
  payment_instructions_snapshot: Json;
  payment_method_id: string | null;
  transaction_reference_tid: string | null;
  normalized_tid: string | null;
  is_duplicate_tid_flagged: boolean;
  screenshot_path: string | null;
  sender_account_name: string | null;
  reader_message: string | null;
  is_anonymous: boolean;
  message_status: TipMessageStatus;
  writer_reply: string | null;
  review_flag: string | null;
  open_slot: number | null;
  confirmed_at: string | null;
  not_received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TipOptionsPayload {
  tips_enabled: boolean;
  writer_enabled?: boolean;
  writer_id?: string;
  writer_pen_name?: string;
  writer_pen_name_urdu?: string;
  thank_you_message?: string;
  preset_amounts?: number[];
  min_amount_pkr?: number;
  max_amount_pkr?: number;
  can_tip: boolean;
  reason?: string | null;
  payment_methods?: Array<{
    id: string;
    method_type: PaymentMethodType;
    bank_name: string | null;
    masked_label: string;
    instructions_note: string | null;
  }>;
}

export interface TipSummaryPayload {
  writer_id: string;
  confirmed_tips_count: number;
  confirmed_total_pkr: number;
  unique_supporters_count: number;
  pending_confirmation_count: number;
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
    is_duplicate_tid_flagged?: boolean;
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
    writer_net_pkr?: number;
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
  cover_url?: string | null;
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
  unpaid_commission_limit_pkr?: number | null;
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
  use_for_tips?: boolean;
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

export interface ChapterDraftRow {
  id: string;
  writer_id: string;
  novel_id: string;
  chapter_id: string | null;
  client_key: string;
  title_urdu: string | null;
  content_urdu: string;
  chapter_number: number | null;
  base_chapter_updated_at: string | null;
  server_revision: number;
  device_label: string | null;
  created_at: string;
  updated_at: string;
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
  due_date: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  writer_reported_tid: string | null;
  writer_reported_screenshot_url: string | null;
  settled_by_admin_id: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionInvoiceLineRow {
  id: string;
  invoice_id: string;
  ledger_entry_id: string;
  commission_pkr: number;
  is_voided: boolean;
  created_at: string;
}

export interface PlatformPaymentMethodRow {
  id: string;
  method_type: 'jazzcash' | 'easypaisa' | 'raast' | 'bank_transfer';
  account_title: string;
  account_number_or_iban: string;
  bank_name: string | null;
  instructions_note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommissionPaymentReportRow {
  id: string;
  invoice_id: string;
  writer_id: string;
  amount_pkr: number;
  transaction_reference: string;
  normalized_tid: string;
  screenshot_path: string;
  writer_note: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  is_duplicate_tid: boolean;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface WriterSalesSummary {
  writer_id: string;
  pen_name_english: string;
  pen_name_urdu: string;
  sales_count: number;
  total_gross_pkr: number;
  total_commission_pkr: number;
  total_net_pkr: number;
  refunds_count: number;
  refunds_amount_pkr: number;
  unpaid_commission_balance_pkr: number;
  unpaid_commission_limit_pkr: number;
  is_orders_paused: boolean;
}

export interface WriterLedgerEntry {
  id: string;
  order_id: string | null;
  order_number: string | null;
  novel_title: string;
  reader_display_name: string;
  entry_type: LedgerEntryType;
  gross_amount_pkr: number;
  commission_rate: number;
  platform_commission_pkr: number;
  writer_net_pkr: number;
  invoice_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface WriterInvoiceSummary {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_sales_count: number;
  total_gross_pkr: number;
  total_commission_owed_pkr: number;
  amount_settled_pkr: number;
  remaining_owed_pkr: number;
  status: CommissionInvoiceStatus;
  due_date: string | null;
  is_overdue: boolean;
  reported_count?: number;
  created_at: string;
}

export interface WriterInvoiceDetail extends WriterInvoiceSummary {
  voided_at: string | null;
  void_reason: string | null;
  lines: Array<{
    id: string;
    ledger_entry_id: string;
    order_number: string | null;
    novel_title: string;
    reader_display_name?: string | null;
    entry_type: LedgerEntryType;
    gross_amount_pkr: number;
    commission_rate: number;
    commission_pkr: number;
    writer_net_pkr: number;
    created_at: string;
  }>;
  payments: Array<{
    id: string;
    amount_pkr: number;
    transaction_reference: string;
    confirmed_at: string;
    notes: string | null;
  }>;
  reports: Array<{
    id: string;
    amount_pkr: number;
    transaction_reference: string;
    screenshot_path: string;
    writer_note: string | null;
    status: 'pending' | 'confirmed' | 'rejected';
    is_duplicate_tid: boolean;
    admin_note: string | null;
    created_at: string;
    reviewed_at: string | null;
  }>;
}

export interface AdminWriterCommissionOverview {
  writer_id: string;
  pen_name_english: string;
  pen_name_urdu: string;
  username: string | null;
  custom_commission_rate: number | null;
  unpaid_commission_balance_pkr: number;
  unpaid_commission_limit_pkr: number;
  percent_of_limit: number;
  is_orders_paused: boolean;
  total_accrued_pkr: number;
  total_settled_pkr: number;
  pending_reports_count: number;
  overdue_invoices_count: number;
}

export interface AdminCommissionReportItem {
  id: string;
  invoice_id: string;
  invoice_number: string;
  writer_id: string;
  writer_pen_name: string;
  writer_username: string | null;
  amount_pkr: number;
  transaction_reference: string;
  screenshot_path: string;
  writer_note: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  is_duplicate_tid: boolean;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface AdminOverdueRulesResult {
  applied: boolean;
  grace_days: number;
  overdue_invoices_count: number;
  overdue_invoices: Array<{
    invoice_id: string;
    invoice_number: string;
    writer_id: string;
    writer_pen_name: string;
    total_commission_owed_pkr: number;
    amount_settled_pkr: number;
    remaining_owed_pkr: number;
    due_date: string;
    grace_cutoff: string;
    days_past_grace: number;
    status: string;
  }>;
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

export interface DisputeMessageRow {
  id: string;
  dispute_id: string;
  author_id: string;
  author_role: 'reader' | 'writer' | 'admin';
  body: string;
  attachment_path: string | null;
  created_at: string;
}

export interface RefundRequestRow {
  id: string;
  order_id: string;
  requested_by: string;
  requester_role: 'writer' | 'reader';
  reason: string;
  evidence_note: string | null;
  evidence_path: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportRequestRow {
  id: string;
  user_id: string;
  category: 'order' | 'payment' | 'account' | 'content' | 'other';
  order_id: string | null;
  subject: string;
  body: string;
  status: 'open' | 'answered' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface SupportMessageRow {
  id: string;
  request_id: string;
  author_id: string;
  author_role: 'reader' | 'writer' | 'admin';
  body: string;
  created_at: string;
}

export interface NotificationPreferencesRow {
  user_id: string;
  email_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailOutboxRow {
  id: string;
  user_id: string;
  template: string;
  subject: string;
  body_text: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  last_error: string | null;
  dedupe_key: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface DisputeListItem {
  dispute_id: string;
  order_id: string;
  order_number: string;
  novel_title: string;
  amount_pkr: number;
  status: DisputeStatus;
  reason: string;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  is_opened_by_me: boolean;
  other_party_name: string;
  messages_count: number;
  last_message_at: string | null;
  writer_pen_name?: string;
  reader_name?: string;
  is_stuck?: boolean;
}

export interface DisputeMessageItem {
  id: string;
  author_id: string;
  author_role: 'reader' | 'writer' | 'admin';
  author_name: string;
  body: string;
  attachment_path: string | null;
  created_at: string;
  is_by_me: boolean;
}

export interface DisputeDetailPayload {
  dispute: {
    id: string;
    status: DisputeStatus;
    reason: string;
    resolution_note: string | null;
    admin_resolution_notes: string | null;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
  };
  order: {
    id: string;
    order_number: string;
    novel_title: string;
    amount_pkr: number;
    status: OrderStatus;
    reader_display_name: string;
    writer_pen_name: string;
    writer_pen_name_urdu: string;
    created_at: string;
    verified_at: string | null;
  };
  messages: DisputeMessageItem[];
  submissions: Array<{
    id: string;
    transaction_reference_tid: string;
    screenshot_url: string;
    paid_amount_claimed_pkr: number | null;
    sender_account_name: string | null;
    reader_note: string | null;
    reviewer_status: string;
    reviewer_note: string | null;
    created_at: string;
  }>;
  caller_role: 'reader' | 'writer' | 'admin';
}

export interface RefundRequestItem {
  id: string;
  order_id: string;
  order_number: string;
  novel_title: string;
  amount_pkr: number;
  writer_pen_name: string;
  reader_name: string;
  requested_by_role: 'writer' | 'reader';
  reason: string;
  evidence_note: string | null;
  evidence_path: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface SupportRequestListItem {
  id: string;
  category: 'order' | 'payment' | 'account' | 'content' | 'other';
  subject: string;
  status: 'open' | 'answered' | 'closed';
  user_name?: string;
  order_number?: string | null;
  created_at: string;
  updated_at: string;
  messages_count: number;
  last_message_at?: string;
}

export interface SupportRequestDetailPayload {
  request: {
    id: string;
    category: 'order' | 'payment' | 'account' | 'content' | 'other';
    subject: string;
    status: 'open' | 'answered' | 'closed';
    order_id: string | null;
    order_number: string | null;
    user_name: string;
    created_at: string;
    updated_at: string;
  };
  messages: Array<{
    id: string;
    author_id: string;
    author_role: 'reader' | 'writer' | 'admin';
    author_name: string;
    body: string;
    created_at: string;
    is_by_me: boolean;
  }>;
}

export interface EmailOutboxStats {
  pending_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
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
      chapter_drafts: {
        Row: ChapterDraftRow;
        Insert: {
          id?: string;
          writer_id: string;
          novel_id: string;
          chapter_id?: string | null;
          client_key: string;
          title_urdu?: string | null;
          content_urdu: string;
          chapter_number?: number | null;
          base_chapter_updated_at?: string | null;
          server_revision?: number;
          device_label?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ChapterDraftRow>;
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
          updated_at?: string;
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
      commission_invoice_lines: {
        Row: CommissionInvoiceLineRow;
        Insert: {
          id?: string;
          invoice_id: string;
          ledger_entry_id: string;
          commission_pkr: number;
          is_voided?: boolean;
          created_at?: string;
        };
        Update: Partial<CommissionInvoiceLineRow>;
        Relationships: [];
      };
      platform_payment_methods: {
        Row: PlatformPaymentMethodRow;
        Insert: {
          id?: string;
          method_type: 'jazzcash' | 'easypaisa' | 'raast' | 'bank_transfer';
          account_title: string;
          account_number_or_iban: string;
          bank_name?: string | null;
          instructions_note?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<PlatformPaymentMethodRow>;
        Relationships: [];
      };
      commission_payment_reports: {
        Row: CommissionPaymentReportRow;
        Insert: {
          id?: string;
          invoice_id: string;
          writer_id: string;
          amount_pkr: number;
          transaction_reference: string;
          normalized_tid: string;
          screenshot_path: string;
          writer_note?: string | null;
          status?: 'pending' | 'confirmed' | 'rejected';
          is_duplicate_tid?: boolean;
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<CommissionPaymentReportRow>;
        Relationships: [];
      };
      dispute_messages: {
        Row: DisputeMessageRow;
        Insert: {
          id?: string;
          dispute_id: string;
          author_id: string;
          author_role: 'reader' | 'writer' | 'admin';
          body: string;
          attachment_path?: string | null;
          created_at?: string;
        };
        Update: Partial<DisputeMessageRow>;
        Relationships: [];
      };
      refund_requests: {
        Row: RefundRequestRow;
        Insert: {
          id?: string;
          order_id: string;
          requested_by: string;
          requester_role: 'reader' | 'writer';
          reason: string;
          evidence_note?: string | null;
          evidence_path?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<RefundRequestRow>;
        Relationships: [];
      };
      support_requests: {
        Row: SupportRequestRow;
        Insert: {
          id?: string;
          user_id: string;
          category: 'order' | 'payment' | 'account' | 'content' | 'other';
          order_id?: string | null;
          subject: string;
          body: string;
          status?: 'open' | 'answered' | 'closed';
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<SupportRequestRow>;
        Relationships: [];
      };
      support_messages: {
        Row: SupportMessageRow;
        Insert: {
          id?: string;
          request_id: string;
          author_id: string;
          author_role: 'reader' | 'writer' | 'admin';
          body: string;
          created_at?: string;
        };
        Update: Partial<SupportMessageRow>;
        Relationships: [];
      };
      notification_preferences: {
        Row: NotificationPreferencesRow;
        Insert: {
          user_id: string;
          email_enabled?: boolean;
          updated_at?: string;
        };
        Update: Partial<NotificationPreferencesRow>;
        Relationships: [];
      };
      email_outbox: {
        Row: EmailOutboxRow;
        Insert: {
          id?: string;
          user_id: string;
          template: string;
          subject: string;
          body_text: string;
          status?: 'pending' | 'sent' | 'failed' | 'skipped';
          attempts?: number;
          last_error?: string | null;
          dedupe_key?: string | null;
          created_at?: string;
          sent_at?: string | null;
        };
        Update: Partial<EmailOutboxRow>;
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
      writer_tip_settings: {
        Row: WriterTipSettingsRow;
        Insert: {
          writer_id: string;
          enabled?: boolean;
          thank_you_message?: string;
          preset_amounts?: number[];
          min_amount?: number | null;
          max_amount?: number | null;
          updated_at?: string;
        };
        Update: Partial<WriterTipSettingsRow>;
        Relationships: [];
      };
      tips: {
        Row: TipRow;
        Insert: {
          id?: string;
          tip_number: string;
          reader_id: string;
          writer_id: string;
          novel_id?: string | null;
          chapter_id?: string | null;
          amount_pkr: number;
          currency?: string;
          status?: TipStatus;
          payment_instructions_snapshot: Json;
          payment_method_id?: string | null;
          transaction_reference_tid?: string | null;
          is_duplicate_tid_flagged?: boolean;
          screenshot_path?: string | null;
          sender_account_name?: string | null;
          reader_message?: string | null;
          is_anonymous?: boolean;
          message_status?: TipMessageStatus;
          writer_reply?: string | null;
          review_flag?: string | null;
          open_slot?: number | null;
          confirmed_at?: string | null;
          not_received_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<TipRow>;
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
      open_dispute: {
        Args: {
          p_order_id: string;
          p_reason: string;
        };
        Returns: {
          success: boolean;
          dispute_id: string;
          order_id: string;
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
          p_default_commission_rate?: number;
          p_default_unpaid_commission_limit?: number;
          p_dispute_window_days?: number;
          p_min_novel_price_pkr?: number;
          p_max_novel_price_pkr?: number;
          p_support_email?: string;
          p_max_orders_per_hour?: number;
          p_max_chapter_reads_per_window?: number;
          p_chapter_read_window_minutes?: number;
          p_invoice_due_days?: number;
          p_overdue_grace_days?: number;
          p_min_dispute_wait_hours?: number;
          p_verification_reminder_hours?: number;
          p_unpaid_commission_threshold_pkr?: number;
          p_payment_verification_window_hours?: number;
          p_tips_enabled?: boolean;
          p_tip_min_pkr?: number;
          p_tip_max_pkr?: number;
          p_max_tips_per_hour?: number;
          p_tip_daily_cap_pkr_per_reader?: number;
          p_tip_confirm_reminder_hours?: number;
        };
        Returns: {
          success: boolean;
          message?: string;
          settings?: Json;
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
      preview_commission_invoice: {
        Args: {
          p_writer_id: string;
          p_period_start: string;
          p_period_end: string;
        };
        Returns: {
          writer_id: string;
          period_start: string;
          period_end: string;
          sales_count: number;
          refunds_count: number;
          total_entries_count: number;
          total_gross_pkr: number;
          total_commission_owed_pkr: number;
          total_writer_net_pkr: number;
          can_generate_invoice: boolean;
          lines: Json[];
        };
      };
      void_commission_invoice: {
        Args: {
          p_invoice_id: string;
          p_reason: string;
        };
        Returns: {
          success: boolean;
          invoice_id: string;
        };
      };
      report_commission_payment: {
        Args: {
          p_invoice_id: string;
          p_amount_pkr: number;
          p_tid: string;
          p_screenshot_path: string;
          p_writer_note?: string | null;
        };
        Returns: {
          success: boolean;
          report_id: string;
          status: string;
          is_duplicate_tid: boolean;
        };
      };
      confirm_commission_settlement: {
        Args: {
          p_invoice_id: string;
          p_amount_pkr: number;
          p_report_id?: string | null;
          p_admin_note?: string | null;
        };
        Returns: {
          success: boolean;
          invoice_id: string;
          payment_id: string;
          amount_confirmed_pkr: number;
          total_settled_pkr: number;
          invoice_status: CommissionInvoiceStatus;
          writer_unpaid_balance_pkr: number;
          is_orders_paused: boolean;
        };
      };
      reject_commission_report: {
        Args: {
          p_report_id: string;
          p_reason: string;
        };
        Returns: {
          success: boolean;
          report_id: string;
        };
      };
      record_commission_adjustment: {
        Args: {
          p_writer_id: string;
          p_amount_pkr: number;
          p_reason: string;
        };
        Returns: {
          success: boolean;
          ledger_id: string;
          adjustment_amount_pkr: number;
          new_unpaid_balance_pkr: number;
          is_orders_paused: boolean;
        };
      };
      apply_overdue_rules: {
        Args: {
          p_apply?: boolean;
        };
        Returns: AdminOverdueRulesResult;
      };
      upsert_platform_payment_method: {
        Args: {
          p_id?: string | null;
          p_method_type: string;
          p_account_title: string;
          p_account_number_or_iban: string;
          p_bank_name?: string | null;
          p_instructions_note?: string | null;
        };
        Returns: {
          success: boolean;
          id: string;
        };
      };
      deactivate_platform_payment_method: {
        Args: {
          p_id: string;
        };
        Returns: {
          success: boolean;
          id: string;
        };
      };
      get_platform_payment_instructions: {
        Args: Record<string, never>;
        Returns: PlatformPaymentMethodRow[];
      };
      get_my_sales_summary: {
        Args: {
          p_from?: string | null;
          p_to?: string | null;
        };
        Returns: WriterSalesSummary;
      };
      get_my_ledger: {
        Args: {
          p_from?: string | null;
          p_to?: string | null;
          p_entry_type?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          total_count: number;
          entries: WriterLedgerEntry[];
        };
      };
      get_my_invoices: {
        Args: Record<string, never>;
        Returns: WriterInvoiceSummary[];
      };
      get_my_invoice: {
        Args: {
          p_invoice_id: string;
        };
        Returns: WriterInvoiceDetail;
      };
      admin_commission_overview: {
        Args: Record<string, never>;
        Returns: AdminWriterCommissionOverview[];
      };
      admin_list_invoices: {
        Args: {
          p_status?: string | null;
          p_search?: string | null;
          p_only_overdue?: boolean;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          total_count: number;
          invoices: WriterInvoiceSummary[];
        };
      };
      admin_list_commission_reports: {
        Args: {
          p_status?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          total_count: number;
          reports: AdminCommissionReportItem[];
        };
      };
      add_dispute_message: {
        Args: {
          p_dispute_id: string;
          p_body: string;
          p_attachment_path?: string | null;
        };
        Returns: {
          success: boolean;
          message_id: string;
          dispute_id: string;
          author_role: string;
          created_at: string;
        };
      };
      resolve_dispute_for_reader_verify: {
        Args: {
          p_dispute_id: string;
          p_note: string;
        };
        Returns: {
          success: boolean;
          dispute_id: string;
          order_id: string;
          outcome: string;
        };
      };
      resolve_dispute_refund: {
        Args: {
          p_dispute_id: string;
          p_note: string;
        };
        Returns: {
          success: boolean;
          dispute_id: string;
          order_id: string;
          outcome: string;
        };
      };
      resolve_dispute_for_writer: {
        Args: {
          p_dispute_id: string;
          p_note: string;
        };
        Returns: {
          success: boolean;
          dispute_id: string;
          order_id: string;
          outcome: string;
        };
      };
      close_dispute: {
        Args: {
          p_dispute_id: string;
          p_note: string;
        };
        Returns: {
          success: boolean;
          dispute_id: string;
          status: string;
        };
      };
      get_my_disputes: {
        Args: Record<string, never>;
        Returns: DisputeListItem[];
      };
      get_dispute: {
        Args: {
          p_dispute_id: string;
        };
        Returns: DisputeDetailPayload;
      };
      admin_list_disputes: {
        Args: {
          p_status?: string | null;
          p_search?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          total_count: number;
          disputes: DisputeListItem[];
        };
      };
      request_refund: {
        Args: {
          p_order_id: string;
          p_reason: string;
          p_evidence_note?: string | null;
          p_evidence_path?: string | null;
        };
        Returns: {
          success: boolean;
          request_id: string;
          status: string;
        };
      };
      approve_refund_request: {
        Args: {
          p_request_id: string;
          p_note: string;
        };
        Returns: {
          success: boolean;
          request_id: string;
          order_id: string;
          status: string;
        };
      };
      reject_refund_request: {
        Args: {
          p_request_id: string;
          p_note: string;
        };
        Returns: {
          success: boolean;
          request_id: string;
          status: string;
        };
      };
      admin_list_refund_requests: {
        Args: {
          p_status?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          total_count: number;
          requests: RefundRequestItem[];
        };
      };
      create_support_request: {
        Args: {
          p_category: string;
          p_subject: string;
          p_body: string;
          p_order_id?: string | null;
        };
        Returns: {
          success: boolean;
          request_id: string;
        };
      };
      add_support_message: {
        Args: {
          p_request_id: string;
          p_body: string;
        };
        Returns: {
          success: boolean;
          message_id: string;
        };
      };
      close_support_request: {
        Args: {
          p_request_id: string;
        };
        Returns: {
          success: boolean;
          request_id: string;
          status: string;
        };
      };
      get_my_support_requests: {
        Args: Record<string, never>;
        Returns: SupportRequestListItem[];
      };
      get_support_request: {
        Args: {
          p_request_id: string;
        };
        Returns: SupportRequestDetailPayload;
      };
      admin_list_support_requests: {
        Args: {
          p_status?: string | null;
          p_category?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          total_count: number;
          requests: SupportRequestListItem[];
        };
      };
      run_scheduled_reminders: {
        Args: Record<string, never>;
        Returns: {
          success: boolean;
          enqueued_reminders: number;
        };
      };
      claim_pending_emails_for_sending: {
        Args: {
          p_batch_size?: number;
        };
        Returns: Array<{
          id: string;
          user_id: string;
          recipient_email: string;
          template: string;
          subject: string;
          body_text: string;
          attempts: number;
        }>;
      };
      record_email_delivery_result: {
        Args: {
          p_email_id: string;
          p_success: boolean;
          p_error?: string | null;
        };
        Returns: {
          success: boolean;
        };
      };
      get_email_outbox_stats: {
        Args: Record<string, never>;
        Returns: EmailOutboxStats;
      };
      retry_failed_emails: {
        Args: {
          p_max_retry?: number;
        };
        Returns: {
          success: boolean;
          retried_count: number;
        };
      };
      get_my_notification_preferences: {
        Args: Record<string, never>;
        Returns: {
          email_enabled: boolean;
        };
      };
      update_notification_preferences: {
        Args: {
          p_email_enabled: boolean;
        };
        Returns: {
          success: boolean;
          email_enabled: boolean;
        };
      };
      get_reader_display_names: {
        Args: {
          p_reader_ids: string[];
        };
        Returns: Array<{
          id: string;
          full_name: string | null;
          username: string;
        }>;
      };
      get_writer_display_names: {
        Args: {
          p_writer_ids: string[];
        };
        Returns: Array<{
          id: string;
          pen_name_urdu: string;
          pen_name_english: string;
          username: string;
        }>;
      };
      import_chapters: {
        Args: {
          p_novel_id: string;
          p_start_number?: number | null;
          p_parts?: Json;
        };
        Returns: Json;
      };
      split_chapter: {
        Args: {
          p_chapter_id: string;
          p_parts: Json;
        };
        Returns: Json;
      };
      upsert_chapter_draft: {
        Args: {
          p_novel_id: string;
          p_chapter_id?: string | null;
          p_client_key: string;
          p_title_urdu?: string | null;
          p_content_urdu: string;
          p_chapter_number?: number | null;
          p_base_chapter_updated_at?: string | null;
          p_expected_server_revision?: number | null;
          p_device_label?: string | null;
        };
        Returns: Json;
      };
      get_chapter_draft: {
        Args: {
          p_client_key: string;
        };
        Returns: Json;
      };
      list_my_chapter_drafts: {
        Args: {
          p_novel_id?: string | null;
        };
        Returns: Json;
      };
      discard_chapter_draft: {
        Args: {
          p_client_key: string;
        };
        Returns: Json;
      };
      resolve_chapter_draft_conflict: {
        Args: {
          p_client_key: string;
          p_choice: string;
          p_content_urdu?: string | null;
          p_title_urdu?: string | null;
        };
        Returns: Json;
      };
      purge_old_chapter_drafts: {
        Args: {
          p_days?: number | null;
        };
        Returns: Json;
      };
      get_tip_options: {
        Args: {
          p_writer_id?: string | null;
          p_novel_id?: string | null;
          p_chapter_id?: string | null;
        };
        Returns: Json;
      };
      set_my_tip_settings: {
        Args: {
          p_enabled: boolean;
          p_thank_you_message: string;
          p_preset_amounts: number[];
          p_min_amount?: number | null;
          p_max_amount?: number | null;
        };
        Returns: Json;
      };
      get_my_tip_settings: {
        Args: Record<string, never>;
        Returns: Json;
      };
      create_tip: {
        Args: {
          p_writer_id: string;
          p_amount_pkr: number;
          p_payment_method_id: string;
          p_novel_id?: string | null;
          p_chapter_id?: string | null;
          p_message?: string | null;
          p_is_anonymous?: boolean;
        };
        Returns: Json;
      };
      submit_tip_payment: {
        Args: {
          p_tip_id: string;
          p_tid: string;
          p_screenshot_path?: string | null;
          p_sender_name?: string | null;
        };
        Returns: Json;
      };
      cancel_tip: {
        Args: {
          p_tip_id: string;
        };
        Returns: Json;
      };
      confirm_tip_received: {
        Args: {
          p_tip_id: string;
          p_reply?: string | null;
        };
        Returns: Json;
      };
      mark_tip_not_received: {
        Args: {
          p_tip_id: string;
          p_note?: string | null;
        };
        Returns: Json;
      };
      get_my_tips: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_tip_by_number: {
        Args: {
          p_tip_number: string;
        };
        Returns: Json;
      };
      get_my_received_tips: {
        Args: {
          p_status?: string | null;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: Json;
      };
      get_my_tip_summary: {
        Args: {
          p_from?: string | null;
          p_to?: string | null;
        };
        Returns: Json;
      };
      hide_tip_message: {
        Args: {
          p_tip_id: string;
          p_hidden: boolean;
        };
        Returns: Json;
      };
      report_tip_message: {
        Args: {
          p_tip_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      admin_remove_tip_message: {
        Args: {
          p_tip_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      admin_list_tips: {
        Args: {
          p_status?: string | null;
          p_search?: string | null;
          p_flagged_only?: boolean;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: Json;
      };
      admin_get_tip: {
        Args: {
          p_tip_id: string;
        };
        Returns: Json;
      };
      admin_review_tip: {
        Args: {
          p_tip_id: string;
          p_action: string;
          p_notes: string;
        };
        Returns: Json;
      };
      can_access_tip_proof: {
        Args: {
          p_folder_name: string;
          p_action: string;
        };
        Returns: boolean;
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
