# UNB Premium — Terminology Audit: "Commission" → "Platform Fee"

## 1. Executive Summary

- **Objective**: Eliminate every human-visible occurrence of the words "commission" and "کمیشن" across all UI labels, headings, toasts, tooltips, error messages, placeholders, badges, legal pages, emails, notifications, CSV exports, navigation menus, and documentation.
- **Scope**: Replaced with "Platform fee" (title case "Platform Fee" where appropriate, or "Fees: None" on checkout order summary) and Urdu "پلیٹ فارم فیس" (with grammatically correct feminine verb and adjective agreement).
- **Internal Identifiers Invariant**: Zero changes were made to database table names, column names, enums, RPC function signatures, RPC return JSON keys, TypeScript types/interfaces, internal route paths (`/writer/commission`, `/admin/commission`), or audit log action types.
- **Migration**: Numbered migration `supabase/migrations/0035_rename_commission_to_platform_fee.sql` re-created all 21 database functions whose user-facing literals, error messages, notifications, or email bodies referenced "commission" or "کمیشن".

---

## 2. Audit Table: Human-Visible Changes

| File & Line | Old Text | New Text | Language / Category | Grammar / Context Notes |
|:---|:---|:---|:---|:---|
| `src/lib/commission/schemas.ts:32` | `Commission payment reported by author...` | `Platform fee payment reported by author...` | English / Meta | Status description |
| `src/lib/commission/schemas.ts:38` | `Commission payment verified and settled...` | `Platform fee payment verified and settled...` | English / Meta | Status description |
| `src/lib/commission/schemas.ts:44` | `Commission payment overdue...` | `Platform fee payment overdue...` | English / Meta | Status description |
| `src/lib/admin/schemas.ts:16` | `Default commission rate must be between 0% and 100%` | `Default platform fee rate must be between 0% and 100%` | English / Form Validation | Setting validation |
| `src/lib/admin/schemas.ts:19` | `Default unpaid commission limit cannot be negative` | `Default unpaid platform fee limit cannot be negative` | English / Form Validation | Setting validation |
| `src/lib/admin/schemas.ts:38` | `Custom commission rate must be between 0% and 100%` | `Custom platform fee rate must be between 0% and 100%` | English / Form Validation | Setting validation |
| `src/lib/admin/schemas.ts:41` | `Unpaid commission limit cannot be negative` | `Unpaid platform fee limit cannot be negative` | English / Form Validation | Setting validation |
| `src/lib/admin/schemas.ts:44` | `Reason is required when customizing commission terms` | `Reason is required when customizing platform fee terms` | English / Form Validation | Setting validation |
| `src/components/ui/status-badge.tsx:14` | `Commission Accruing` | `Platform Fee Accruing` | English / Badge | Order status |
| `src/components/ui/status-badge.tsx:15` | `کمیشن واجب الادا` | `پلیٹ فارم فیس واجب الادا` | Urdu / Badge | Order status |
| `src/components/ui/status-badge.tsx:21` | `Commission Settled` | `Platform Fee Settled` | English / Badge | Order status |
| `src/components/ui/status-badge.tsx:22` | `کمیشن ادا شدہ` | `پلیٹ فارم فیس ادا شدہ` | Urdu / Badge | Order status |
| `src/components/layout/writer/StudioShellClient.tsx:32` | `Commission` | `Platform Fee` | English / Navigation | Studio sidebar |
| `src/components/layout/admin/AdminShellClient.tsx:41` | `Commission` | `Platform Fee` | English / Navigation | Admin sidebar |
| `src/components/admin/WriterActions.tsx:49` | `Custom commission terms updated` | `Custom platform fee terms updated` | English / Toast | Success toast |
| `src/components/admin/WriterActions.tsx:51` | `Failed to update commission terms` | `Failed to update platform fee terms` | English / Toast | Error toast |
| `src/components/admin/WriterActions.tsx:87` | `Custom Commission Terms` | `Custom Platform Fee Terms` | English / Dialog Title | Writer terms modal |
| `src/components/admin/WriterActions.tsx:94` | `Custom Commission Rate (%)` | `Custom Platform Fee Rate (%)` | English / Form Label | Terms input |
| `src/components/admin/WriterActions.tsx:103` | `Unpaid Commission Limit (PKR)` | `Unpaid Platform Fee Limit (PKR)` | English / Form Label | Limit input |
| `src/components/admin/WriterActions.tsx:107` | `Leave blank to use global default...` | `Leave blank to use global default...` | English / Form Helper | Helper text |
| `src/components/admin/WriterActions.tsx:112` | `Reason for Commission Adjustment` | `Reason for Platform Fee Adjustment` | English / Form Label | Audit reason input |
| `src/components/admin/WriterActions.tsx:118` | `Saving Terms...` / `Save Commission Terms` | `Saving Terms...` / `Save Platform Fee Terms` | English / Button | Action button |
| `src/components/admin/PlatformSettingsForm.tsx:141` | `Default Commission Rate (%)` | `Default Platform Fee Rate (%)` | English / Form Label | Global settings input |
| `src/components/admin/PlatformSettingsForm.tsx:149` | `Applied to novel purchases...` | `Applied to novel purchases...` | English / Form Helper | Platform fee description |
| `src/components/admin/PlatformSettingsForm.tsx:156` | `Default Unpaid Commission Limit (PKR)` | `Default Unpaid Platform Fee Limit (PKR)` | English / Form Label | Threshold input |
| `src/components/admin/PlatformSettingsForm.tsx:164` | `Maximum accrued commission before author payouts are paused` | `Maximum accrued platform fee before author sales are paused` | English / Form Helper | Accurate rule description |
| `src/components/admin/PlatformSettingsForm.tsx:244` | `Changing the default commission rate or unpaid limit...` | `Changing the default platform fee rate or unpaid limit...` | English / Notice | Explanatory banner |
| `src/components/admin/PlatformPaymentMethodsManager.tsx:288` | `e.g., Use this account exclusively for platform commission settlements` | `e.g., Use this account exclusively for platform fee settlements` | English / Placeholder | Field placeholder |
| `src/components/admin/PlatformPaymentMethodsManager.tsx:327` | `Writers will be instructed to remit accrued platform commissions...` | `Writers will be instructed to remit accrued platform fees...` | English / Description | Admin instructions |
| `src/components/admin/AuditLogViewer.tsx:43-53` | Action type strings mapped to display labels | Friendly labels: `Platform Fee Settlement Confirmed`, `Platform Fee Payment Reported`, etc. | English / Viewer | Raw action_type preserved in tech details |
| `src/app/writer/page.tsx:84` | `Action Required: Unpaid Commission Limit Reached` | `Action Required: Unpaid Platform Fee Limit Reached` | English / Banner | Limit warning |
| `src/app/writer/page.tsx:85` | `Your sales are paused because outstanding commission...` | `Your sales are paused because your outstanding platform fee...` | English / Banner Text | Limit warning |
| `src/app/writer/page.tsx:94` | `Commission Due` | `Platform Fee Due` | English / KPI Card | Dashboard stat card |
| `src/app/writer/tips/WriterTipsClient.tsx:132` | `(0% platform commission deducted)` | `(0% platform fee deducted)` | English / Disclaimer | Tip jar breakdown |
| `src/app/writer/orders/WriterOrdersClient.tsx:64` | `اہتمام فیس (کمیشن)` | `پلیٹ فارم فیس` | Urdu / Alert Banner | Order notice |
| `src/app/writer/orders/WriterOrdersClient.tsx:66` | `آرڈر کی تصدیق کے وقت پلیٹ فارم کمیشن (%...` | `آرڈر کی تصدیق کے وقت پلیٹ فارم فیس (%...` + `ریکارڈ ہو گی۔` | Urdu / Alert Banner | Feminine agreement adjusted (`ہو گی`) |
| `src/app/writer/orders/WriterOrdersClient.tsx:254` | `Platform commission will be accrued upon verification` | `Platform fee will be accrued upon verification` | English / Card Note | Order verification modal |
| `src/app/writer/orders/WriterOrdersClient.tsx:317` | `refund does not un-accrue commission` | `refund does not un-accrue platform fee` | English / Notice | Refund policy reminder |
| `src/app/writer/novels/NovelForm.tsx:238` | `Platform Commission ({platformRate}%):` | `Platform Fee ({platformRate}%):` | English / Form Preview | Price breakdown |
| `src/app/writer/earnings/EarningsView.tsx:46` | `Financial summary of all novel sales, platform commission...` | `Financial summary of all novel sales, platform fee...` | English / Subtitle | Page subtitle |
| `src/app/writer/earnings/EarningsView.tsx:55` | `Action Required: Unpaid Commission Limit Exceeded` | `Action Required: Unpaid Platform Fee Limit Exceeded` | English / Alert | Threshold banner |
| `src/app/writer/earnings/EarningsView.tsx:58` | `Your outstanding commission balance...` | `Your outstanding platform fee balance...` | English / Alert | Threshold banner |
| `src/app/writer/earnings/EarningsView.tsx:87` | `Accrued Commission` | `Platform Fee Due` | English / KPI Card | Stat card |
| `src/app/writer/earnings/EarningsView.tsx:158` | `Commission` | `Platform Fee` | English / Table Header | Sales breakdown column |
| `src/app/writer/commission/page.tsx:35` | `Failed to load commission data` | `Failed to load platform fee data` | English / Error Banner | Error state |
| `src/app/writer/commission/CommissionOverviewView.tsx:61` | `Commission & Settlements` | `Platform Fee & Settlements` | English / Page Title | Main overview heading |
| `src/app/writer/commission/CommissionOverviewView.tsx:64` | `Track your sales commissions, review monthly invoices...` | `Track your sales platform fees, review monthly invoices...` | English / Page Subtitle | Overview description |
| `src/app/writer/commission/CommissionOverviewView.tsx:75` | `Accrued Commission` | `Platform Fee Due` | English / KPI Card | Overview card |
| `src/app/writer/commission/CommissionOverviewView.tsx:84` | `Outstanding commission balance for current period` | `Outstanding platform fee balance for current period` | English / KPI Helper | Balance helper |
| `src/app/writer/commission/CommissionOverviewView.tsx:89` | `Commission Rate` | `Platform Fee Rate` | English / KPI Card | Overview card |
| `src/app/writer/commission/CommissionOverviewView.tsx:102` | `Unpaid Limit` | `Unpaid Platform Fee Limit` | English / KPI Card | Overview card |
| `src/app/writer/commission/CommissionOverviewView.tsx:142` | `How Commission Works` | `How the Platform Fee Works` | English / Section Header | Explainer card |
| `src/app/writer/commission/CommissionOverviewView.tsx:144` | `Platform commission is automatically accrued...` | `The platform fee is automatically accrued...` | English / Explainer Step | Explainer step 1 |
| `src/app/writer/commission/CommissionOverviewView.tsx:151` | `Commission Invoices` | `Platform Fee Invoices` | English / List Header | Invoices table header |
| `src/app/writer/commission/[invoiceId]/InvoiceDetailClient.tsx:80` | `COMMISSION STATEMENT` | `PLATFORM FEE STATEMENT` | English / Document Title | Invoice header |
| `src/app/writer/commission/[invoiceId]/InvoiceDetailClient.tsx:152` | `Commission Due` | `Platform Fee Due` | English / Table Column | Statement table column |
| `src/app/writer/commission/[invoiceId]/InvoiceDetailClient.tsx:173` | `Total Commission Owed:` | `Total Platform Fee Owed:` | English / Total Line | Statement total |
| `src/app/writer/commission/[invoiceId]/InvoiceDetailClient.tsx:205` | `Transfer the total commission due...` | `Transfer the total platform fee due...` | English / Instructions | Remittance steps |
| `src/app/writer/agreement/page.tsx:28` | Draft disclaimer added | Notice: Draft — pending legal review | English / Legal Header | Legal compliance rule |
| `src/app/writer/agreement/page.tsx:42-50` | `Platform Commission & Revenue Share` | `Platform Fee & Writer Earnings` + Plain words definition: *"The platform fee is a percentage of each verified sale. It is owed by the author to the platform and is settled separately; readers pay no platform fee."* | English / Agreement Section 2 | Writer agreement clause |
| `src/app/admin/writers/[id]/page.tsx:175` | `Default Platform Commission (%):` | `Default Platform Fee (%):` | English / Info Card | Writer detail card |
| `src/app/admin/writers/[id]/page.tsx:176` | `Unpaid Commission Limit (PKR):` | `Unpaid Platform Fee Limit (PKR):` | English / Info Card | Writer detail card |
| `src/app/admin/writers/page.tsx:45` | `Manage writer applications, verification, and commission rates.` | `Manage writer applications, approval status, and platform fee terms.` | English / Subtitle | Writers list header |
| `src/app/admin/writers/page.tsx:159` | `Commission Terms` | `Platform Fee Terms` | English / Table Column | Writers directory column |
| `src/app/admin/settings/page.tsx:20` | `Manage global platform settings, default commissions...` | `Manage global platform settings, default platform fees...` | English / Page Subtitle | Admin settings header |
| `src/app/admin/tips/page.tsx:24` | `(0% platform commission)` | `(0% platform fee)` | English / Subtitle | Tip jar admin overview |
| `src/app/admin/tips/[id]/AdminTipDetailClient.tsx:114` | `0% platform commission` | `0% platform fee` | English / Card Line | Tip transaction detail |
| `src/app/admin/refunds/AdminRefundsClient.tsx:64` | `Refunds do not adjust commission ledger automatically` | `Refunds do not adjust platform fee ledger automatically` | English / Alert | Refund note |
| `src/app/admin/page.tsx:94` | `Writers Near or Over Commission Threshold` | `Writers Near or Over Platform Fee Threshold` | English / Section Title | Admin dashboard alert card |
| `src/app/admin/page.tsx:132` | `No writers currently over commission warning threshold` | `No writers currently over platform fee warning threshold` | English / Empty State | Admin dashboard card |
| `src/app/admin/invoices/page.tsx:32` | `Failed to load invoices` | `Failed to load platform fee invoices` | English / Error Banner | Invoices list error |
| `src/app/admin/invoices/AdminInvoicesListClient.tsx:40` | `Manage and settle author commission invoices` | `Manage and settle author platform fee invoices` | English / Subtitle | Invoices header |
| `src/app/admin/invoices/AdminInvoicesListClient.tsx:46` | `Commission Overview` | `Platform Fee Overview` | English / Navigation Button | Invoices action button |
| `src/app/admin/invoices/[id]/AdminInvoiceDetailClient.tsx:75` | `Commission Owed` | `Platform Fee Owed` | English / KPI Card | Admin invoice detail |
| `src/app/admin/invoices/[id]/AdminInvoiceDetailClient.tsx:153` | `Commission Due` | `Platform Fee Due` | English / Table Column | Admin invoice line items |
| `src/app/admin/invoices/[id]/AdminInvoiceDetailClient.tsx:220` | `Confirm settlement of commission invoice...` | `Confirm settlement of platform fee invoice...` | English / Confirm Dialog | Settle invoice modal |
| `src/app/admin/commission/page.tsx:34` | `Failed to load commission data` | `Failed to load platform fee data` | English / Error Banner | Commission page error |
| `src/app/admin/commission/AdminCommissionOverviewClient.tsx:46` | `Platform Commission Management` | `Platform Fee Management` | English / Page Title | Overview header |
| `src/app/admin/commission/AdminCommissionOverviewClient.tsx:48` | `Monitor author commissions, generate invoices...` | `Monitor author platform fees, generate invoices...` | English / Page Subtitle | Overview subtitle |
| `src/app/admin/commission/AdminCommissionOverviewClient.tsx:150` | `Adjust Commission` | `Adjust Platform Fee` | English / Modal Title | Ledger adjustment modal |
| `src/app/admin/commission/AdminCommissionOverviewClient.tsx:154` | `Apply a manual credit or debit to the author's accrued commission` | `Apply a manual credit or debit to the author's accrued platform fee` | English / Dialog Description | Ledger adjustment modal |
| `src/app/admin/commission/reports/page.tsx:32` | `Failed to load commission reports` | `Failed to load platform fee reports` | English / Error Banner | Reports page error |
| `src/app/admin/commission/reports/AdminCommissionReportsClient.tsx:33` | `Back to Commission` | `Back to Platform Fee` | English / Back Link | Reports navigation |
| `src/app/admin/commission/reports/AdminCommissionReportsClient.tsx:41` | `Monthly and per-writer commission reports and ledger export` | `Monthly and per-writer platform fee reports and ledger export` | English / Subtitle | Reports header |
| `src/app/admin/commission/writers/[id]/page.tsx:37` | `Failed to load writer commission detail` | `Failed to load writer platform fee detail` | English / Error Banner | Writer commission error |
| `src/app/admin/commission/writers/[id]/AdminWriterCommissionDetailClient.tsx:55` | `Commission adjustment recorded successfully` | `Platform fee adjustment recorded successfully` | English / Toast | Adjustment toast |
| `src/app/admin/commission/writers/[id]/AdminWriterCommissionDetailClient.tsx:128` | `Accrued Commission` | `Platform Fee Due` | English / KPI Card | Writer fee detail card |
| `src/app/admin/commission/writers/[id]/AdminWriterCommissionDetailClient.tsx:170` | `Commission` | `Platform Fee` | English / Table Column | Writer fee lines |
| `src/app/admin/commission/writers/[id]/AdminWriterCommissionDetailClient.tsx:215` | `Adjust Accrued Commission` | `Adjust Accrued Platform Fee` | English / Modal Title | Writer fee adjustment |
| `src/app/api/writer/export-sales/route.ts:46` | `'Commission Rate (%)', 'Commission (PKR)'` | `'Platform Fee Rate (%)', 'Platform Fee (PKR)'` | English / CSV Header | Exported CSV columns |
| `src/app/(marketplace)/checkout/[slug]/CheckoutForm.tsx:326` | `Platform Fee: Free (PKR 0)` | `Fees: None (PKR 0)` | English / Checkout Summary | Reader checkout line |
| `src/app/(marketplace)/tips/page.tsx:30` | `100% goes directly to the author with 0% platform commission` | `100% goes directly to the author with no platform fee` | English / Tip Jar Copy | Reader tip jar page |
| `src/app/(marketplace)/terms/page.tsx:15` | Draft notice added | Draft — pending legal review | English / Legal Header | Terms page |
| `src/app/(marketplace)/terms/page.tsx:45` | `Platform Commission & Pricing` | `Platform Fee & Author Settlements` + Plain language fee definition | English / Legal Section 4 | Terms & conditions |
| `src/app/(marketplace)/terms/page.tsx:64` | `Platform commissions already accrued...` | `Platform fees already accrued...` | English / Legal Section 6 | Terms refund clause |
| `src/app/(marketplace)/privacy/page.tsx:53` | `and track platform commission obligations` | `and track platform fee obligations` | English / Privacy Policy | Financial data disclosure |
| `src/app/(marketplace)/refund-policy/page.tsx:43` | `the associated platform commission accrual is not reversed` | `the associated platform fee accrual is not reversed` | English / Refund Policy | Platform fee non-reversal clause |
| `src/app/(marketplace)/faq/page.tsx:17` | Draft notice added | Draft — pending legal review | English / Legal Header | FAQ page |
| `src/app/(marketplace)/faq/page.tsx:48` | `What is the platform commission rate?` | `What is the platform fee rate?` + Plain words definition | English / FAQ Question 4 | Marketplace FAQ |
| `src/app/(marketplace)/how-it-works/page.tsx:48` | `The platform commission (default 20%) is tracked transparently` | `The platform fee (default 20%) is tracked transparently` | English / Step 3 | Marketplace explainer |
| `src/app/(marketplace)/become-a-writer/page.tsx:42` | `transparent commission reconciliation` | `transparent platform fee reconciliation` | English / Feature List | Writer recruitment page |
| `src/app/(marketplace)/become-a-writer/become-writer-form.tsx:112` | `Agree to platform commission schedule` | `Agree to platform fee schedule` | English / Checkbox Label | Writer registration |
| `src/app/(marketplace)/account/notifications/NotificationPreferencesClient.tsx:63` | `Commission Invoices & Overdue Warnings` | `Platform Fee Invoices & Overdue Warnings` | English / Settings Option | User notification prefs |
| `src/app/(marketplace)/dev/fonts/DevFontTesterClient.tsx:111` | `20% پلیٹ فارم کمیشن` | `20% پلیٹ فارم فیس` | Urdu / Font Test String | Nastaliq sample string |
| `src/config/site.ts:182-192` | `Commission Ledger`, `کمیشن لیجر`, `Commission Remittance`, `Commission & Payout Policy` | `Platform Fee Ledger`, `پلیٹ فارم فیس لیجر`, `Platform Fee Remittance`, `Platform Fee & Payout Policy` | English & Urdu / Site Nav | Navigation config |
| `src/lib/copy/tips.ts:32` | `UNB Premium takes no cut or commission` | `UNB Premium takes no cut or platform fee` | English / Tip Policy | Tip jar copy constant |
| `supabase/tests/10_commission_tests.sql:490` | `Assert notification body mentions commission limit` | `Assert notification body mentions platform fee limit` | English / SQL Test Comment | Test expectation |
| `tests/admin-schemas.test.ts:26` | `rejects commission rate over 100% or below 0%` | `rejects platform fee rate over 100% or below 0%` | English / Test Description | Unit test suite |
| `tests/commission-unit.test.ts:12` | `Commission & Settlement Domain Helpers` | `Platform Fee & Settlement Domain Helpers` | English / Test Suite | Unit test suite |
| `tests/commission-unit.test.ts:66` | `Commission Schemas Validation` | `Platform Fee Schemas Validation` | English / Test Suite | Unit test suite |
| `docs/TIPS_COPY_REVIEW.md:8` | `0% Commission Disclosure` | `0% Platform Fee Disclosure` | English / Documentation | Tip jar review doc |

