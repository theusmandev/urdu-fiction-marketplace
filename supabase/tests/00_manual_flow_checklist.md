# End-to-End Manual Browser Testing Runbook

This checklist guides manual verification of the core reader-to-writer payment and entitlement lifecycle in UNB Premium. Use this checklist after applying database migrations and running `supabase/tests/00_post_migration_verification.sql`.

---

## Prerequisites (Initial Bootstrap via Supabase SQL Editor / Dashboard)
1. **User Account A (Writer)**:
   - Registered in auth (`auth.users`).
   - Profile role set to `'writer'` (`UPDATE profiles SET role = 'writer' WHERE id = '...';`).
   - Writer profile approved (`UPDATE writer_profiles SET status = 'approved', approved_at = now() WHERE id = '...';`).
   - At least 1 active payment method added (JazzCash, EasyPaisa, or Bank Account).
2. **User Account B (Reader 1)**:
   - Registered in auth (`auth.users`).
   - Profile role is `'reader'`.
3. **User Account C (Reader 2 - Unauthorized)**:
   - Registered in auth (`auth.users`).
   - Profile role is `'reader'`.
4. **User Account D (Admin)**:
   - Profile role set to `'admin'` (`UPDATE profiles SET role = 'admin' WHERE id = '...';`).

---

## Step-by-Step Flow Checklist

### Step 1: Writer Creates and Publishes Novel with Chapters
- **Actor**: Writer (Account A)
- **URL**: `/writer/novels/new` and `/writer/novels/[id]/chapters`
- **Actions**:
  1. Fill in Urdu title, English title, synopsis, price (e.g. `PKR 500`), upload a cover image. Click "Save Draft".
  2. Add Chapter 1: Mark as **Free Preview** (`is_free_preview = true`), enter Urdu content.
  3. Add Chapter 2: Mark as **Paid** (`is_free_preview = false`), enter confidential Urdu chapter content.
  4. Publish both chapters and submit novel for approval, or publish novel directly via Admin (`approve_novel`).
- **RPC / Query Called**:
  - `public.create_novel_draft` or `INSERT INTO public.novels`
  - `public.approve_novel(p_novel_id, p_metadata)` (Admin or direct publishing)
  - `public.get_public_novel_chapters(p_novel_slug)`
- **Expected Result**:
  - Novel page at `/novels/[slug]` loads successfully.
  - Cover image renders cleanly (no empty placeholder).
  - Chapter list displays both chapters. Chapter 1 is labeled "Free Preview" / مفت پیش منظر. Chapter 2 has a lock icon / مقفل.
- **If It Fails**: Check `next.config.ts` remote patterns or verify `get_public_novel_chapters` enum casts.

---

### Step 2: Reader Discovers Novel & Initiates Checkout
- **Actor**: Reader 1 (Account B)
- **URL**: `/novels/[slug]` -> Click "Buy Novel" -> `/checkout/[slug]`
- **Actions**:
  1. Inspect the checkout page: verify novel cover, title, author pen name, and price breakdown.
  2. Select writer's payment method (e.g. JazzCash).
  3. Click "Generate Order" / "Create Order".
- **RPC / Query Called**:
  - `public.get_checkout_options(p_slug)`
  - `public.create_order(p_novel_id, p_payment_method_id)`
- **Expected Result**:
  - Order is created with status `pending_payment`.
  - Browser automatically redirects to `/orders/[order_number]` (e.g. `/orders/ORD-2026-XXXX`).
  - No database error regarding `orders.payment_method` or `cover_image_url`.
- **If It Fails**: Check `create_order` RPC definition in migration `0019`.

---

### Step 3: Reader Submits Offline Payment Proof
- **Actor**: Reader 1 (Account B)
- **URL**: `/orders/[order_number]`
- **Actions**:
  1. Note writer's payment details (Account Title, Account Number/IBAN, Bank Name).
  2. In the payment submission card, enter a test Transaction Reference ID (e.g. `TID-9876543210`).
  3. Upload a payment screenshot (JPEG/PNG/WebP).
  4. Click "Submit Payment Proof".
- **RPC / Query Called**:
  - Storage upload to private bucket: `storage.from('payment-proofs').upload(...)`
  - `public.submit_payment_proof(p_order_id, p_tid, p_screenshot_path, p_amount, ...)`
- **Expected Result**:
  - Order status updates from `pending_payment` to `payment_submitted`.
  - Banner informs reader: "Payment proof submitted. Waiting for author verification."
  - Screenshot file is safely stored in private `payment-proofs` bucket.
- **If It Fails**: Check private bucket permissions or `is_duplicate_tid_flagged` column handling.

---

