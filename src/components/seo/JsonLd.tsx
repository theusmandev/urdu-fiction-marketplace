import React from "react";

export interface JsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

/**
 * JsonLd Component
 * Safely renders JSON-LD structured data script tag with Unicode escaping for `<`
 * to protect against HTML injection and script breakout.
 */
export function JsonLd({ data }: JsonLdProps) {
  const jsonString = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonString }}
    />
  );
}

