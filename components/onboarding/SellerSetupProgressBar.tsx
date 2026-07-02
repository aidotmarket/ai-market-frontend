'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getConnectOnboarding,
  isConnectOnboardingTwoFactorRequired,
  redirectToConnectOnboarding,
} from '@/api/connect';
import {
  getCapabilities,
  type CapabilitySetResponse,
  type CapabilityStep,
} from '@/api/capabilities';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';

const CAPABILITIES_CHANGED_EVENT = 'capabilities:changed';

const STEPS: Array<{ id: CapabilityStep; label: string; href?: string }> = [
  { id: 'profile_name', label: 'Profile name', href: '/dashboard/settings#profile' },
  { id: 'company_name', label: 'Company name', href: '/dashboard/settings#company' },
  { id: 'totp_enabled', label: '2FA', href: '/dashboard/settings#security' },
  { id: 'stripe_payouts_live', label: 'Stripe payouts' },
];

export function notifyCapabilitiesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CAPABILITIES_CHANGED_EVENT));
  }
}

export default function SellerSetupProgressBar() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const { toast } = useToast();
  const [capabilities, setCapabilities] = useState<CapabilitySetResponse | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);

  const fetchCapabilities = useCallback(async () => {
    if (!isAuthenticated) {
      setCapabilities(null);
      return;
    }

    try {
      setCapabilities(await getCapabilities());
    } catch (err) {
      console.error('Failed to fetch seller setup capabilities', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLoading) return;
    fetchCapabilities();
  }, [fetchCapabilities, isLoading]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const onFocus = () => fetchCapabilities();
    const onCapabilitiesChanged = () => fetchCapabilities();

    window.addEventListener('focus', onFocus);
    window.addEventListener(CAPABILITIES_CHANGED_EVENT, onCapabilitiesChanged);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(CAPABILITIES_CHANGED_EVENT, onCapabilitiesChanged);
    };
  }, [fetchCapabilities, isAuthenticated]);

  const seller = capabilities?.seller;
  const missingSteps = useMemo(() => new Set(seller?.missing_steps ?? []), [seller?.missing_steps]);
  const doneCount = seller ? STEPS.length - seller.missing_steps.length : 0;
  const nextStep = capabilities?.next_action?.capability === 'seller' ? capabilities.next_action.step : null;
  const stripeChecking = seller?.reason === 'durable_signal_unavailable' && missingSteps.has('stripe_payouts_live');

  if (!isAuthenticated || isLoading || seller?.effective_status !== 'provisioning') {
    return null;
  }

  const goToStep = async (step: CapabilityStep) => {
    if (step === 'stripe_payouts_live') {
      setStripeLoading(true);
      try {
        const res = await getConnectOnboarding();
        redirectToConnectOnboarding(res.data);
      } catch (err) {
        if (isConnectOnboardingTwoFactorRequired(err)) {
          toast('Complete 2FA setup before connecting payouts.', 'info');
        } else {
          toast('Failed to start Stripe connection', 'error');
        }
        setStripeLoading(false);
      }
      return;
    }

    const href = STEPS.find((item) => item.id === step)?.href ?? '/dashboard/settings';
    router.push(href);
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-5 right-5 z-40 rounded-full border border-[#C5CAE9] bg-white px-4 py-3 text-sm font-semibold text-[#3F51B5] shadow-lg hover:bg-[#F8F9FF]"
        aria-label="Expand seller setup progress"
      >
        Seller setup {doneCount} of {STEPS.length}
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[calc(100vw-2.5rem)] max-w-md rounded-lg border border-gray-200 bg-white shadow-xl">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Finish seller setup</p>
          <p className="mt-0.5 text-xs text-gray-500">{doneCount} of {STEPS.length} complete</p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Collapse seller setup progress"
        >
          Hide
        </button>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-[#3F51B5] transition-all"
            style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="space-y-2">
          {STEPS.map((step) => {
            const done = !missingSteps.has(step.id);
            const isNext = nextStep === step.id;
            const label = step.id === 'stripe_payouts_live' && stripeChecking ? 'Checking payouts...' : step.label;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => goToStep(step.id)}
                disabled={stripeLoading && step.id === 'stripe_payouts_live'}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  isNext ? 'bg-[#F8F9FF] text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs ${done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {done ? '✓' : '○'}
                  </span>
                  <span className="truncate">{label}</span>
                </span>
                {isNext && <span className="ml-3 flex-shrink-0 text-xs font-medium text-[#3F51B5]">Next</span>}
              </button>
            );
          })}
        </div>

        {nextStep && (
          <button
            type="button"
            onClick={() => goToStep(nextStep)}
            disabled={stripeLoading}
            className="w-full rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stripeLoading ? 'Opening Stripe...' : `Continue: ${STEPS.find((step) => step.id === nextStep)?.label ?? 'Next step'}`}
          </button>
        )}
      </div>
    </div>
  );
}