### Step 4: Writer Inspects Proof and Verifies Order
- **Actor**: Writer (Account A)
- **URL**: `/writer/orders`
- **Actions**:
  1. Writer navigates to orders dashboard. Locate the new pending order.
  2. Open order details or proof preview modal. Verify TID and screenshot.
  3. Click "Verify Payment & Release Access" / "Verify Order".
- **RPC / Query Called**:
  - `public.verify_order_payment(p_order_id, p_notes)`
- **Expected Result**:
  - Order status transitions atomically to `verified`.
  - Exactly 1 new row created in `public.purchase_entitlements` (`is_revoked = false`).
  - Exactly 1 ledger row inserted in `public.sales_ledger` with `entry_type = 'sale_verified'`, recording `amount_pkr`, `platform_commission_pkr`, and `writer_net_pkr`.
  - Writer's `current_unpaid_commission` in `writer_profiles` increments by the platform commission.
  - Notification sent to Reader 1.
- **If It Fails**: Check `verify_order_payment` atomic transaction and ledger column names.

---

### Step 5: Reader 1 Accesses Novel in Library & Opens Reader
- **Actor**: Reader 1 (Account B)
- **URL**: `/library` -> Click novel -> `/read/[novelSlug]/[chapterNumber]`
- **Actions**:
  1. Open `/library`. Confirm the novel appears under "My Library" with "Purchased" badge.
  2. Click on the novel and open Chapter 2 (Paid Chapter).
- **RPC / Query Called**:
  - `public.get_reader_library()`
  - `public.get_chapter_for_reader(p_novel_slug, p_chapter_number)`
- **Expected Result**:
  - Reader UI opens Chapter 2 in Nastaliq font without clipping.
  - Full chapter content is displayed.
  - No error regarding `chapters.title_english`.
- **If It Fails**: Check `get_chapter_for_reader` definition in migration `0019`.

---

### Step 6: Security Boundary Test — Reader 2 (Unauthorized) Cannot Read Chapter
- **Actor**: Reader 2 (Account C - has NOT purchased novel)
- **URL**: Direct navigation to `/read/[novelSlug]/2`
- **Actions**:
  1. Log in as Reader 2.
  2. Paste direct URL to Chapter 2 of Reader 1's purchased novel.
- **RPC / Query Called**:
  - `public.get_chapter_for_reader(p_novel_slug, 2)`
- **Expected Result**:
  - Access is strictly denied with an entitlement error: "You must purchase this novel to access this chapter."
  - Zero chapter content returned.
  - Direct database select on `chapters` via Supabase client fails due to RLS.
- **If It Fails**: Check RLS policy on `public.chapters` (`chapters_read_access`).

---

### Step 7: Admin Orders & Order Detail View
- **Actor**: Admin (Account D)
- **URL**: `/admin/orders` -> click on the verified order
- **Actions**:
  1. Navigate to `/admin/orders`. Verify order appears with status filter `verified`.
  2. Open order detail page.
- **RPC / Query Called**:
  - `public.admin_list_orders(p_status, p_limit, p_offset, p_search)`
  - `public.admin_get_order(p_order_id)`
- **Expected Result**:
  - Order list renders without `order_status = text` operator error.
  - Order detail shows: TID flag (`is_duplicate_tid_flagged`), financial breakdown (`amount_pkr`, `platform_commission_pkr`, `writer_net_pkr`), reader masked identifier, and ledger status.
  - No column errors regarding `cancelled_at`, `writer_payout_pkr`, or `is_reconciled`.
- **If It Fails**: Check `admin_list_orders` and `admin_get_order` RPCs in migration `0019`.

---

### Step 8: Platform Commission Invoice Generation
- **Actor**: Admin (Account D)
- **URL**: `/admin/commission`
- **Actions**:
  1. Inspect writers with unpaid commission balance.
  2. Select Writer A and generate invoice (or run `generate_commission_invoice`).
- **RPC / Query Called**:
  - `public.get_writer_unpaid_commission(p_writer_id)`
  - `public.generate_commission_invoice(p_writer_id, p_due_date)`
- **Expected Result**:
  - Invoice row created in `public.commission_invoices` with status `issued`.
  - Relevant `sales_ledger` rows have `commission_invoice_id` updated (without modifying gross/net fields).
  - No attempt to execute direct `UPDATE` on protected financial columns.
- **If It Fails**: Check `generate_commission_invoice` logic.

---

## Reporting Issues
If any step above fails:
1. Note the exact step number (e.g. "Step 2 failed on click Generate Order").
2. Copy the exact browser console error message and network response status.
3. Check the Supabase Database Logs (Dashboard > Logs > Postgres Logs).
4. Run `supabase/tests/00_post_migration_verification.sql` to identify any failing assertions.
