'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';

interface PlatformPaymentMethodsManagerProps {
  initialMethods: PlatformPaymentMethodRow[];
}

export function PlatformPaymentMethodsManager({
  initialMethods,
}: PlatformPaymentMethodsManagerProps) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [methodType, setMethodType] = useState<'jazzcash' | 'easypaisa' | 'bank_transfer'>('bank_transfer');
  const [accountTitle, setAccountTitle] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [instructionsNote, setInstructionsNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setMethodType(m.method_type as 'jazzcash' | 'easypaisa' | 'bank_transfer');
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
        router.refresh();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Unexpected error.');
    }
  };

  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-serif font-bold text-white">
              Official Platform Remittance Accounts
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Banking and mobile wallet accounts shown to authors who have an open commission invoice.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add Payment Account
        </button>
      </div>

      {initialMethods.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs">
          No platform payment accounts configured yet. Authors will see a placeholder notice on open invoices.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {initialMethods.map((m) => {
            const isBank = m.method_type === 'bank_transfer';
            return (
              <div
                key={m.id}
                className={`p-4 rounded-xl border transition-colors ${
                  m.is_active
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-slate-900/40 border-slate-800/40 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    {isBank ? (
                      <Building className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className="font-semibold text-white text-xs uppercase">
                      {m.bank_name || m.method_type.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {m.is_active ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        Inactive
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(m)}
                      className="p-1 text-slate-400 hover:text-white transition-colors"
                      title="Edit Account"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {m.is_active && (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(m.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Deactivate Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase">Title:</span>
                    <div className="font-medium text-slate-200">{m.account_title}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase">
                      {isBank ? 'Account / IBAN:' : 'Wallet Number:'}
                    </span>
                    <div className="font-mono text-white font-medium">
                      {m.account_number_or_iban}
                    </div>
                  </div>
                  {m.instructions_note && (
                    <div className="text-[11px] text-slate-400 italic pt-1">
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-serif font-bold text-lg text-white">
                {editingId ? 'Edit Platform Account' : 'Add Platform Account'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Payment Method Type *
                </label>
                <select
                  value={methodType}
                  onChange={(e) =>
                    setMethodType(
                      e.target.value as 'jazzcash' | 'easypaisa' | 'bank_transfer'
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="bank_transfer">Direct Bank Transfer (IBAN)</option>
                  <option value="jazzcash">JazzCash Mobile Wallet</option>
                  <option value="easypaisa">EasyPaisa Mobile Wallet</option>
                </select>
              </div>

              {methodType === 'bank_transfer' && (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Meezan Bank, HBL, Bank Alfalah"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Account Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Urdu Novels Bazaar PVT LTD"
                  value={accountTitle}
                  onChange={(e) => setAccountTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {methodType === 'bank_transfer' ? 'IBAN / Account Number *' : 'Wallet Number *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={methodType === 'bank_transfer' ? 'PK36MEZN0001000123456701' : '03001234567'}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Remittance Instructions Note (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Mention your Pen Name in the transfer description..."
                  value={instructionsNote}
                  onChange={(e) => setInstructionsNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50"
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
