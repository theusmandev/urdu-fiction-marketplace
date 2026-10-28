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
    classes: "bg-amber-50 text-amber-800 border-amber-200/80 hover:bg-amber-100/60",
    icon: Clock,
  },
  verified: {
    labelEn: "Payment Verified",
    labelUrdu: "تصدیق شدہ",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/60",
    icon: CheckCircle2,
  },
  rejected: {
    labelEn: "Verification Rejected",
    labelUrdu: "مسترد شدہ",
    classes: "bg-rose-50 text-rose-800 border-rose-200/80 hover:bg-rose-100/60",
    icon: XCircle,
  },
  disputed: {
    labelEn: "In Dispute",
    labelUrdu: "زیرِ تنازعہ",
    classes: "bg-purple-50 text-purple-800 border-purple-200/80 hover:bg-purple-100/60",
    icon: AlertCircle,
  },
  processing: {
    labelEn: "Processing",
    labelUrdu: "زیرِ عمل",
    classes: "bg-blue-50 text-blue-800 border-blue-200/80",
    icon: Clock,
  },

  // Novel & Chapter moderation
  draft: {
    labelEn: "Draft",
    labelUrdu: "مسودہ",
    classes: "bg-stone-100 text-stone-700 border-stone-200",
    icon: FileText,
  },
  under_review: {
    labelEn: "Under Review",
    labelUrdu: "زیرِ جائزہ",
    classes: "bg-sky-50 text-sky-800 border-sky-200",
    icon: Clock,
  },
  published: {
    labelEn: "Published",
    labelUrdu: "شائع شدہ",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: ShieldCheck,
  },
  suspended: {
    labelEn: "Suspended",
    labelUrdu: "معطل",
    classes: "bg-rose-50 text-rose-800 border-rose-200",
    icon: PauseCircle,
  },

  // Commission Ledger & Invoices
  commission_unpaid: {
    labelEn: "Platform Fee Accruing",
    labelUrdu: "پلیٹ فارم فیس واجب الادا",
    classes: "bg-amber-50 text-amber-800 border-amber-200",
    icon: Clock,
  },
  commission_cleared: {
    labelEn: "Remitted & Cleared",
    labelUrdu: "پلیٹ فارم فیس ادا شدہ",
    classes: "bg-teal-50 text-teal-800 border-teal-200",
    icon: CheckCircle2,
  },
  commission_overdue: {
    labelEn: "Threshold Exceeded",
    labelUrdu: "حد سے متجاوز",
    classes: "bg-rose-100 text-rose-900 border-rose-300 font-semibold",
    icon: AlertCircle,
  },
  invoiced: {
    labelEn: "Invoiced",
    labelUrdu: "انوائس جاری شدہ",
    classes: "bg-blue-50 text-blue-800 border-blue-200",
    icon: FileText,
  },
  payment_reported: {
    labelEn: "Payment Reported",
    labelUrdu: "ادائیگی ارسال کردہ",
    classes: "bg-purple-50 text-purple-800 border-purple-200",
    icon: Clock,
  },
  partially_paid: {
    labelEn: "Partially Paid",
    labelUrdu: "جزوی ادا شدہ",
    classes: "bg-amber-50 text-amber-800 border-amber-200",
    icon: AlertCircle,
  },
  settled: {
    labelEn: "Settled",
    labelUrdu: "مکمل ادا شدہ",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  void: {
    labelEn: "Voided",
    labelUrdu: "منسوخ شدہ",
    classes: "bg-slate-100 text-slate-600 border-slate-300 line-through",
    icon: XCircle,
  },

  // Payment Reports
  report_pending: {
    labelEn: "Pending Review",
    labelUrdu: "زیرِ جائزہ",
    classes: "bg-amber-50 text-amber-800 border-amber-200",
    icon: Clock,
  },
  report_confirmed: {
    labelEn: "Confirmed",
    labelUrdu: "تصدیق شدہ",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  report_rejected: {
    labelEn: "Rejected",
    labelUrdu: "مسترد",
    classes: "bg-rose-50 text-rose-800 border-rose-200",
    icon: XCircle,
  },

  // Sales Ledger Entry Types
  sale_verified: {
    labelEn: "Sale Verified",
    labelUrdu: "فروخت تصدیق شدہ",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  refund_adjustment: {
    labelEn: "Refund Adjustment",
    labelUrdu: "رقم واپسی ایڈجسٹمنٹ",
    classes: "bg-rose-50 text-rose-800 border-rose-200",
    icon: AlertCircle,
  },
  manual_correction: {
    labelEn: "Manual Correction",
    labelUrdu: "دستی درستگی",
    classes: "bg-indigo-50 text-indigo-800 border-indigo-200",
    icon: FileText,
  },
};

const defaultStatusMeta: StatusMeta = {
  labelEn: "Unknown",
  labelUrdu: "نامعلوم",
  classes: "bg-gray-100 text-gray-700 border-gray-200",
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
