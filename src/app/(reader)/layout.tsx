import React from 'react';

export default function FreePreviewReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-area="marketplace"
      className="min-h-screen w-full flex flex-col font-sans"
    >
      <a
        href="#reader-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 bg-primary text-primary-contrast px-4 py-2 rounded-lg shadow-lg font-semibold border border-border"
      >
        Skip to reading content
      </a>
      <div id="reader-content" className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}