---

## 3. Urdu Grammatical Agreement Rationale

In the Urdu language, the grammatical gender of loan words or concepts determines verb and adjectival conjugations.
- **Noun Gender**: "فیس" (Fee) is strictly **feminine** (مؤنث) in Urdu idiom and formal lexicography (unlike "کمیشن" which was colloquially treated as masculine by some speakers).
- **Conjugation Changes Applied**:
  1. **Future tense verb**:
     - *Masculine form (old/incorrect)*: `ریکارڈ ہو گا۔`
     - *Feminine form (new/applied)*: `ریکارڈ ہو گی۔`
     - *Full sentence (`WriterOrdersClient.tsx`)*: `آرڈر کی تصدیق کے وقت پلیٹ فارم فیس (%... کے مطابق) خودکار طور پر لیجر میں ریکارڈ ہو گی۔`
  2. **Compound predicate (completed state)**:
     - *Masculine form (old/incorrect)*: `واجب الادا پلیٹ فارم فیس مقررہ حد تک پہنچ چکا ہے۔`
     - *Feminine form (new/applied in SQL notification triggers)*: `آپ کی واجب الادا پلیٹ فارم فیس مقررہ حد تک پہنچ چکی ہے۔`
  3. **Reader Checkout Distinction**:
     - Readers pay zero fee. Calling it "پلیٹ فارم فیس: مفت" would cause readers to confuse writer obligations with reader costs. Instead, reader checkout reads: `کوئی اضافی فیس نہیں` ("No additional fee").

