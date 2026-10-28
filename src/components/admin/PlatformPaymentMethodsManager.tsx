'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  upsertPlatformPaymentMethodAction,
  deactivatePlatformPaymentMethodAction,
} from '@/app/actions/admin-commission';
import type { PlatformPaymentMethodRow } from '@/types/database';
import {
  CreditCard,
  Building,
  Smartphone,
  Plus,
  Edit2,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

interface PlatformPaymentMethodsManagerProps {
  initialMethods: PlatformPaymentMethodRow[];
}

export function PlatformPaymentMethodsManager({
  initialMethods,
}: PlatformPaymentMethodsManagerProps) {
  const router = useRouter();

  const [methods, setMethods] = useState<PlatformPaymentMethodRow[]>(initialMethods);
  const [prevInitial, setPrevInitial] = useState(initialMethods);
  if (initialMethods !== prevInitial) {
    setPrevInitial(initialMethods);
    setMethods(initialMethods);
  }

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [methodType, setMethodType] = useState<'jazzcash' | 'easypaisa' | 'raast' | 'bank_transfer'>('bank_transfer');
  const [accountTitle, setAccountTitle] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [instructionsNote, setInstructionsNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setMethodType('bank_transfer');
    setAccountTitle('');
    setAccountNumber('');
    setBankName('');
    setInstructionsNote('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (m: PlatformPaymentMethodRow) => {
    setEditingId(m.id);
    setMethodType(m.method_type);
    setAccountTitle(m.account_title);
    setAccountNumber(m.account_number_or_iban);
    setBankName(m.bank_name || '');
    setInstructionsNote(m.instructions_note || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await upsertPlatformPaymentMethodAction({
        id: editingId || undefined,
        methodType,
        accountTitle: accountTitle.trim(),
        accountNumberOrIban: accountNumber.trim(),
        bankName: methodType === 'bank_transfer' ? bankName.trim() : undefined,
        instructionsNote: instructionsNote.trim() || undefined,
      });

      if (!res.success) {
        setFormError(res.error || 'Failed to save payment account.');
      } else {
        setIsModalOpen(false);

        // Immediate optimistic / local state update so the new method shows without waiting
        const resultRecord = res.result as Record<string, unknown> | undefined;
        const returnedId =
          (typeof resultRecord?.id === 'string' ? resultRecord.id : null) ||
          editingId ||
          `temp-${Date.now()}`;

        if (editingId) {
          setMethods((prev) =>
            prev.map((m) =>
              m.id === editingId
                ? {
                    ...m,
                    method_type: methodType,
                    account_title: accountTitle.trim(),
                    account_number_or_iban: accountNumber.trim(),
                    bank_name: methodType === 'bank_transfer' ? bankName.trim() : null,
                    instructions_note: instructionsNote.trim() || null,
                    updated_at: new Date().toISOString(),
                  }
                : m
            )
          );
        } else {
          setMethods((prev) => [
            ...prev,
            {
              id: returnedId,
              method_type: methodType,
              account_title: accountTitle.trim(),
              account_number_or_iban: accountNumber.trim(),
              bank_name: methodType === 'bank_transfer' ? bankName.trim() : null,
              instructions_note: instructionsNote.trim() || null,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]);
        }
        router.refresh();
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this platform payment account? Authors with open invoices will no longer see it.')) {
      return;
    }

    try {
      const res = await deactivatePlatformPaymentMethodAction(id);
      if (!res.success) {
        alert(res.error || 'Failed to deactivate account.');
      } else {
        setMethods((prev) =>
          prev.map((m) => (m.id === id ? { ...m, is_active: false } : m))
        );
        router.refresh();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Unexpected error.');
    }
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-card space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-accent-admin" />
            <h2 className="text-lg font-serif font-bold text-main">
              Official Platform Remittance Accounts
            </h2>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Banking and mobile wallet accounts shown to authors who have an open platform fee invoice.
          </p>
        </div>

        <button
          id="add-payment-account-btn"
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-lg bg-accent-admin hover:bg-accent-admin-dark text-white shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add Payment Account
        </button>
      </div>

      {methods.length === 0 ? (
        <div className="py-10 text-center space-y-3 bg-surface-muted/50 rounded-xl border border-dashed border-border">
          <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-muted">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-main">
              No platform remittance accounts configured yet
            </p>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Authors who have open platform fee invoices will see a placeholder notice until you add official banking details.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent-admin hover:bg-accent-admin-dark text-white shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add First Payment Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {methods.map((m) => {
            const isBank = m.method_type === 'bank_transfer';
            const isRaast = m.method_type === 'raast';

            return (
              <div
                key={m.id}
                className={`p-4 rounded-xl border transition-colors shadow-sm ${
                  m.is_active
                    ? 'bg-surface border-border'
                    : 'bg-surface-muted/40 border-border opacity-60'
                }`}
              >
                <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    {isBank ? (
                      <Building className="w-4 h-4 text-accent-admin" />
                    ) : isRaast ? (
                      <Zap className="w-4 h-4 text-accent-strong" />
                    ) : (
                      <Smartphone className="w-4 h-4 text-success" />
                    )}
                    <span className="font-semibold text-main text-xs uppercase">
                      {m.bank_name || (isRaast ? 'RAAST P2M' : m.method_type.replace('_', ' '))}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {m.is_active ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-success-soft text-success-text border border-success-border">
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-muted text-muted border border-border">
                        Inactive
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(m)}
                      className="p-1 text-muted hover:text-main transition-colors cursor-pointer"
                      title="Edit Account"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {m.is_active && (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(m.id)}
                        className="p-1 text-muted hover:text-danger-text transition-colors cursor-pointer"
                        title="Deactivate Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <div>
                    <span className="text-[10px] text-muted uppercase">Title:</span>
                    <div className="font-medium text-main">{m.account_title}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted uppercase">
                      {isBank ? 'Account / IBAN:' : isRaast ? 'Raast ID / IBAN:' : 'Wallet Number:'}
                    </span>
                    <div className="font-mono text-main font-medium">
                      {m.account_number_or_iban}
                    </div>
                  </div>
                  {m.instructions_note && (
                    <div className="text-[11px] text-muted italic pt-1">
                      Note: {m.instructions_note}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Add / Edit */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-serif font-bold text-lg text-main">
                {editingId ? 'Edit Platform Account' : 'Add Platform Account'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-muted hover:text-main cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-danger-soft border border-danger-border text-danger-text rounded-xl">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="platform-method-type" className="block text-main font-medium mb-1">
                  Payment Method Type *
                </label>
                <select
                  id="platform-method-type"
                  value={methodType}
                  onChange={(e) =>
                    setMethodType(
                      e.target.value as 'jazzcash' | 'easypaisa' | 'raast' | 'bank_transfer'
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main focus:outline-none focus:ring-2 focus:ring-ring-admin/20 focus:border-accent-admin"
                >
                  <option value="bank_transfer">Direct Bank Transfer (IBAN)</option>
                  <option value="jazzcash">JazzCash Mobile Wallet</option>
                  <option value="easypaisa">EasyPaisa Mobile Wallet</option>
                  <option value="raast">Raast Instant P2M / Account</option>
                </select>
              </div>

              {methodType === 'bank_transfer' && (
                <div>
                  <label htmlFor="platform-bank-name" className="block text-main font-medium mb-1">
                    Bank Name *
                  </label>
                  <input
                    id="platform-bank-name"
                    type="text"
                    required
                    placeholder="e.g. Meezan Bank, HBL, Bank Alfalah"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main focus:outline-none focus:ring-2 focus:ring-ring-admin/20 focus:border-accent-admin"
                  />
                </div>
              )}

              <div>
                <label htmlFor="platform-account-title" className="block text-main font-medium mb-1">
                  Account Title *
                </label>
                <input
                  id="platform-account-title"
                  type="text"
                  required
                  placeholder="e.g. Urdu Novels Bazaar PVT LTD"
                  value={accountTitle}
                  onChange={(e) => setAccountTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main focus:outline-none focus:ring-2 focus:ring-ring-admin/20 focus:border-accent-admin"
                />
              </div>

              <div>
                <label htmlFor="platform-account-number" className="block text-main font-medium mb-1">
                  {methodType === 'bank_transfer'
                    ? 'IBAN / Account Number *'
                    : methodType === 'raast'
                    ? 'Raast ID / Account / IBAN *'
                    : 'Wallet Number *'}
                </label>
                <input
                  id="platform-account-number"
                  type="text"
                  required
                  placeholder={
                    methodType === 'bank_transfer'
                      ? 'PK36MEZN0001000123456701'
                      : methodType === 'raast'
                      ? '03001234567 or PK36MEZN...'
                      : '03001234567'
                  }
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main font-mono focus:outline-none focus:ring-2 focus:ring-ring-admin/20 focus:border-accent-admin"
                />
              </div>

              <div>
                <label htmlFor="platform-instructions-note" className="block text-main font-medium mb-1">
                  Remittance Instructions Note (Optional)
                </label>
                <textarea
                  id="platform-instructions-note"
                  rows={2}
                  placeholder="e.g. Mention your Pen Name or Invoice Number in the transfer description..."
                  value={instructionsNote}
                  onChange={(e) => setInstructionsNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted text-main focus:outline-none focus:ring-2 focus:ring-ring-admin/20 focus:border-accent-admin"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface-muted text-main hover:bg-surface border border-border cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-accent-admin hover:bg-accent-admin-dark text-white font-semibold disabled:opacity-50 cursor-pointer shadow-sm transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
