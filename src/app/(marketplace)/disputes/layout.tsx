import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Disputes',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DisputesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

