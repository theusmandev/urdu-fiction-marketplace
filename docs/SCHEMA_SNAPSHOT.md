# UNB Premium — Canonical Database Schema Snapshot
**Version:** Reconciled from Migrations 0001 through 0018  
**Scope:** Single source of truth for tables, columns, constraints, enums, views, triggers, and RPC signatures.

---

## 1. Custom PostgreSQL Enums

### `public.user_role`
- Values: `'reader'`, `'writer'`, `'admin'`
- Defined in: `0001_enums_and_core_tables.sql`

### `public.writer_status`
- Values: `'pending_approval'`, `'approved'`, `'suspended'`, `'rejected'`
- Defined in: `0001_enums_and_core_tables.sql`

### `public.payment_method_type`
- Values: `'jazzcash'`, `'easypaisa'`, `'raast'`, `'bank_iban'`
- Defined in: `0001_enums_and_core_tables.sql`

### `public.novel_status`
- Values: `'draft'`, `'under_review'`, `'published'`, `'rejected'`, `'suspended'`
- Defined in: `0001_enums_and_core_tables.sql`

### `public.order_status`
- Values: `'pending_payment'`, `'payment_submitted'`, `'verified'`, `'rejected'`, `'disputed'`, `'cancelled'`, `'refunded_adjusted'`
- Defined in: `0001_enums_and_core_tables.sql`

### `public.commission_invoice_status`
- Values: `'open'`, `'invoiced'`, `'payment_reported'`, `'settled'`, `'disputed'`, `'partially_paid'`, `'void'`
- Defined in: `0001_enums_and_core_tables.sql` (`open`, `invoiced`, `payment_reported`, `settled`, `disputed`); `0017_a_commission_enum_values.sql` added `'partially_paid'`, `'void'` in standalone transaction.

### `public.dispute_status`
- Values: `'open'`, `'under_review'`, `'resolved_for_reader'`, `'resolved_for_writer'`, `'closed'`
- Defined in: `0001_enums_and_core_tables.sql`

---

## 2. Tables & Columns (Ground Truth)

### `public.platform_settings` (Single-Row Configuration, `id = 1`)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | integer | NO | `1` | PRIMARY KEY, `CHECK (id = 1)` |
| `default_commission_rate` | numeric(5,2) | NO | `20.00` | `CHECK (>= 0 AND <= 100)` |
| `default_unpaid_commission_limit` | numeric(12,2) | NO | `5000.00` | `CHECK (>= 0)` |
| `support_email` | text | NO | `'support@unbpremium.pk'` | |
| `updated_at` | timestamptz | NO | `now()` | |
| `min_novel_price_pkr` | integer | NO | `50` | `CHECK (>= 50 AND <= 5000)` (0014) |
| `max_novel_price_pkr` | numeric(10,2) | NO | `5000.00` | `CHECK (>= 50 AND <= 5000)` (0014) |
| `max_orders_per_hour` | integer | NO | `5` | `CHECK (>= 1 AND <= 100)` (0015) |
| `max_chapter_reads_per_window` | integer | NO | `10` | `CHECK (>= 1 AND <= 100)` (0016) |
| `chapter_read_window_minutes` | integer | NO | `60` | `CHECK (>= 5 AND <= 1440)` (0016) |
| `invoice_due_days` | integer | NO | `7` | `CHECK (>= 1 AND <= 60)` (0017) |
| `overdue_grace_days` | integer | NO | `3` | `CHECK (>= 0 AND <= 30)` (0017) |
| `min_dispute_wait_hours` | integer | NO | `24` | `CHECK (>= 0 AND <= 168)` (0018) |
| `verification_reminder_hours` | integer | NO | `24` | `CHECK (>= 1 AND <= 168)` (0018) |
| `dispute_window_days` | integer | NO | `30` | `CHECK (>= 1 AND <= 90)` (0018) |

### `public.profiles`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | — | PRIMARY KEY REFERENCES `auth.users(id)` ON DELETE CASCADE |
| `email` | text | NO | — | |
| `full_name` | text | YES | NULL | |
| `username` | text | YES | NULL | UNIQUE |
| `avatar_url` | text | YES | NULL | |
| `role` | user_role | NO | `'reader'` | |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

