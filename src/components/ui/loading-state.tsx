import React from "react";
import { cn } from "@/lib/utils";
import { UrduText } from "@/components/urdu/UrduText";

interface LoadingStateProps {
  title?: string;
  titleUrdu?: string;
  description?: string;
  variant?: "fullscreen" | "inline" | "card";
  className?: string;
}

export function LoadingState({
  title = "Loading Urdu Literature...",
  titleUrdu = "مواد لوڈ ہو رہا ہے، براہ کرم انتظار فرمائیں...",
  description,
  variant = "card",
  className,
}: LoadingStateProps) {
  const containerClasses = {
    fullscreen: "min-h-[70vh] flex flex-col items-center justify-center p-8",
    card: "p-12 flex flex-col items-center justify-center border border-border/80 bg-surface rounded-xl shadow-card",
    inline: "p-4 flex items-center justify-center gap-3",
  }[variant];

  return (
    <div className={cn(containerClasses, className)} role="status" aria-live="polite">
      {/* Editorial Luxury Spinner with Navy & Gold Dual Rings */}
      <div className="relative w-12 h-12 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-border/60" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent border-r-navy animate-spin" />
        <div className="w-2 h-2 rounded-full bg-accent animate-ping" />
      </div>

      <div className="mt-4 text-center space-y-1">
        <p className="font-serif text-base font-semibold text-navy tracking-wide">
          {title}
        </p>
        {titleUrdu && (
          <UrduText size="sm" className="text-secondary py-0">
            {titleUrdu}
          </UrduText>
        )}
        {description && (
          <p className="text-xs text-secondary max-w-sm mt-1">{description}</p>
        )}
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
