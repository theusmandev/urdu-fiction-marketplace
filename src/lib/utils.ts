import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind and conditional classes cleanly.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format currency in Pakistani Rupees (PKR)
 */
export function formatPKR(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amount).replace("PKR", "Rs.");
}

/**
 * Resolves a novel cover URL from either a full URL or a storage path.
 */
export function resolveCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const cleanPath = trimmed.replace(/^\/+/, "");
  if (!baseUrl) return trimmed;
  if (cleanPath.startsWith("novel-assets/")) {
    return `${baseUrl}/storage/v1/object/public/${cleanPath}`;
  }
  return `${baseUrl}/storage/v1/object/public/novel-assets/${cleanPath}`;
}