### `public.writer_profiles`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | — | PRIMARY KEY REFERENCES `profiles(id)` ON DELETE CASCADE |
| `pen_name_urdu` | text | NO | — | |
| `pen_name_english` | text | NO | — | |
| `bio_urdu` | text | YES | NULL | |
| `bio_english` | text | YES | NULL | |
| `status` | writer_status | NO | `'pending_approval'` | |
| `custom_commission_rate` | numeric(5,2) | YES | NULL | `CHECK (custom_commission_rate >= 0 AND <= 100)` |
| `unpaid_commission_limit` | numeric(12,2) | NO | `5000.00` | `CHECK (>= 0)` |
| `current_unpaid_commission` | numeric(12,2) | NO | `0.00` | `CHECK (>= 0)` |
| `is_orders_paused_for_commission` | boolean | NO | `false` | |
| `agreement_accepted_at` | timestamptz | YES | NULL | |
| `approved_by` | uuid | YES | NULL | REFERENCES `profiles(id)` |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

### `public.writer_payment_methods`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `writer_id` | uuid | NO | — | REFERENCES `writer_profiles(id)` ON DELETE CASCADE |
| `method_type` | payment_method_type | NO | — | |
| `account_title` | text | NO | — | |
| `account_number_or_iban` | text | NO | — | |
| `bank_name` | text | YES | NULL | |
| `instructions_note` | text | YES | NULL | |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |

### `public.genres`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `slug` | text | NO | — | UNIQUE |
| `name_english` | text | NO | — | |
| `name_urdu` | text | NO | — | |
| `display_order` | integer | NO | `0` | |
| `is_active` | boolean | NO | `true` | Added in 0012 |
| `created_at` | timestamptz | NO | `now()` | |

### `public.novels`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `writer_id` | uuid | NO | — | REFERENCES `writer_profiles(id)` ON DELETE RESTRICT |
| `slug` | text | NO | — | UNIQUE |
| `title_urdu` | text | NO | — | |
| `title_english` | text | NO | — | |
| `synopsis_urdu` | text | NO | — | |
| `description_urdu` | text | YES | NULL | |
| `cover_url` | text | YES | NULL | **Canonical cover column** (no `cover_image_url`) |
| `cover_public_id` | text | YES | NULL | |
| `price_pkr` | numeric(10,2) | NO | — | `CHECK (price_pkr = round(price_pkr, 0) AND price_pkr >= 50 AND price_pkr <= 5000)` (0014) |
| `language` | text | NO | `'ur'` | |
| `status` | novel_status | NO | `'draft'` | |
| `moderation_reason` | text | YES | NULL | |
| `total_chapters` | integer | NO | `0` | `CHECK (total_chapters >= 0)` |
| `is_featured` | boolean | NO | `false` | |
| `rights_declaration_accepted` | boolean | NO | `false` | |
| `published_at` | timestamptz | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

### `public.novel_genres`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `novel_id` | uuid | NO | — | PRIMARY KEY (1/2) REFERENCES `novels(id)` ON DELETE CASCADE |
| `genre_id` | uuid | NO | — | PRIMARY KEY (2/2) REFERENCES `genres(id)` ON DELETE CASCADE |

### `public.chapters`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `novel_id` | uuid | NO | — | REFERENCES `novels(id)` ON DELETE CASCADE |
| `chapter_number` | integer | NO | — | `CHECK (chapter_number > 0)` |
| `title_urdu` | text | NO | — | **Only title column** (no `title_english`) |
| `content_urdu` | text | NO | — | `CHECK (char_length(content_urdu) <= 120000)` (0007) |
| `is_free_preview` | boolean | NO | `false` | |
| `word_count` | integer | NO | `0` | `CHECK (word_count >= 0)` |
| `is_published` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |
| *Constraint* | `uq_novel_chapter_number` | — | — | UNIQUE (`novel_id`, `chapter_number`) |

### `public.chapter_revisions` (0007)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `chapter_id` | uuid | NO | — | REFERENCES `chapters(id)` ON DELETE CASCADE |
| `content_urdu` | text | NO | — | Prior version snapshot |
| `edited_by` | uuid | YES | NULL | REFERENCES `profiles(id)` ON DELETE SET NULL |
| `created_at` | timestamptz | NO | `now()` | |

