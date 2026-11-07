import type { OrderStatus } from '@/types/database';

export interface WriterOrderSubmission {
  id: string;
  tid: string;
  screenshotPath: string;
  claimedAmount: number;
  senderAccountName: string | null;
  readerNote: string | null;
  reviewerStatus: string;
  reviewerNote: string | null;
  isDuplicateTidFlagged: boolean;
  createdAt: string;
}

export interface WriterOrderCardData {
  id: string;
  orderNumber: string;
  readerId: string;
  readerDisplayName: string;
  novelTitleUrdu: string;
  novelTitleEnglish: string;
  novelSlug: string;
  amountPkr: number;
  paymentMethod: string;
  status: OrderStatus;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
  submissions: WriterOrderSubmission[];
  hasPendingRefund?: boolean;
  pendingRefundReason?: string | null;
}

/**
 * Pure transition helper: transitions an order to verified state in local state
 */
export function transitionOrderToVerified(
  orders: WriterOrderCardData[],
  orderId: string,
  submissionId: string,
  writerNote?: string,
  verifiedAt: string = new Date().toISOString()
): WriterOrderCardData[] {
  return orders.map((order) => {
    if (order.id !== orderId) return order;
    return {
      ...order,
      status: 'verified' as OrderStatus,
      updatedAt: verifiedAt,
      submissions: order.submissions.map((sub) =>
        sub.id === submissionId
          ? {
              ...sub,
              reviewerStatus: 'verified',
              reviewerNote: writerNote || sub.reviewerNote,
            }
          : sub
      ),
    };
  });
}

/**
 * Pure transition helper: transitions an order to rejected state in local state
 */
export function transitionOrderToRejected(
  orders: WriterOrderCardData[],
  orderId: string,
  submissionId: string,
  rejectionReason: string,
  rejectedAt: string = new Date().toISOString()
): WriterOrderCardData[] {
  return orders.map((order) => {
    if (order.id !== orderId) return order;
    return {
      ...order,
      status: 'rejected' as OrderStatus,
      rejectedReason: rejectionReason,
      updatedAt: rejectedAt,
      submissions: order.submissions.map((sub) =>
        sub.id === submissionId
          ? {
              ...sub,
              reviewerStatus: 'rejected',
              reviewerNote: rejectionReason,
            }
          : sub
      ),
    };
  });
}

/**
 * Pure transition helper: marks an order as having a pending refund request in local state
 */
export function transitionOrderToRefundPending(
  orders: WriterOrderCardData[],
  orderId: string,
  refundReason: string
): WriterOrderCardData[] {
  return orders.map((order) => {
    if (order.id !== orderId) return order;
    return {
      ...order,
      hasPendingRefund: true,
      pendingRefundReason: refundReason,
    };
  });
}

/**
 * Filter helper for writer orders tabs
 */
export function filterOrdersByTab(
  orders: WriterOrderCardData[],
  tab: 'awaiting' | 'verified' | 'rejected' | 'all'
): WriterOrderCardData[] {
  switch (tab) {
    case 'awaiting':
      return orders.filter((o) => o.status === 'payment_submitted');
    case 'verified':
      return orders.filter((o) => o.status === 'verified');
    case 'rejected':
      return orders.filter((o) => o.status === 'rejected');
    case 'all':
    default:
      return orders;
  }
}

