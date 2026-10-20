import { redirect } from 'next/navigation';

export default function WalletTopupEntry() {
  redirect('/dashboard/settings/wallet');
}
