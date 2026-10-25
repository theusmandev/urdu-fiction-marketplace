# Browser DevTools Security Verification Guide

This guide contains concrete client attack snippets you can paste directly into the browser DevTools console while logged in as a regular writer (or reader) to verify that PostgREST and the database reject every privilege escalation and tampering attempt.

---

## 1. Setup in Browser

1. Navigate to the marketplace application (e.g. `http://localhost:3000/writer` or your staging/production URL).
2. Sign in as a **normal writer** (non-admin).
3. Open DevTools (**F12** or **Ctrl+Shift+I**), switch to the **Console** tab.
4. If your app exposes the Supabase client or if you import it, initialize the client handle:
   ```javascript
   // If supabase client is available globally or can be created:
   // You can get the active session token from localStorage:
   const authKey = Object.keys(localStorage).find(k => k.includes('auth-token'));
   const session = authKey ? JSON.parse(localStorage.getItem(authKey)) : null;
   const token = session?.access_token;
   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || window.location.origin;
   const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
   console.log("Logged in user:", session?.user?.email, "| UID:", session?.user?.id);
   ```

*(Alternatively, use `window.__supabase` or paste the helper snippet from your client package).*

---

## 2. Test Suite: Client Attacks & Expected Errors

### Attack 1: Self-Approving Writer Status
**Objective**: A pending or suspended author attempts to approve their own account.
```javascript
const myId = session.user.id;
const { data, error } = await supabase
  .from('writer_profiles')
  .update({ status: 'approved' })
  .eq('id', myId);
console.log({ data, error });
```
- **Expected Status**: FAILED / Rejected
- **Expected Error**:
  ```json
  {
    "code": "42501",
    "message": "permission denied for table writer_profiles"
  }
  ```
- **Explanation**: Migration 0024 revoked full `UPDATE` on `writer_profiles` from role `authenticated` and granted UPDATE only for safe columns (`pen_name_urdu`, `pen_name_english`, `bio_urdu`, `bio_english`, `agreement_accepted_at`). The PostgreSQL planner rejects the statement before triggers even execute.

---

### Attack 2: Zeroing Unpaid Commission Balance
**Objective**: Author attempts to reset their accrued platform commission to avoid platform fee settlement.
```javascript
const { data, error } = await supabase
  .from('writer_profiles')
  .update({ current_unpaid_commission: 0.00 })
  .eq('id', session.user.id);
console.log({ data, error });
```
- **Expected Status**: FAILED / Rejected
- **Expected Error**:
  ```json
  {
    "code": "42501",
    "message": "permission denied for table writer_profiles"
  }
  ```
- **Explanation**: Column privilege denied. Even if column grants were open, `trg_protect_writer_profile_columns` raises `"Unauthorized: Unpaid commission balance is managed exclusively by ledger reconciliation."`.

---

### Attack 3: Forcing 0% Platform Commission Rate
**Objective**: Author attempts to set their commission rate to 0%.
```javascript
const { data, error } = await supabase
  .from('writer_profiles')
  .update({ custom_commission_rate: 0.00 })
  .eq('id', session.user.id);
console.log({ data, error });
```
- **Expected Status**: FAILED / Rejected
- **Expected Error**: `permission denied for table writer_profiles` (`42501`).

---

### Attack 4: Privilege Escalation to Platform Admin
**Objective**: Writer or reader attempts to promote their account to platform administrator.
```javascript
const { data, error } = await supabase
  .from('profiles')
  .update({ role: 'admin' })
  .eq('id', session.user.id);
console.log({ data, error });
```
- **Expected Status**: FAILED / Rejected
- **Expected Error**:
  ```json
  {
    "code": "42501",
    "message": "permission denied for table profiles"
  }
  ```
- **Explanation**: Column-level privilege restriction on `public.profiles` permits updates only to `full_name`, `username`, and `avatar_url`. Role modification is strictly rejected.

---

