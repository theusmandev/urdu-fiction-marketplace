'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WriterPaymentMethodRow, PaymentMethodType } from '@/types/database';
import {
  maskAccountNumber,
  validatePakistaniMobile,
  validatePkIban,
  type PaymentMethodInput,
} from '@/lib/writer/schemas';
import {
  upsertPaymentMethodAction,
  deactivatePaymentMethodAction,
} from '@/app/actions/writer';
import {
  CreditCard,
  Plus,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Edit2,
  Trash2,
  Loader2,
  ShieldAlert,
  Info,
  X,
  Building,
  Smartphone,
} from 'lucide-react';

interface PaymentMethodsManagerProps {
  initialMethods: WriterPaymentMethodRow[];
  writerId: string;
}

export function PaymentMethodsManager({
  initialMethods,
}: PaymentMethodsManagerProps) {
  const router = useRouter();

  const [methods, setMethods] = useState<WriterPaymentMethodRow[]>(initialMethods);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<WriterPaymentMethodRow | null>(null);

  // Form State
  const [formData, setFormData] = useState<PaymentMethodInput>({
    method_type: 'jazzcash',
    account_title: '',
    account_number_or_iban: '',
    bank_name: '',
    instructions_note: '',
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const handleOpenAdd = () => {
    setEditingMethod(null);
    setFormData({
      method_type: 'jazzcash',
      account_title: '',
      account_number_or_iban: '',
      bank_name: '',
      instructions_note: '',
    });
    setErrorMessage(null);
    setFieldErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (method: WriterPaymentMethodRow) => {
    setEditingMethod(method);
    setFormData({
      method_id: method.id,
      method_type: method.method_type,
      account_title: method.account_title,
      account_number_or_iban: method.account_number_or_iban,
      bank_name: method.bank_name || '',
      instructions_note: method.instructions_note || '',
    });
    setErrorMessage(null);
    setFieldErrors({});
    setIsModalOpen(true);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setFieldErrors({});

    // Client-side quick validation feedback
    const cleanNumber = formData.account_number_or_iban.replace(/[\s\-]/g, '');
    if (formData.method_type === 'bank_iban') {
      if (!validatePkIban(cleanNumber)) {
        setIsSubmitting(false);
        setFieldErrors({
          account_number_or_iban: [
            'Please enter a valid 24-character Pakistani IBAN starting with PK (e.g. PK36SCBL0000001123456701).',
          ],
        });
        return;
      }
      if (!formData.bank_name || formData.bank_name.trim().length === 0) {
        setIsSubmitting(false);
        setFieldErrors({ bank_name: ['Bank name is required for IBAN payouts.'] });
        return;
      }
    } else if (formData.method_type === 'raast') {
      if (!validatePakistaniMobile(cleanNumber) && !validatePkIban(cleanNumber)) {
        setIsSubmitting(false);
        setFieldErrors({
          account_number_or_iban: [
            'Raast identifier must be an 11-digit mobile number (03XXXXXXXXX) or a 24-character PK IBAN.',
          ],
        });
        return;
      }
    } else {
      if (!validatePakistaniMobile(cleanNumber)) {
        setIsSubmitting(false);
        setFieldErrors({
          account_number_or_iban: [
            'Please enter a valid Pakistani mobile number (03XXXXXXXXX or +923XXXXXXXXX).',
          ],
        });
        return;
      }
    }

    const res = await upsertPaymentMethodAction(formData);
    setIsSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to save payout method.');
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);
    } else {
      setSuccessMessage(
        editingMethod
          ? 'Payment method updated successfully.'
          : 'New payment method added successfully.'
      );
      setIsModalOpen(false);
      router.refresh();
    }
  };

  const handleDeactivate = async (methodId: string) => {
    setDeactivatingId(methodId);
    setErrorMessage(null);

    const res = await deactivatePaymentMethodAction(methodId);
    setDeactivatingId(null);
    setConfirmDeactivateId(null);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to deactivate payment method.');
    } else {
      setSuccessMessage('Payment method deactivated.');
      setMethods((prev) =>
        prev.map((m) => (m.id === methodId ? { ...m, is_active: false } : m))
      );
      router.refresh();
    }
  };

  const activeMethods = methods.filter((m) => m.is_active);
  const inactiveMethods = methods.filter((m) => !m.is_active);

  return (
    <div className="space-y-6">
      {/* Alert Notices */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-xs font-medium">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-xs font-medium">{errorMessage}</p>
        </div>
      )}

      {/* Educational Banner regarding Pakistani Direct Rails */}
      <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-amber-900 flex items-start gap-4 shadow-sm">
        <div className="p-2.5 rounded-xl bg-amber-100/80 text-amber-800 shrink-0 mt-0.5">
          <Info className="w-5 h-5" />
        </div>
        <div className="text-xs space-y-1.5 leading-relaxed">
          <div className="font-bold text-sm text-navy">
            Direct Reader-to-Writer Payments (No Third-Party Escrow)
          </div>
          <p className="text-secondary">
            Readers in Pakistan will transfer funds directly into these personal accounts via their JazzCash, EasyPaisa, Raast, or Banking app.
            <strong className="text-navy"> UNB Premium never holds, charges, or receives your readers&apos; money.</strong> You verify each bank receipt yourself in the Verification Queue.
          </p>
        </div>
      </div>

      {/* Active Methods Section */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-serif font-bold text-navy flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-accent" />
              Active Payout Accounts ({activeMethods.length})
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              At least one active payout method is required for paid novel submissions.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Payment Method</span>
          </button>
        </div>

        {activeMethods.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-ivory border border-border flex items-center justify-center mx-auto text-secondary">
              <CreditCard className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-main">
                No active payment methods configured
              </p>
              <p className="text-xs text-secondary max-w-sm mx-auto">
                Add your JazzCash, EasyPaisa, Raast ID, or Bank Account so readers can purchase your novels.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-navy font-semibold text-xs hover:bg-accent/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Method</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeMethods.map((method) => {
              const isIban = method.method_type === 'bank_iban';
              const maskedNumber = maskAccountNumber(method.method_type, method.account_number_or_iban);
              const isCopied = copiedId === method.id;

              return (
                <div
                  key={method.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-ivory/50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-ivory border border-border text-navy shrink-0 mt-0.5">
                      {isIban ? (
                        <Building className="w-5 h-5 text-navy" />
                      ) : (
                        <Smartphone className="w-5 h-5 text-accent" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-navy uppercase tracking-wide">
                          {method.method_type === 'bank_iban'
                            ? `Bank Transfer (${method.bank_name || 'IBAN'})`
                            : method.method_type.toUpperCase()}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800">
                          Active
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-main">
                        {method.account_title}
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono text-secondary">
                        <span>{maskedNumber}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(method.id, method.account_number_or_iban)}
                          className="p-1 rounded hover:bg-slate-200 text-secondary hover:text-navy transition-colors"
                          title="Copy full account number"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {isCopied && (
                          <span className="text-[10px] text-emerald-600 font-sans font-medium">
                            Copied!
                          </span>
                        )}
                      </div>

                      {method.instructions_note && (
                        <p className="text-xs text-secondary italic">
                          &ldquo;{method.instructions_note}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(method)}
                      className="p-2 rounded-lg text-secondary hover:text-navy hover:bg-ivory border border-transparent hover:border-border transition-colors text-xs font-medium flex items-center gap-1"
                      title="Edit method"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmDeactivateId(method.id)}
                      className="p-2 rounded-lg text-secondary hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors text-xs font-medium flex items-center gap-1"
                      title="Deactivate method"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Deactivate</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inactive Methods Archive if any exist */}
      {inactiveMethods.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-serif font-bold text-secondary">
            Deactivated Methods ({inactiveMethods.length})
          </h3>
          <div className="divide-y divide-border text-xs text-secondary">
            {inactiveMethods.map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-main uppercase mr-2">
                    {m.method_type}
                  </span>
                  <span>{m.account_title}</span>
                  <span className="font-mono text-[11px] ml-2">
                    ({maskAccountNumber(m.method_type, m.account_number_or_iban)})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(m)}
                  className="text-accent hover:underline text-[11px] font-medium"
                >
                  Re-activate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface rounded-2xl border border-border max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-serif font-bold text-navy flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-accent" />
                {editingMethod ? 'Edit Payout Method' : 'Add Payout Method'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-secondary hover:text-navy hover:bg-ivory"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Method Type Select */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-main">
                  Payment Method Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.method_type}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      method_type: e.target.value as PaymentMethodType,
                    }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="jazzcash">JazzCash Mobile Wallet</option>
                  <option value="easypaisa">EasyPaisa Mobile Wallet</option>
                  <option value="raast">Raast ID / Instant P2P</option>
                  <option value="bank_iban">Direct Bank Transfer (PK IBAN)</option>
                </select>
              </div>

              {/* Account Title */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-main">
                  Account Title (Full Name as shown on Bank/Wallet) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.account_title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, account_title: e.target.value }))
                  }
                  placeholder="e.g. Muhammad Usman Tariq"
                  className="w-full px-3.5 py-2 rounded-lg border border-border bg-ivory text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent"
                  required
                />
                {fieldErrors.account_title && (
                  <p className="text-xs text-rose-600">{fieldErrors.account_title[0]}</p>
                )}
              </div>

              {/* Bank Name if IBAN */}
              {formData.method_type === 'bank_iban' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-main">
                    Bank Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.bank_name || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, bank_name: e.target.value }))
                    }
                    placeholder="e.g. Meezan Bank, HBL, Bank Alfalah"
                    className="w-full px-3.5 py-2 rounded-lg border border-border bg-ivory text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent"
                    required
                  />
                  {fieldErrors.bank_name && (
                    <p className="text-xs text-rose-600">{fieldErrors.bank_name[0]}</p>
                  )}
                </div>
              )}

              {/* Account Number or IBAN */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-main">
                  {formData.method_type === 'bank_iban'
                    ? '24-Character Pakistani IBAN'
                    : formData.method_type === 'raast'
                    ? 'Raast ID (Mobile Number or PK IBAN)'
                    : '11-Digit Mobile Number (03XXXXXXXXX)'} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.account_number_or_iban}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, account_number_or_iban: e.target.value }))
                  }
                  placeholder={
                    formData.method_type === 'bank_iban'
                      ? 'PK36SCBL0000001123456701'
                      : '03001234567'
                  }
                  className="w-full px-3.5 py-2 rounded-lg border border-border bg-ivory text-main text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent uppercase"
                  required
                />
                {fieldErrors.account_number_or_iban && (
                  <p className="text-xs text-rose-600">
                    {fieldErrors.account_number_or_iban[0]}
                  </p>
                )}
                <p className="text-[11px] text-secondary">
                  {formData.method_type === 'bank_iban'
                    ? 'Length 24. Starts with PK followed by 2 digits and bank code.'
                    : 'Format: 03001234567 or +923001234567.'}
                </p>
              </div>

              {/* Optional Special Instructions */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-main">
                  Optional Payment Notes for Buyer
                </label>
                <input
                  type="text"
                  value={formData.instructions_note || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, instructions_note: e.target.value }))
                  }
                  placeholder="e.g. Please send screenshot with TID via WhatsApp"
                  className="w-full px-3.5 py-2 rounded-lg border border-border bg-ivory text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-border text-secondary hover:text-main text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Method</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Deactivation */}
      {confirmDeactivateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface rounded-2xl border border-border max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-serif font-bold text-base text-navy">
                Deactivate Payment Method?
              </h3>
              <p className="text-xs text-secondary">
                Readers checking out for your novels will no longer see this payout option. You can re-activate it at any time.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeactivateId(null)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-main"
              >
                Keep Active
              </button>
              <button
                type="button"
                disabled={deactivatingId === confirmDeactivateId}
                onClick={() => handleDeactivate(confirmDeactivateId)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                {deactivatingId === confirmDeactivateId ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deactivating...</span>
                  </>
                ) : (
                  <span>Yes, Deactivate</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
