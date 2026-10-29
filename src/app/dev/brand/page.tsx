import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DevBrandClient } from './DevBrandClient';

export const metadata: Metadata = {
  title: 'Brand Vector Logo Inspection & Legibility Matrix — Development Only',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DevBrandPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <DevBrandClient />;
}

