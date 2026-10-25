import React from 'react';

export default function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans">
      <a
        href="#reader-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-stone-950 focus:font-semibold focus:rounded-xl focus:shadow-xl focus:outline-none"
      >
        Skip to reading content
      </a>
      <main id="reader-content" className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