### `public.reader_progress` (0007)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `reader_id` | uuid | NO | — | PRIMARY KEY (1/2) REFERENCES `profiles(id)` ON DELETE CASCADE |
| `novel_id` | uuid | NO | — | PRIMARY KEY (2/2) REFERENCES `novels(id)` ON DELETE CASCADE |
| `last_chapter_number` | integer | NO | — | `CHECK (last_chapter_number > 0)` |
| `updated_at` | timestamptz | NO | `now()` | |

### `public.chapter_reads` (0016)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `reader_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE CASCADE |
| `chapter_id` | uuid | NO | — | REFERENCES `chapters(id)` ON DELETE CASCADE |
| `novel_id` | uuid | NO | — | REFERENCES `novels(id)` ON DELETE CASCADE |
| `read_at` | timestamptz | NO | `now()` | Rate limiting sliding-window log |

### `public.orders`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `order_number` | text | NO | — | UNIQUE |
| `reader_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE RESTRICT |
| `writer_id` | uuid | NO | — | REFERENCES `writer_profiles(id)` ON DELETE RESTRICT |
| `novel_id` | uuid | NO | — | REFERENCES `novels(id)` ON DELETE RESTRICT |
| `novel_title_snapshot` | text | NO | — | |
| `amount_pkr` | numeric(10,2) | NO | — | `CHECK (amount_pkr >= 0)` |
| `currency` | text | NO | `'PKR'` | |
| `applied_commission_rate` | numeric(5,2) | NO | — | `CHECK (applied_commission_rate >= 0 AND <= 100)` |
| `calculated_commission_pkr` | numeric(10,2) | NO | — | `CHECK (calculated_commission_pkr >= 0)` |
| `calculated_writer_share_pkr` | numeric(10,2) | NO | — | `CHECK (calculated_writer_share_pkr >= 0)` |
| `selected_payment_method_id` | uuid | YES | NULL | REFERENCES `writer_payment_methods(id)` ON DELETE SET NULL |
| `payment_instructions_snapshot` | jsonb | YES | NULL | Full recipient credentials snapshot |
| `status` | order_status | NO | `'pending_payment'` | |
| `verified_at` | timestamptz | YES | NULL | |
| `rejected_reason` | text | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |
*Note:* There is NO `payment_method` column. There is NO `cancelled_at` or `cancellation_reason` column. Single open order per novel enforced by partial unique index `uq_orders_reader_novel_active` (0006/0010).

### `public.payment_submissions`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `order_id` | uuid | NO | — | REFERENCES `orders(id)` ON DELETE CASCADE |
| `reader_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE RESTRICT |
| `writer_id` | uuid | NO | — | REFERENCES `writer_profiles(id)` ON DELETE RESTRICT |
| `transaction_reference_tid` | text | NO | — | |
| `normalized_tid` | text | NO | — | GENERATED ALWAYS AS upper(regexp_replace(...)) STORED |
| `screenshot_url` | text | NO | — | |
| `screenshot_path` | text | YES | NULL | Storage path in `payment-proofs` (0006) |
| `screenshot_public_id` | text | YES | NULL | |
| `paid_amount_claimed_pkr` | numeric(10,2) | YES | NULL | `CHECK (paid_amount_claimed_pkr >= 0)` |
| `sender_account_name` | text | YES | NULL | |
| `reader_note` | text | YES | NULL | |
| `is_duplicate_tid_flagged` | boolean | NO | `false` | **Canonical duplicate flag** (no `is_duplicate_tid`) |
| `duplicate_of_submission_id` | uuid | YES | NULL | REFERENCES `payment_submissions(id)` ON DELETE SET NULL |
| `reviewer_status` | text | NO | `'pending'` | `CHECK (reviewer_status IN ('pending', 'verified', 'rejected'))` |
| `reviewer_note` | text | YES | NULL | |
| `reviewed_by` | uuid | YES | NULL | REFERENCES `profiles(id)` |
| `reviewed_at` | timestamptz | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |

### `public.purchase_entitlements`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `reader_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE CASCADE |
| `novel_id` | uuid | NO | — | REFERENCES `novels(id)` ON DELETE CASCADE |
| `order_id` | uuid | NO | — | UNIQUE REFERENCES `orders(id)` ON DELETE CASCADE |
| `granted_at` | timestamptz | NO | `now()` | |
| `is_revoked` | boolean | NO | `false` | |
| `revoked_reason` | text | YES | NULL | |
*Note:* Enforced by partial unique index `idx_active_purchase_entitlement` on `(reader_id, novel_id) WHERE is_revoked = false`. NO `revoked_at` column.

