'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { markNotificationsReadAction } from '@/app/actions/checkout';
import {
  Bell,
  CheckCheck,
  Check,
  Clock,
  ExternalLink,
  ShoppingBag,
  CreditCard,
  AlertCircle,
  Loader2,
  Inbox,
  Scale,
  RotateCcw,
  Receipt,
  LifeBuoy,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  body: string | null;
  link: string | null;
  entity_refs: unknown;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

interface NotificationsClientProps {
  initialNotifications: NotificationItem[];
}

function resolveNotificationLink(item: NotificationItem): string | null {
  if (item.link) return item.link;
  const refs = (item.entity_refs as Record<string, unknown>) || {};
  if (refs.dispute_id) {
    return `/disputes/${refs.dispute_id}`;
  }
  if (refs.order_number) {
    return `/orders/${refs.order_number}`;
  }
  if (refs.order_id) {
    return `/orders/${refs.order_id}`;
  }
  if (refs.invoice_id) {
    return `/writer/invoices`;
  }
  if (refs.support_id || refs.request_id) {
    return `/support/${refs.support_id || refs.request_id}`;
  }
  return null;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'order_payment_submitted':
      return <CreditCard className="w-4 h-4 text-amber-400" />;
    case 'order_verified':
      return <ShoppingBag className="w-4 h-4 text-emerald-400" />;
    case 'order_rejected':
      return <AlertCircle className="w-4 h-4 text-rose-400" />;
    case 'dispute_opened':
    case 'dispute_resolved':
    case 'stagnant_dispute_alert':
      return <Scale className="w-4 h-4 text-amber-400" />;
    case 'dispute_message':
      return <MessageSquare className="w-4 h-4 text-sky-400" />;
    case 'refund_requested':
    case 'refund_approved':
    case 'refund_rejected':
      return <RotateCcw className="w-4 h-4 text-sky-400" />;
    case 'invoice_due_reminder':
    case 'invoice_overdue':
      return <Receipt className="w-4 h-4 text-rose-400" />;
    case 'support_reply':
    case 'support_ticket_closed':
      return <LifeBuoy className="w-4 h-4 text-purple-400" />;
    case 'writer_application_approved':
    case 'novel_approved':
      return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    default:
      return <Bell className="w-4 h-4 text-amber-500" />;
  }
}

export function NotificationsClient({ initialNotifications }: NotificationsClientProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [isPending, startTransition] = useTransition();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const res = await markNotificationsReadAction();
      if (res.success) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
        );
        router.refresh();
      }
    });
  };

  const handleMarkOneRead = (id: string) => {
    startTransition(async () => {
      const res = await markNotificationsReadAction([id]);
      if (res.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
        );
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-amber-500" />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500 text-stone-950">
                {unreadCount} new
              </span>
            )}
          </h1>
          <p className="text-xs text-stone-400 mt-1">
            Real-time updates on your novel orders, payments, and library activity.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-300 hover:text-white bg-stone-900 hover:bg-stone-800 border border-stone-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCheck className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <div className="rounded-2xl bg-stone-900 border border-stone-800 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-stone-800 text-stone-500 flex items-center justify-center mx-auto">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Notifications Yet</h3>
          <p className="text-xs text-stone-400 max-w-sm mx-auto">
            When you place an order, make a payment, or when an author confirms access, alerts will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                item.is_read
                  ? 'bg-stone-900/40 border-stone-800/60 opacity-80'
                  : 'bg-stone-900 border-stone-700/80 shadow-md ring-1 ring-amber-500/10'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="p-2 rounded-xl bg-stone-800 border border-stone-700/60 shrink-0 mt-0.5">
                  {getNotificationIcon(item.type)}
                </div>

                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white truncate">{item.title}</h4>
                    {!item.is_read && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Unread" />
                    )}
                  </div>
                  <p className="text-xs text-stone-300 leading-relaxed">{item.message}</p>
                  {item.body && item.body !== item.message && (
                    <p className="text-[11px] text-stone-400 leading-relaxed pt-0.5">{item.body}</p>
                  )}
                  <div className="flex items-center gap-3 pt-1 text-[10px] text-stone-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                    {(() => {
                      const resolvedLink = resolveNotificationLink(item);
                      return resolvedLink ? (
                        <Link
                          href={resolvedLink}
                          onClick={() => {
                            if (!item.is_read) handleMarkOneRead(item.id);
                          }}
                          className="text-amber-400 hover:text-amber-300 font-semibold inline-flex items-center gap-1 underline"
                        >
                          <span>View Details</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>

              {!item.is_read && (
                <div className="sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMarkOneRead(item.id)}
                    disabled={isPending}
                    title="Mark as read"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-400 hover:text-amber-400 bg-stone-800/80 hover:bg-stone-800 px-2.5 py-1 rounded-lg border border-stone-700/60 transition-colors cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>Mark read</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
