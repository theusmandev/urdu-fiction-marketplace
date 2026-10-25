import React from "react";
import { cn } from "@/lib/utils";

type UrduElementTag =
  | "p"
  | "span"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "div"
  | "blockquote"
  | "article";

export interface UrduTextProps extends React.HTMLAttributes<HTMLElement> {
  as?: UrduElementTag;
  size?: "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
  variant?: "title" | "body" | "quote" | "caption";
  children: React.ReactNode;
  className?: string;
}

const sizeClasses: Record<NonNullable<UrduTextProps["size"]>, string> = {
  xs: "text-xs leading-[1.8]",
  sm: "text-sm leading-[1.9]",
  base: "text-base leading-[2.0]",
  lg: "text-lg leading-[2.1]",
  xl: "text-xl leading-[2.2]",
  "2xl": "text-2xl leading-[2.3]",
  "3xl": "text-3xl leading-[2.4]",
  "4xl": "text-4xl leading-[2.5]",
};

/**
 * UrduText Component
 * 
 * First-class Urdu RTL wrapper tailored specifically for Gulzar Nastaliq calligraphy.
 * Automatically enforces:
 *  - dir="rtl" and lang="ur"
 *  - font-urdu family (Gulzar)
 *  - font-synthesis: none to prevent browser-generated synthetic bold/italic
 *  - Calibrated line heights preserving ascenders and descenders
 *  - Cursive word spacing and bidirectional rendering isolation
 */
export function UrduText({
  as: Component = "p",
  size = "base",
  variant = "body",
  children,
  className,
  ...props
}: UrduTextProps) {
  const variantClasses = {
    title: "tracking-normal text-navy pb-0.5 pt-0.5",
    body: "font-normal text-main/90",
    quote: "border-r-4 border-accent pr-4 my-2 text-main/90",
    caption: "text-xs text-secondary leading-[1.8]",
  }[variant];

  return (
    <Component
      dir="rtl"
      lang="ur"
      className={cn(
        "font-urdu text-right select-text antialiased [font-synthesis:none]",
        sizeClasses[size],
        variantClasses,
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * BilingualBadge or Inline Mixed Text Container
 * Isolates Latin/Urdu boundaries so numerals or English words don't invert Urdu sentence ordering.
 */
export function BilingualSnippet({
  urdu,
  latin,
  reverse = false,
  className,
}: {
  urdu: string;
  latin?: string | React.ReactNode;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 flex-wrap",
        reverse ? "flex-row-reverse" : "flex-row",
        className
      )}
    >
      <UrduText as="span" size="sm" className="inline leading-normal py-0">
        {urdu}
      </UrduText>
      {latin && (
        <span dir="ltr" className="text-xs font-medium text-secondary">
          {latin}
        </span>
      )}
    </div>
  );
}
