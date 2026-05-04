import type { Metadata } from 'next';
import AimNodePage from '@/app/aim-node/page';

export const metadata: Metadata = {
  title: 'AIM-Node: Gateway Client for ai.market | ai.market',
  description:
    'AIM-Node is the gateway client for building against ai.market. Connect to the non-custodial data marketplace from your own infrastructure. Download for macOS, Linux, or Docker.',
};

export default function DownloadAimNodePage() {
  return <AimNodePage />;
}