### `public.sales_ledger` (Append-Only)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `order_id` | uuid | NO | — | REFERENCES `orders(id)` ON DELETE RESTRICT |
| `writer_id` | uuid | NO | — | REFERENCES `writer_profiles(id)` ON DELETE RESTRICT |
| `reader_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE RESTRICT |
| `novel_id` | uuid | NO | — | REFERENCES `novels(id)` ON DELETE RESTRICT |
| `entry_type` | text | NO | — | `CHECK (entry_type IN ('sale_verified', 'refund_adjustment', 'manual_correction'))` |
| `gross_amount_pkr` | numeric(10,2) | NO | — | |
| `commission_rate` | numeric(5,2) | NO | — | `CHECK (commission_rate >= 0 AND <= 100)` |
| `platform_commission_pkr` | numeric(10,2) | NO | — | |
| `writer_net_pkr` | numeric(10,2) | NO | — | **Canonical writer share** (no `writer_payout_pkr`) |
| `original_ledger_entry_id` | uuid | YES | NULL | REFERENCES `sales_ledger(id)` ON DELETE RESTRICT (0006) |
| `commission_invoice_id` | uuid | YES | NULL | REFERENCES `commission_invoices(id)` ON DELETE SET NULL |
| `notes` | text | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |
*Constraints:* Partial unique index `idx_sales_ledger_order_sale_verified` on `(order_id) WHERE entry_type = 'sale_verified'`. `chk_sales_ledger_sum_balance`: `CHECK (platform_commission_pkr + writer_net_pkr = gross_amount_pkr)`. NO `is_reconciled` column (invoice linkage indicated by `commission_invoice_id IS NOT NULL` or `commission_invoice_lines`).

### `public.commission_invoices`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `invoice_number` | text | NO | — | UNIQUE |
| `writer_id` | uuid | NO | — | REFERENCES `writer_profiles(id)` ON DELETE RESTRICT |
| `period_start` | timestamptz | NO | — | |
| `period_end` | timestamptz | NO | — | |
| `total_sales_count` | integer | NO | `0` | `CHECK (total_sales_count >= 0)` |
| `total_gross_pkr` | numeric(12,2) | NO | `0.00` | `CHECK (total_gross_pkr >= 0)` |
| `total_commission_owed_pkr` | numeric(12,2) | NO | `0.00` | `CHECK (total_commission_owed_pkr >= 0)` |
| `amount_settled_pkr` | numeric(12,2) | NO | `0.00` | `CHECK (amount_settled_pkr >= 0)` |
| `status` | commission_invoice_status | NO | `'open'` | |
| `due_date` | timestamptz | YES | NULL | Added in 0017 |
| `voided_at` | timestamptz | YES | NULL | Added in 0017 |
| `voided_by` | uuid | YES | NULL | REFERENCES `profiles(id)` (0017) |
| `void_reason` | text | YES | NULL | Added in 0017 |
| `writer_reported_tid` | text | YES | NULL | |
| `writer_reported_screenshot_url` | text | YES | NULL | |
| `settled_by_admin_id` | uuid | YES | NULL | REFERENCES `profiles(id)` |
| `settled_at` | timestamptz | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |

### `public.commission_invoice_lines` (0017)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `invoice_id` | uuid | NO | — | REFERENCES `commission_invoices(id)` ON DELETE CASCADE |
| `ledger_entry_id` | uuid | NO | — | REFERENCES `sales_ledger(id)` ON DELETE RESTRICT |
| `commission_pkr` | numeric(10,2) | NO | — | |
| `is_voided` | boolean | NO | `false` | |
| `created_at` | timestamptz | NO | `now()` | |
*Index:* Partial unique index `uq_commission_invoice_lines_active_ledger` on `(ledger_entry_id) WHERE (is_voided = false)`.

### `public.commission_payments`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `invoice_id` | uuid | NO | — | REFERENCES `commission_invoices(id)` ON DELETE CASCADE |
| `writer_id` | uuid | NO | — | REFERENCES `writer_profiles(id)` ON DELETE RESTRICT |
| `amount_pkr` | numeric(12,2) | NO | — | `CHECK (amount_pkr > 0)` |
| `transaction_reference` | text | NO | — | |
| `screenshot_url` | text | YES | NULL | |
| `confirmed_by_admin_id` | uuid | YES | NULL | REFERENCES `profiles(id)` |
| `confirmed_at` | timestamptz | YES | NULL | |
| `notes` | text | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |

### `public.platform_payment_methods` (0017)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `method_type` | payment_method_type | NO | — | |
| `account_title` | text | NO | — | |
| `account_number_or_iban` | text | NO | — | |
| `bank_name` | text | YES | NULL | |
| `instructions_note` | text | YES | NULL | |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

### `public.commission_payment_reports` (0017)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `invoice_id` | uuid | NO | — | REFERENCES `commission_invoices(id)` ON DELETE CASCADE |
| `writer_id` | uuid | NO | — | REFERENCES `writer_profiles(id)` ON DELETE RESTRICT |
| `amount_pkr` | numeric(12,2) | NO | — | `CHECK (amount_pkr > 0)` |
| `transaction_reference` | text | NO | — | |
| `normalized_tid` | text | NO | — | |
| `screenshot_path` | text | NO | — | |
| `writer_note` | text | YES | NULL | |
| `status` | text | NO | `'pending'` | `CHECK (status IN ('pending', 'confirmed', 'rejected'))` |
| `is_duplicate_tid` | boolean | NO | `false` | In this table, column is `is_duplicate_tid` |
| `admin_note` | text | YES | NULL | |
| `reviewed_by` | uuid | YES | NULL | REFERENCES `profiles(id)` |
| `reviewed_at` | timestamptz | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |

### `public.disputes`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `order_id` | uuid | NO | — | REFERENCES `orders(id)` ON DELETE CASCADE |
| `raised_by_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE RESTRICT |
| `opened_by` | uuid | YES | NULL | REFERENCES `profiles(id)` ON DELETE RESTRICT (0006) |
| `reason` | text | NO | — | |
| `status` | dispute_status | NO | `'open'` | |
| `resolution_note` | text | YES | NULL | Added in 0006 |
| `admin_resolution_notes` | text | YES | NULL | Legacy column (0002) |
| `resolved_by` | uuid | YES | NULL | REFERENCES `profiles(id)` (0006) |
| `resolved_by_id` | uuid | YES | NULL | Legacy column (0002) |
| `resolved_at` | timestamptz | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

