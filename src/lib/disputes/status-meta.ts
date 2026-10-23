import type { DisputeStatus } from "@/types/database";

export interface StatusMeta {
  label: string;
  urduLabel: string;
  variant: "default" | "success" | "warning" | "destructive" | "secondary";
  description: string;
}

/**
 * Returns human-friendly metadata and Urdu styling for dispute statuses.
 */
export function getDisputeStatusMeta(status: DisputeStatus | string): StatusMeta {
  switch (status) {
    case "open":
      return {
        label: "Open",
        urduLabel: "زیرِ تنازع",
        variant: "warning",
        description: "Dispute opened and awaiting writer response or evidence submission.",
      };
    case "under_review":
      return {
        label: "Under Review",
        urduLabel: "زیرِ جائزہ",
        variant: "secondary",
        description: "Platform administrators are actively reviewing evidence.",
      };
    case "resolved_for_reader":
      return {
        label: "Resolved for Reader",
        urduLabel: "قارئین کے حق میں حل",
        variant: "success",
        description: "Dispute resolved with reader outcome (verified access or approved refund).",
      };
    case "resolved_for_writer":
      return {
        label: "Resolved for Writer",
        urduLabel: "مصنف کے حق میں حل",
        variant: "default",
        description: "Payment not verified; writer order remains unchanged.",
      };
    case "closed":
      return {
        label: "Closed",
        urduLabel: "بند کر دیا گیا",
        variant: "secondary",
        description: "Dispute closed without further action.",
      };
    default:
      return {
        label: String(status),
        urduLabel: String(status),
        variant: "default",
        description: "Status unknown.",
      };
  }
}

/**
 * Returns metadata for refund request statuses.
 */
export function getRefundStatusMeta(status: string): StatusMeta {
  switch (status) {
    case "pending":
      return {
        label: "Pending Review",
        urduLabel: "زیرِ جائزہ",
        variant: "warning",
        description: "Awaiting platform administrator verification of off-platform refund.",
      };
    case "approved":
      return {
        label: "Approved & Adjusted",
        urduLabel: "منظور شدہ",
        variant: "success",
        description: "Refund approved: ledger adjustment recorded and access revoked.",
      };
    case "rejected":
      return {
        label: "Declined",
        urduLabel: "مسترد",
        variant: "destructive",
        description: "Refund request was declined by administrator.",
      };
    default:
      return {
        label: status,
        urduLabel: status,
        variant: "default",
        description: "",
      };
  }
}

/**
 * Returns metadata for support request categories and statuses.
 */
export function getSupportStatusMeta(status: string): StatusMeta {
  switch (status) {
    case "open":
      return {
        label: "Open",
        urduLabel: "کھلا ہے",
        variant: "warning",
        description: "Request submitted and awaiting team reply.",
      };
    case "answered":
      return {
        label: "Answered",
        urduLabel: "جواب دیا گیا",
        variant: "success",
        description: "Support team has responded. Awaiting your feedback.",
      };
    case "closed":
      return {
        label: "Closed",
        urduLabel: "بند",
        variant: "secondary",
        description: "Ticket has been resolved and closed.",
      };
    default:
      return {
        label: status,
        urduLabel: status,
        variant: "default",
        description: "",
      };
  }
}

/**
 * Calculates remaining dispute wait time for payment_submitted orders.
 */
export function calculateDisputeWaitStatus(
  orderCreatedAt: string | Date,
  minWaitHours: number
): { canDispute: boolean; remainingHours: number; remainingMinutes: number } {
  const createdTime = new Date(orderCreatedAt).getTime();
  const waitMs = minWaitHours * 60 * 60 * 1000;
  const eligibleTime = createdTime + waitMs;
  const now = Date.now();

  if (now >= eligibleTime) {
    return { canDispute: true, remainingHours: 0, remainingMinutes: 0 };
  }

  const diffMs = eligibleTime - now;
  const remainingHours = Math.floor(diffMs / (60 * 60 * 1000));
  const remainingMinutes = Math.ceil((diffMs % (60 * 60 * 1000)) / (60 * 1000));

  return { canDispute: false, remainingHours, remainingMinutes };
}

/**
 * Maps raw PostgreSQL or RPC exceptions into friendly user-facing messages.
 */
export function mapDisputeErrorMessage(error: string): string {
  if (!error) return "An unexpected error occurred.";

  if (error.includes("Dispute wait period has not elapsed")) {
    return "You must wait before opening a dispute to give the writer time to verify your bank deposit.";
  }

  if (error.includes("Dispute window expired")) {
    return "The dispute window for this order has expired.";
  }

  if (error.includes("Rate limit exceeded") && error.includes("20 messages")) {
    return "Rate limit reached: You can send at most 20 messages per hour on this thread.";
  }

  if (error.includes("Rate limit exceeded") && error.includes("5 support requests")) {
    return "Rate limit reached: You cannot submit more than 5 support requests in a 24-hour period.";
  }

  if (error.includes("pending refund request already exists")) {
    return "A pending refund request is already being reviewed by administrators for this order.";
  }

  if (error.includes("Only verified orders can be refunded")) {
    return "Refund adjustments can only be requested on verified orders.";
  }

  if (error.includes("An active dispute already exists")) {
    return "A dispute is already active for this order.";
  }

  return error;
}
