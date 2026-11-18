import Link from 'next/link';

const steps: Record<string, { label: string; href: string }> = {
  profile_name: { label: 'Add your name', href: '/dashboard/settings#profile' },
  company_name: { label: 'Add your company name', href: '/dashboard/settings#company' },
  totp_enabled: { label: 'Turn on two-step sign-in', href: '/dashboard/settings#security' },
  stripe_payouts_live: { label: 'Finish Stripe payouts setup', href: '/dashboard' },
};

export default function SellerSetupPanel({ missingSteps }: { missingSteps: string[] }) {
  return <section aria-label="Seller setup" className="space-y-3 rounded border bg-white p-4">
    <p>Before you can connect a gateway, finish these steps:</p>
    <ul className="space-y-2">
      {missingSteps.map((step, index) => {
        const item = Object.hasOwn(steps, step) ? steps[step] : undefined;
        return <li key={`${step}-${index}`}>{item
          ? <Link className="text-indigo-700 underline" href={item.href}>{item.label}</Link>
          : 'Complete the remaining seller setup step on your dashboard.'}</li>;
      })}
    </ul>
    {missingSteps.length === 0 && <p>Check your seller setup on your dashboard, then try again.</p>}
  </section>;
}
