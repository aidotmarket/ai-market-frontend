'use client';

import Link from 'next/link';
import type { AnonymousNextStep } from './AllAIContext';
import { useAllAI } from './AllAIContext';
import { anonymousAllAIResources } from '@/lib/i18n/anonymous-allai';

export default function AllAINextStep({ nextStep }: { nextStep: AnonymousNextStep }) {
  const { locale } = useAllAI();
  const resources = anonymousAllAIResources(locale);
  const href = nextStep.requires_account
    ? `/register?redirect=${encodeURIComponent(nextStep.url)}`
    : nextStep.url;

  return (
    <div className="mt-3 border-t border-white/10 pt-3" data-testid="allai-next-step">
      {nextStep.requires_account && (
        <p className="mb-2 text-xs text-white/50">{resources.accountRequired}</p>
      )}
      <Link
        href={href}
        className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        {nextStep.label}
      </Link>
    </div>
  );
}
