import type { Metadata } from 'next';
import AimNodePage from '@/app/aim-node/page';

export const metadata: Metadata = {
  title: 'AIM Node — Run & Monetize AI Models | ai.market',
  description:
    'AIM Node lets you wrap any AI model as an MCP tool, connect to ai.market, and start earning. Download for macOS, Linux, or Docker.',
};

export default function DownloadAimNodePage() {
  return <AimNodePage />;
}