### `public.dispute_messages` (0018)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `dispute_id` | uuid | NO | — | REFERENCES `disputes(id)` ON DELETE CASCADE |
| `author_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE RESTRICT |
| `author_role` | text | NO | — | `CHECK (author_role IN ('admin', 'writer', 'reader'))` |
| `message` | text | NO | — | `CHECK (char_length(trim(message)) > 0 AND <= 2000)` |
| `attachment_path` | text | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |

### `public.refund_requests` (0018)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `order_id` | uuid | NO | — | REFERENCES `orders(id)` ON DELETE RESTRICT |
| `requested_by` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE RESTRICT |
| `requester_role` | text | NO | — | `CHECK (requester_role IN ('writer', 'reader'))` |
| `reason` | text | NO | — | `CHECK (char_length(trim(reason)) > 0)` |
| `evidence_note` | text | YES | NULL | |
| `evidence_path` | text | YES | NULL | |
| `status` | text | NO | `'pending'` | `CHECK (status IN ('pending', 'approved', 'rejected'))` |
| `admin_note` | text | YES | NULL | |
| `reviewed_by` | uuid | YES | NULL | REFERENCES `profiles(id)` |
| `reviewed_at` | timestamptz | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |
*Index:* Partial unique index `uq_refund_requests_pending_order` on `(order_id) WHERE (status = 'pending')`.

### `public.support_requests` (0018)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE RESTRICT |
| `category` | text | NO | — | `CHECK (category IN ('order', 'payment', 'account', 'content', 'other'))` |
| `order_id` | uuid | YES | NULL | REFERENCES `orders(id)` ON DELETE SET NULL |
| `subject` | text | NO | — | `CHECK (char_length(trim(subject)) > 0 AND <= 120)` |
| `body` | text | NO | — | `CHECK (char_length(trim(body)) > 0 AND <= 2000)` |
| `status` | text | NO | `'open'` | `CHECK (status IN ('open', 'answered', 'closed'))` |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

### `public.support_messages` (0018)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `request_id` | uuid | NO | — | REFERENCES `support_requests(id)` ON DELETE CASCADE |
| `author_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE RESTRICT |
| `author_role` | text | NO | — | `CHECK (author_role IN ('admin', 'user'))` |
| `message` | text | NO | — | `CHECK (char_length(trim(message)) > 0 AND <= 2000)` |
| `attachment_path` | text | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |

