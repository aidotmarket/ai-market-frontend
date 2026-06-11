import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from '@/components/Providers';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

import { Layout } from '@/components/Layout';
import { AllAIProvider } from '@/components/allai/AllAIContext';
import AllAIFab from '@/components/allai/AllAIFab';
import AllAIPanel from '@/components/allai/AllAIPanel';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ai.market - Sell data without giving it away',
    template: '%s | ai.market',
  },
  description: "Non-custodial B2B data marketplace. Data stays on the seller's infrastructure, only metadata is published. Search, post requests, and buy with peer-to-peer delivery. 5% commission, no listing fees.",
  metadataBase: new URL('https://ai.market'),
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    siteName: 'ai.market',
    type: 'website',
    description: "Non-custodial B2B data marketplace. Data stays on the seller's infrastructure, only metadata is published. Search, post requests, and buy with peer-to-peer delivery. 5% commission, no listing fees.",
  },
  twitter: {
    description: "Non-custodial B2B data marketplace. Data stays on the seller's infrastructure, only metadata is published. Search, post requests, and buy with peer-to-peer delivery. 5% commission, no listing fees.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${plusJakarta.className} min-h-screen bg-white text-gray-900 antialiased`}>
        <Providers>
          <AllAIProvider>
            <Layout>{children}</Layout>
            <AllAIFab />
            <AllAIPanel />
          </AllAIProvider>
        </Providers>
      </body>
    </html>
  );
}
