import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/protocol' },
};

export default function ProtocolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
