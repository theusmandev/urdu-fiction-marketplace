import React from "react";
import { cn } from "@/lib/utils";

type ArabicElementTag =
  | "p"
  | "span"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "div"
  | "blockquote";

export interface ArabicTextProps extends React.HTMLAttributes<HTMLElement> {
  as?: ArabicElementTag;
  size?: "sm" | "base" | "lg" | "xl" | "2xl";
  children: React.ReactNode;
  className?: string;
}

const sizeClasses: Record<NonNullable<ArabicTextProps["size"]>, string> = {
  sm: "text-sm leading-[2.0]",
  base: "text-base leading-[2.2]",
  lg: "text-lg leading-[2.3]",
  xl: "text-xl leading-[2.4]",
  "2xl": "text-2xl leading-[2.5]",
};

/**
 * ArabicText Component
 *
 * Dedicated opt-in component for Quranic verses, Hadith, and Arabic quotations with full harakat / tashkeel.
 * Uses classical Naskh typography (Amiri) to render diacritics precisely without ligature distortion.
 */
export function ArabicText({
  as: Component = "span",
  size = "base",
  children,
  className,
  ...props
}: ArabicTextProps) {
  return (
    <Component
      dir="rtl"
      lang="ar"
      className={cn(
        "font-arabic text-right select-text antialiased inline-block",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
