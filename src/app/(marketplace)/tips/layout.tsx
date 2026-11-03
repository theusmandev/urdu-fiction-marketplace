import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reader Appreciation',
  robots: {
    index: false,
    follow: false,
  },
};

export default function TipsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

