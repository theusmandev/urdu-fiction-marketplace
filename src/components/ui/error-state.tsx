import React from "react";
import { cn } from "@/lib/utils";
import { UrduText } from "@/components/urdu/UrduText";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";

interface ErrorStateProps {
  title?: string;
  titleUrdu?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  titleUrdu = "ایک غیر متوقع مسئلہ پیش آیا ہے",
  message = "We encountered an error while communicating with the database. Please try again or reach out to support.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-10 text-center bg-surface rounded-2xl border border-danger-border shadow-card",
        className
      )}
      role="alert"
    >
      <div className="w-14 h-14 rounded-full bg-danger-soft border border-danger-border flex items-center justify-center text-danger-text mb-4">
        <AlertTriangle className="w-7 h-7" />
      </div>

      <h3 className="font-serif text-xl font-bold text-navy mb-1">{title}</h3>
      {titleUrdu && (
        <UrduText size="base" className="text-danger-text/80 mb-2 py-0">
          {titleUrdu}
        </UrduText>
      )}

      {message && (
        <p className="text-sm text-secondary max-w-md mb-6 leading-relaxed">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy hover:bg-navy-light text-white text-sm font-medium transition-all shadow-sm"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
        )}
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-ivory border border-border hover:bg-ivory-dark text-navy text-sm font-medium transition-all"
        >
          <Home className="w-4 h-4" />
          <span>Return Home</span>
        </Link>
      </div>
    </div>
  );
}
