# UNB Premium — Terminology & Nomenclature Guide

## 1. Core Business Decision & Invariant

As of migration `0035_rename_commission_to_platform_fee.sql`:
> **The word "commission" (and Urdu "کمیشن") must NEVER appear anywhere a user can read it.**
> The underlying financial model and database architecture remain identical: a percentage of each verified reader sale is owed by the writer to the platform, accrued in the append-only ledger, invoiced, reported, and settled.
> User-facing copy across English and Urdu exclusively uses **"Platform fee"** (Urdu: **پلیٹ فارم فیس**).

---

## 2. Terminology Mapping: User-Facing Term ↔ Internal Identifier

This reference ensures that developers, engineers, and support staff can seamlessly cross-reference between frontend UI text, error notifications, legal documentation, and backend/database constructs.

| User-Facing Term (English) | User-Facing Term (Urdu) | Internal Database / Code Identifier | Category | Context / Notes |
|:---|:---|:---|:---|:---|
| **Platform fee** | پلیٹ فارم فیس | `commission` | Concept / Noun | General concept of platform share |
| **Platform fee rate** | پلیٹ فارم فیس کی شرح | `commission_rate`, `defaultCommissionRate`, `customCommissionRate` | Setting / Column | Percentage rate (e.g. 20%) |
| **Platform fee due** / **Outstanding platform fee** | واجب الادا پلیٹ فارم فیس | `accrued_commission`, `outstanding_commission_balance` | Metric / Column | Unsettled fee balance accrued by writer |
| **Unpaid platform fee limit** | غیر ادا شدہ پلیٹ فارم فیس کی حد | `unpaid_commission_limit`, `defaultUnpaidCommissionLimit` | Setting / Column | Threshold before writer account restriction (e.g. PKR 5,000) |
| **Platform fee invoice** / **Platform fee statement** | پلیٹ فارم فیس انوائس / اسٹیٹمنٹ | `commission_invoices`, `commission_invoice_status` | Table / Enum | Periodic billing statement issued to writer |
| **Platform fee settlement** | پلیٹ فارم فیس سیٹلمنٹ | `confirm_commission_settlement`, `CONFIRM_COMMISSION_SETTLEMENT` | RPC / Audit Action | Admin verification of writer fee transfer |
| **Platform fee payment report** | پلیٹ فارم فیس ادائیگی رپورٹ | `report_commission_payment`, `REPORT_COMMISSION_PAYMENT` | RPC / Audit Action | Writer reporting bank/wallet transfer reference |
| **Platform fee adjustment** | پلیٹ فارم فیس ایڈجسٹمنٹ | `record_commission_adjustment`, `RECORD_COMMISSION_ADJUSTMENT` | RPC / Audit Action | Admin credit/debit ledger correction |
| **Platform fee ledger / column** | پلیٹ فارم فیس | `sales_ledger.commission_amount_pkr`, `platform_commission` | Ledger Column | Ledger transaction line entry |
| **Platform fee summary / reports** | پلیٹ فارم فیس سمری / رپورٹس | `/admin/commission/reports`, `get_writer_commission_summary` | Route / View | Aggregated reporting |
| **Fees: None (PKR 0)** | کوئی اضافی فیس نہیں | Checkout summary row (reader) | UI Component | Reader checkout line (distinct from writer fee) |
| **No platform fee (Tip Jar)** | کوئی پلیٹ فارم فیس نہیں | Tip Jar policy / copy | Marketing / UI | 100% tip goes directly to writer |

---

## 3. Deliberately Unchanged Internal Identifiers (Do NOT Rename)

Per project architecture rules, the following are strictly **preserved internal identifiers**:

### Database Schema Objects
- **Tables**: `public.commission_invoices`, `public.sales_ledger` (columns: `commission_rate_applied`, `commission_amount_pkr`)
- **Settings Columns**: `public.platform_settings.default_commission_rate`, `public.platform_settings.default_unpaid_commission_limit`, `public.writer_profiles.custom_commission_rate`, `public.writer_profiles.unpaid_commission_limit`
- **Enums**: `public.commission_invoice_status` (`draft`, `issued`, `payment_reported`, `settled`, `overdue`, `cancelled`, `void`)
- **Audit Action Types**: `CONFIRM_COMMISSION_SETTLEMENT`, `REPORT_COMMISSION_PAYMENT`, `RECORD_COMMISSION_ADJUSTMENT`, `ISSUE_COMMISSION_INVOICE`, `VOID_COMMISSION_INVOICE`
- **Functions / RPCs**:
  - `public.calculate_commission(...)`
  - `public.report_commission_payment(...)`
  - `public.confirm_commission_settlement(...)`
  - `public.record_commission_adjustment(...)`
  - `public.issue_commission_invoice(...)`
  - `public.void_commission_invoice(...)`
  - `public.check_unpaid_commission_threshold(...)`
- **RLS Policies**: All policies referencing `commission_invoices` or ledger relationships.

### TypeScript & Application Identifiers
- **Schemas**: `writerCommissionTermsSchema`, `reportCommissionPaymentSchema`, `confirmCommissionSettlementSchema`, `recordCommissionAdjustmentSchema`
- **Types**: `CommissionInvoice`, `CommissionInvoiceStatus`, `CommissionTerms`
- **File & Route Paths**:
  - Web routes: `/writer/commission`, `/writer/commission/[invoiceId]`, `/admin/commission`, `/admin/commission/reports`, `/admin/commission/writers/[id]`, `/admin/invoices`, `/admin/invoices/[id]`
  - API routes: `/api/writer/export-sales`
  - Module directories: `src/lib/commission/*`

---

## 4. Urdu Grammar & Linguistic Guidelines

When translating or authoring Urdu strings referencing "پلیٹ فارم فیس":
1. **Grammatical Gender**: "فیس" (Fee) is grammatically **feminine** in Urdu.
   - **Correct**: پلیٹ فارم فیس ریکارڈ ہو **گی** (Platform fee will be recorded)
   - **Incorrect**: پلیٹ فارم فیس ریکارڈ ہو **گا** (Masculine agreement)
   - **Correct**: واجب الادا پلیٹ فارم فیس مقررہ حد تک پہنچ **چکی ہے**
   - **Incorrect**: واجب الادا پلیٹ فارم فیس مقررہ حد تک پہنچ **چکا ہے**
2. **Reader vs. Writer Clarity**:
   - Readers pay **zero** platform fee. In the reader checkout summary, use:
     - English: `Fees: None (PKR 0)`
     - Urdu: `فیس: کوئی اضافی فیس نہیں (0 روپے)`
   - Avoid calling checkout fees "Platform fee" to eliminate confusion between readers and authors.

---

## 5. Automated CI Verification

Automated checks enforce this terminology rule:
- `npm run check:terms`: Scans `src/` JSX text, string literals, toasts, and new migration SQL literals to fail immediately if "commission" or "کمیشن" is reintroduced in user-facing contexts.