### Attack 5: Direct Modification of Orders Table
**Objective**: Writer attempts to bypass `verify_order_payment` and directly mark an order as `verified`.
```javascript
const { data, error } = await supabase
  .from('orders')
  .update({ status: 'verified' })
  .eq('writer_id', session.user.id);
console.log({ data, error });
```
- **Expected Status**: FAILED / Rejected
- **Expected Error**:
  ```json
  {
    "code": "42501",
    "message": "permission denied for table orders"
  }
  ```
- **Explanation**: Migration 0008/0020 revoked direct table mutations on financial tables (`orders`, `sales_ledger`, `purchase_entitlements`, `commission_invoices`) from `authenticated`. All state transitions require atomic SECURITY DEFINER RPCs.

---

### Attack 6: Calling Admin-Only RPC (`admin_list_orders`)
**Objective**: Non-admin caller attempts to invoke the platform administrator order listing procedure.
```javascript
const { data, error } = await supabase
  .rpc('admin_list_orders', { p_limit: 10, p_offset: 0 });
console.log({ data, error });
```
- **Expected Status**: FAILED / Rejected
- **Expected Error**:
  ```json
  {
    "code": "P0001",
    "message": "Restricted: Only platform administrators can view order audits."
  }
  ```

---

### Attack 7: Invoking Cross-Writer Financial RPCs
**Objective**: Writer attempts to inspect another author's unpaid commission balance via `get_writer_unpaid_commission`.
```javascript
const victimWriterId = '00000000-0000-0000-0000-000000000000'; // Replace with another writer's UUID
const { data, error } = await supabase
  .rpc('get_writer_unpaid_commission', { p_writer_id: victimWriterId });
console.log({ data, error });
```
- **Expected Status**: FAILED / Rejected
- **Expected Error**:
  ```json
  {
    "code": "42501",
    "message": "permission denied for function get_writer_unpaid_commission"
  }
  ```
- **Explanation**: Migration 0024 revoked EXECUTE on `get_writer_unpaid_commission` and `reconcile_writer_unpaid_commission` from `authenticated`. These functions cannot be invoked directly over HTTP via PostgREST.

---

### Attack 8: Cross-Writer Payment Method Sniffing
**Objective**: Writer attempts to inspect bank details / IBANs of other authors.
```javascript
const { data, error } = await supabase
  .from('writer_payment_methods')
  .select('*')
  .neq('writer_id', session.user.id);
console.log({ data, error });
```
- **Expected Status**: SUCCESS with EMPTY DATA
- **Expected Result**:
  ```json
  {
    "data": [],
    "error": null
  }
  ```
- **Explanation**: Row-Level Security policy `"Writers view own payment methods"` restricts SELECT to `auth.uid() = writer_id`. The database filters out all competitor rows.

---

### Attack 9: Direct UPDATE on Published Novel Status
**Objective**: Writer attempts to bypass novel review lifecycle and force status to `draft` or `published`.
```javascript
const { data, error } = await supabase
  .from('novels')
  .update({ status: 'draft' })
  .eq('writer_id', session.user.id);
console.log({ data, error });
```
- **Expected Status**: FAILED / Rejected
- **Expected Error**:
  ```json
  {
    "code": "42501",
    "message": "permission denied for table novels"
  }
  ```
- **Explanation**: Column-level privilege restriction on `public.novels` excludes `status` and `slug`.

---

### Attack 10: Setting Novel Price Below Platform Minimum
**Objective**: Writer attempts to update an allowed column (`price_pkr`) to an illegal value (PKR 25, below the platform minimum of PKR 50).
```javascript
const { data, error } = await supabase
  .from('novels')
  .update({ price_pkr: 25.00 })
  .eq('writer_id', session.user.id);
console.log({ data, error });
```
- **Expected Status**: FAILED / Rejected
- **Expected Error**:
  ```json
  {
    "code": "P0001",
    "message": "Novel price (PKR 25.00) cannot be below the platform minimum of PKR 50."
  }
  ```
- **Explanation**: While `price_pkr` is on the allowed column list, Layer 2 defense (`trg_novels_validate_price` BEFORE UPDATE trigger) catches the constraint violation and halts execution.
