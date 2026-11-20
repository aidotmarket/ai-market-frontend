import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { SupportPrivateBoundary } from '@/components/SupportPrivateBoundary';

const plusJakarta = localFont({
  src: './fonts/PlusJakartaSans[wght].woff2',
  weight: '400 800',
  display: 'swap',
});

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
  // CC L1 accepted: /support/mailbox-account blocks this script; its fragment is a
  // support bearer, not a vz payload. Avoid request nonce reads to keep the root static.
  return (
    <html lang="en">
      <head><script dangerouslySetInnerHTML={{__html: `(function(){if(/(?:^#|&)vz(?:=|&|$)/.test(location.hash)){window.__vectoraizEntry={fragment:location.hash,route:location.pathname};history.replaceState(history.state,"",location.pathname+location.search)}})()`}} /></head>
      <body className={`${plusJakarta.className} min-h-screen bg-white text-gray-900 antialiased`}>
        <SupportPrivateBoundary>{children}</SupportPrivateBoundary>
      </body>
    </html>
  );
}
