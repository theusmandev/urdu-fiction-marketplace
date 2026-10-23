'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminUpdateUserRoleStatusAction } from '@/app/actions/admin';
import type { UserRole } from '@/types/database';
import {
  Shield,
  Feather,
  BookOpen,
  Power,
  Edit3,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export interface UserItem {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

interface UserManagementTableProps {
  users: UserItem[];
  currentAdminId: string;
}

export function UserManagementTable({ users, currentAdminId }: UserManagementTableProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit modal state
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [targetRole, setTargetRole] = useState<UserRole>('reader');
  const [targetIsActive, setTargetIsActive] = useState<boolean>(true);
  const [reason, setReason] = useState<string>('');

  const handleOpenEdit = (user: UserItem) => {
    setSelectedUser(user);
    setTargetRole(user.role);
    setTargetIsActive(user.is_active);
    setReason('');
    setError(null);
  };

  const handleClose = () => {
    setSelectedUser(null);
    setReason('');
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (!reason || reason.trim().length < 3) {
      setError('A mandatory reason is required to update a user role or status.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await adminUpdateUserRoleStatusAction({
        userId: selectedUser.id,
        role: targetRole,
        isActive: targetIsActive,
        reason: reason.trim(),
      });

      if (!res.success) {
        setError(res.error || 'Failed to update user');
      } else {
        setSuccessMsg(`User ${selectedUser.email} successfully updated.`);
        handleClose();
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const isSelf = selectedUser?.id === currentAdminId;

  const ROLE_CONFIG: Record<
    UserRole,
    { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }
  > = {
    admin: { label: 'Admin', bg: 'bg-purple-500/10 border-purple-500/30', text: 'text-purple-300', icon: Shield },
    writer: { label: 'Writer', bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-300', icon: Feather },
    reader: { label: 'Reader', bg: 'bg-indigo-500/10 border-indigo-500/30', text: 'text-indigo-300', icon: BookOpen },
  };

  return (
    <div className="space-y-4">
      {/* Alert Notices */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs text-rose-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-xs text-emerald-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">User / Email</th>
                <th className="py-3 px-4">Username / Full Name</th>
                <th className="py-3 px-4">Platform Role</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Registered Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {users.map((user) => {
                const isCurrent = user.id === currentAdminId;
                const roleConf = ROLE_CONFIG[user.role] || ROLE_CONFIG.reader;
                const RoleIcon = roleConf.icon;

                return (
                  <tr key={user.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4 font-mono">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{user.email}</span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">{user.id}</div>
                    </td>

                    <td className="py-3 px-4 font-sans">
                      <div className="text-slate-300 font-medium">
                        {user.full_name || 'No full name'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        @{user.username || 'unassigned'}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-sans">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${roleConf.bg} ${roleConf.text}`}
                      >
                        <RoleIcon className="w-3 h-3" />
                        <span>{roleConf.label}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 font-sans">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                          user.is_active
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        <Power className="w-2.5 h-2.5" />
                        <span>{user.is_active ? 'Active' : 'Deactivated'}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-400 font-sans text-xs">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>

                    <td className="py-3 px-4 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(user)}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Modify</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards View */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {users.map((user) => {
          const isCurrent = user.id === currentAdminId;
          const roleConf = ROLE_CONFIG[user.role] || ROLE_CONFIG.reader;
          const RoleIcon = roleConf.icon;

          return (
            <div
              key={user.id}
              className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-white text-sm font-mono">
                    <span>{user.email}</span>
                    {isCurrent && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-sans">
                    {user.full_name ? `${user.full_name} ` : ''}
                    <span className="font-mono text-slate-500">(@{user.username || 'unassigned'})</span>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${roleConf.bg} ${roleConf.text}`}
                >
                  <RoleIcon className="w-2.5 h-2.5" />
                  <span>{roleConf.label}</span>
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/60 pt-2 font-mono">
                <div>
                  Status:{' '}
                  <span className={user.is_active ? 'text-emerald-400' : 'text-rose-400'}>
                    {user.is_active ? 'Active' : 'Deactivated'}
                  </span>
                </div>
                <div>Joined {new Date(user.created_at).toLocaleDateString()}</div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(user)}
                  disabled={loading}
                  className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Modify Role & Status</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Role & Status Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleSave}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Modify User Role & Status</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5 break-all">
                  {selectedUser.email}
                </p>
              </div>
            </div>

            {/* Self protection alert */}
            {isSelf && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Self-Lockout Protection:</span>
                  You cannot demote or deactivate your own account. This safeguard prevents accidental administrator lockout.
                </div>
              </div>
            )}

            <div className="space-y-3">
              {/* Role Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Assigned Platform Role
                </label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as UserRole)}
                  disabled={isSelf || loading}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                >
                  <option value="reader">Reader (Standard consumer)</option>
                  <option value="writer">Writer (Author publishing access)</option>
                  <option value="admin">Admin (Full platform governance)</option>
                </select>
                {selectedUser.role === 'writer' && targetRole === 'reader' && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    Note: If this writer has published novels, demoting to reader will be blocked by the database until their published novels are suspended.
                  </p>
                )}
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="user-active-checkbox"
                  checked={targetIsActive}
                  onChange={(e) => setTargetIsActive(e.target.checked)}
                  disabled={isSelf || loading}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500/50 disabled:opacity-50"
                />
                <label
                  htmlFor="user-active-checkbox"
                  className="text-xs text-slate-300 font-medium cursor-pointer"
                >
                  Account Active (Uncheck to ban/deactivate user access)
                </label>
              </div>

              {/* Mandatory Reason */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Justification Reason <span className="text-rose-400 font-mono">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Mandatory reason for audit trail..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || (isSelf && (targetRole !== 'admin' || !targetIsActive))}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