### `public.notifications`
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE CASCADE |
| `type` | text | NO | `'order_update'` | Added in 0006 |
| `title` | text | NO | — | |
| `message` | text | NO | — | |
| `body` | text | YES | NULL | Added in 0006 |
| `link` | text | YES | NULL | |
| `entity_refs` | jsonb | YES | `'{}'::jsonb` | Added in 0006 |
| `is_read` | boolean | NO | `false` | |
| `read_at` | timestamptz | YES | NULL | Added in 0006 |
| `created_at` | timestamptz | NO | `now()` | |

### `public.notification_preferences` (0018)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `user_id` | uuid | NO | — | PRIMARY KEY REFERENCES `profiles(id)` ON DELETE CASCADE |
| `email_enabled` | boolean | NO | `true` | |
| `updated_at` | timestamptz | NO | `now()` | |

### `public.email_outbox` (0018)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | uuid | NO | — | REFERENCES `profiles(id)` ON DELETE CASCADE |
| `to_email` | text | NO | — | |
| `subject` | text | NO | — | |
| `body_html` | text | NO | — | |
| `body_text` | text | NO | — | |
| `event_type` | text | NO | — | |
| `entity_refs` | jsonb | NO | `'{}'::jsonb` | |
| `status` | text | NO | `'pending'` | `CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped'))` |
| `attempts` | integer | NO | `0` | |
| `last_error` | text | YES | NULL | |
| `sent_at` | timestamptz | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |

### `public.audit_logs` (Append-Only)
| Column | Type | Nullable | Default | Constraints / Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PRIMARY KEY |
| `actor_id` | uuid | YES | NULL | REFERENCES `profiles(id)` ON DELETE SET NULL |
| `actor_role` | text | YES | NULL | |
| `action_type` | text | NO | — | |
| `entity_type` | text | NO | — | |
| `entity_id` | text | NO | — | |
| `previous_state` | jsonb | YES | NULL | |
| `new_state` | jsonb | YES | NULL | |
| `created_at` | timestamptz | NO | `now()` | |

---

## 3. Public Views (0013)

1. `public.public_novels`: Filtered to `status = 'published'`, active author, approved author profile.
2. `public.public_writers`: Filtered to approved authors with at least one published novel.
3. `public.public_genres`: Active genres with real-time published novel count.
4. `public.public_free_preview_chapters`: Free preview chapters (`is_free_preview = true AND is_published = true`) of published novels.

---

## 4. Key Triggers & Security Definer Procedures

- `public.prevent_append_only_mutation()` on `public.sales_ledger` and `public.audit_logs` (BEFORE UPDATE OR DELETE -> RAISE EXCEPTION).
- `public.trg_protect_profile_columns()` on `public.profiles`.
- `public.trg_protect_writer_profile_columns()` on `public.writer_profiles`.
- `public.trg_protect_notification_columns()` on `public.notifications` (restricts update to `is_read`, `read_at`).
- `public.check_duplicate_tid_before_insert()` on `public.payment_submissions`.
- `public.trg_record_chapter_revision()` on `public.chapters`.
- `public.trg_chapters_calculate_word_count()` and `public.trg_chapters_sync_total_chapters()`.
- `public.trg_novels_validate_price()` on `public.novels`.

---

## 5. Storage Buckets & Policies

- `payment-proofs`: **Private** bucket (`public = false`). RLS allows upload by reader under `<order_id>/...` and read by reader/writer/admin.
- `novel-assets`: **Public** bucket (`public = true`). RLS allows upload/update/delete by author in folder `<auth.uid()>/...`.
- `dispute-proofs`: **Private** bucket (`public = false`). Provisioned in 0018.
