import React from "react";
import { cn } from "@/lib/utils";
import { UrduText } from "@/components/urdu/UrduText";
import { BookOpen } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  titleUrdu?: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon = BookOpen,
  title = "No Urdu Novels Found",
  titleUrdu = "فی الوقت کوئی ناول دستیاب نہیں ہے",
  description = "No items match your criteria. Explore other genres or check back soon as writers upload new chapters.",
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-12 text-center bg-surface rounded-2xl border border-border/80 shadow-card",
        className
      )}
    >
      <div className="w-16 h-16 rounded-full bg-ivory-dark flex items-center justify-center text-navy mb-4 border border-border">
        <Icon className="w-8 h-8 text-accent" />
      </div>

      <h3 className="font-serif text-xl font-bold text-navy mb-1">{title}</h3>
      {titleUrdu && (
        <UrduText size="base" className="text-navy/80 mb-2 py-0">
          {titleUrdu}
        </UrduText>
      )}

      {description && (
        <p className="text-sm text-secondary max-w-md mb-6 leading-relaxed">
          {description}
        </p>
      )}

      {actionLabel && (
        <>
          {actionHref ? (
            <Link
              href={actionHref}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-navy hover:bg-navy-light text-white text-sm font-medium transition-all shadow-sm hover:shadow"
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              onClick={onAction}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-navy hover:bg-navy-light text-white text-sm font-medium transition-all shadow-sm hover:shadow"
            >
              {actionLabel}
            </button>
          )}
        </>
      )}
    </div>
  );
}
