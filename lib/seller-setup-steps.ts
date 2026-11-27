import type { CapabilityStep } from '@/api/capabilities';

export const SELLER_SETUP_STEPS: Array<{ id: CapabilityStep; label: string; href?: string }> = [
  { id: 'profile_name', label: 'Profile name', href: '/dashboard/settings#profile' },
  { id: 'company_name', label: 'Company name', href: '/dashboard/settings#company' },
  { id: 'totp_enabled', label: '2FA', href: '/dashboard/settings#security' },
  { id: 'stripe_payouts_live', label: 'Stripe payouts' },
];
