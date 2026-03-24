import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import { Layout } from '@/components/Layout';
import { AllAIProvider } from '@/components/allai/AllAIContext';
import AllAIFab from '@/components/allai/AllAIFab';
import AllAIPanel from '@/components/allai/AllAIPanel';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ai.market — B2B Data Marketplace',
    template: '%s | ai.market',
  },
  description: 'The marketplace where datasets become findable, queryable, and purchasable by AI systems.',
  metadataBase: new URL('https://ai.market'),
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    siteName: 'ai.market',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
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
