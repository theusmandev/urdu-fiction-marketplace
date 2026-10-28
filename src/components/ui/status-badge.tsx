import React from "react";
import { cn } from "@/lib/utils";
import { 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  FileText, 
  ShieldCheck, 
  PauseCircle,
  HelpCircle
} from "lucide-react";

export type SystemStatus =
  // Order & Direct Payment Verification States
  | "pending_verification"
  | "verified"
  | "rejected"
  | "disputed"
  | "processing"
  
  // Content & Novel Moderation States
  | "draft"
  | "under_review"
  | "published"
  | "suspended"
  
  // Commission & Ledger States
  | "commission_unpaid"
  | "commission_cleared"
  | "commission_overdue";

interface StatusBadgeProps {
  status: SystemStatus | string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  showUrduLabel?: boolean;
  className?: string;
}

interface StatusMeta {
  labelEn: string;
  labelUrdu: string;
  classes: string;
  icon: React.ComponentType<{ className?: string }>;
}

const statusMap: Record<string, StatusMeta> = {
  // Order verification
  pending_verification: {
    labelEn: "Pending Verification",
    labelUrdu: "تصدیق کی منتظر",
    classes: "bg-warning-soft text-warning-text border-warning-border",
    icon: Clock,
  },
  verified: {
    labelEn: "Payment Verified",
    labelUrdu: "تصدیق شدہ",
    classes: "bg-success-soft text-success-text border-success-border",
    icon: CheckCircle2,
  },
  rejected: {
    labelEn: "Verification Rejected",
    labelUrdu: "مسترد شدہ",
    classes: "bg-danger-soft text-danger-text border-danger-border",
    icon: XCircle,
  },
  disputed: {
    labelEn: "In Dispute",
    labelUrdu: "زیرِ تنازعہ",
    classes: "bg-danger-soft text-danger-text border-danger-border",
    icon: AlertCircle,
  },
  processing: {
    labelEn: "Processing",
    labelUrdu: "زیرِ عمل",
    classes: "bg-info-soft text-info-text border-info-border",
    icon: Clock,
  },

  // Novel & Chapter moderation
  draft: {
    labelEn: "Draft",
    labelUrdu: "مسودہ",
    classes: "bg-surface-muted text-text-muted border-border",
    icon: FileText,
  },
  under_review: {
    labelEn: "Under Review",
    labelUrdu: "زیرِ جائزہ",
    classes: "bg-info-soft text-info-text border-info-border",
    icon: Clock,
  },
  published: {
    labelEn: "Published",
    labelUrdu: "شائع شدہ",
    classes: "bg-success-soft text-success-text border-success-border",
    icon: ShieldCheck,
  },
  suspended: {
    labelEn: "Suspended",
    labelUrdu: "معطل",
    classes: "bg-danger-soft text-danger-text border-danger-border",
    icon: PauseCircle,
  },

  // Platform Fee Ledger & Invoices
  commission_unpaid: {
    labelEn: "Platform Fee Accruing",
    labelUrdu: "پلیٹ فارم فیس واجب الادا",
    classes: "bg-warning-soft text-warning-text border-warning-border",
    icon: Clock,
  },
  commission_cleared: {
    labelEn: "Remitted & Cleared",
    labelUrdu: "پلیٹ فارم فیس ادا شدہ",
    classes: "bg-success-soft text-success-text border-success-border",
    icon: CheckCircle2,
  },
  commission_overdue: {
    labelEn: "Threshold Exceeded",
    labelUrdu: "حد سے متجاوز",
    classes: "bg-danger-soft text-danger-text border-danger-border font-semibold",
    icon: AlertCircle,
  },
  invoiced: {
    labelEn: "Invoiced",
    labelUrdu: "انوائس جاری شدہ",
    classes: "bg-info-soft text-info-text border-info-border",
    icon: FileText,
  },
  payment_reported: {
    labelEn: "Payment Reported",
    labelUrdu: "ادائیگی ارسال کردہ",
    classes: "bg-warning-soft text-warning-text border-warning-border",
    icon: Clock,
  },
  partially_paid: {
    labelEn: "Partially Paid",
    labelUrdu: "جزوی ادا شدہ",
    classes: "bg-warning-soft text-warning-text border-warning-border",
    icon: AlertCircle,
  },
  settled: {
    labelEn: "Settled",
    labelUrdu: "مکمل ادا شدہ",
    classes: "bg-success-soft text-success-text border-success-border",
    icon: CheckCircle2,
  },
  void: {
    labelEn: "Voided",
    labelUrdu: "منسوخ شدہ",
    classes: "bg-surface-muted text-text-muted border-border line-through",
    icon: XCircle,
  },

  // Payment Reports
  report_pending: {
    labelEn: "Pending Review",
    labelUrdu: "زیرِ جائزہ",
    classes: "bg-warning-soft text-warning-text border-warning-border",
    icon: Clock,
  },
  report_confirmed: {
    labelEn: "Confirmed",
    labelUrdu: "تصدیق شدہ",
    classes: "bg-success-soft text-success-text border-success-border",
    icon: CheckCircle2,
  },
  report_rejected: {
    labelEn: "Rejected",
    labelUrdu: "مسترد",
    classes: "bg-danger-soft text-danger-text border-danger-border",
    icon: XCircle,
  },

  // Sales Ledger Entry Types
  sale_verified: {
    labelEn: "Sale Verified",
    labelUrdu: "فروخت تصدیق شدہ",
    classes: "bg-success-soft text-success-text border-success-border",
    icon: CheckCircle2,
  },
  refund_adjustment: {
    labelEn: "Refund Adjustment",
    labelUrdu: "رقم واپسی ایڈجسٹمنٹ",
    classes: "bg-danger-soft text-danger-text border-danger-border",
    icon: AlertCircle,
  },
  manual_correction: {
    labelEn: "Manual Correction",
    labelUrdu: "دستی درستگی",
    classes: "bg-info-soft text-info-text border-info-border",
    icon: FileText,
  },
};

const defaultStatusMeta: StatusMeta = {
  labelEn: "Unknown",
  labelUrdu: "نامعلوم",
  classes: "bg-surface-muted text-text-muted border-border",
  icon: HelpCircle,
};

export function StatusBadge({
  status,
  size = "md",
  showIcon = true,
  showUrduLabel = false,
  className,
}: StatusBadgeProps) {
  const meta = statusMap[status] || {
    ...defaultStatusMeta,
    labelEn: status.replace(/_/g, " "),
  };

  const Icon = meta.icon;

  const sizeClasses = {
    sm: "text-[11px] px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5",
    lg: "text-sm px-3 py-1.5 gap-2",
  }[size];

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border transition-colors",
        sizeClasses,
        meta.classes,
        className
      )}
    >
      {showIcon && <Icon className={cn("shrink-0", iconSizes)} />}
      <span>{meta.labelEn}</span>
      {showUrduLabel && (
        <span
          dir="rtl"
          lang="ur"
          className="font-urdu text-[11px] opacity-80 border-l border-current/20 pl-1.5 ml-1"
        >
          {meta.labelUrdu}
        </span>
      )}
    </span>
  );
}