---

## 4. Register of Deliberately Unchanged Internal Identifiers

Per project architectural guidelines, the following internal identifiers remain strictly unchanged. Modifying any of these would violate backwards compatibility, break database triggers/RLS, or corrupt historical ledger entries:

### 4.1 Database Objects
- **Tables**:
  - `public.commission_invoices`
  - `public.sales_ledger`
- **Columns**:
  - `sales_ledger.commission_rate_applied`
  - `sales_ledger.commission_amount_pkr`
  - `platform_settings.default_commission_rate`
  - `platform_settings.default_unpaid_commission_limit`
  - `writer_profiles.custom_commission_rate`
  - `writer_profiles.unpaid_commission_limit`
  - `writer_profiles.current_unpaid_commission`
  - `writer_profiles.is_orders_paused_for_commission`
  - `orders.applied_commission_rate`
  - `orders.calculated_commission_pkr`
  - `commission_invoices.total_commission_owed_pkr`
- **Enums & Types**:
  - `public.commission_invoice_status` (`draft`, `issued`, `payment_reported`, `settled`, `overdue`, `cancelled`, `void`)
- **Functions / Stored Procedures / RPCs**:
  - `public.calculate_commission`
  - `public.report_commission_payment`
  - `public.confirm_commission_settlement`
  - `public.record_commission_adjustment`
  - `public.issue_commission_invoice`
  - `public.void_commission_invoice`
  - `public.check_unpaid_commission_threshold`
- **Audit Action Types**:
  - `CONFIRM_COMMISSION_SETTLEMENT`
  - `REPORT_COMMISSION_PAYMENT`
  - `RECORD_COMMISSION_ADJUSTMENT`
  - `ISSUE_COMMISSION_INVOICE`
  - `VOID_COMMISSION_INVOICE`
- **RLS Policies**:
  - All row-level security policies referencing `commission_invoices` or ledger tables.

### 4.2 TypeScript Types, Interfaces, & Code Paths
- `CommissionInvoice` type and `CommissionInvoiceStatus` enum.
- `writerCommissionTermsSchema`, `reportCommissionPaymentSchema`, `confirmCommissionSettlementSchema`, `recordCommissionAdjustmentSchema`.
- Route directory paths:
  - `src/app/writer/commission/*`
  - `src/app/admin/commission/*`
  - `src/app/admin/invoices/*`
- API endpoints:
  - `/api/writer/export-sales`
- Utility folder:
  - `src/lib/commission/*`
