'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { createDataRequest } from '@/api/data-requests';
import { buyerRequestAnonymizationEnabled, ownerRequestHref } from '@/lib/buyer-request-publication';
import { AxiosError } from 'axios';
import type { DataRequestUrgency } from '@/types';

const CATEGORIES = [
  'healthcare', 'finance', 'technology', 'retail',
  'real-estate', 'marketing', 'government', 'other',
];

export default function NewDataRequestPage() {
  const { user, isAuthenticated } = useAuthStore();
  const [visit, setVisit] = useState(0);
  const retireVisit = useCallback(() => setVisit((value) => value + 1), []);
  const accountId = isAuthenticated ? user?.id ?? null : null;

  return <RequestForm key={JSON.stringify([accountId, visit])} accountId={accountId}
    retireVisit={retireVisit} />;
}

function RequestForm({ accountId, retireVisit }: {
  accountId: string | null;
  retireVisit: () => void;
}) {
  const { isAuthenticated, isLoading, hydrated } = useAuthStore();
  const router = useRouter();
  const { toast } = useToast();


  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState('');
  const [formatPreferences, setFormatPreferences] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [urgency, setUrgency] = useState<DataRequestUrgency>('normal');
  const [provenanceRequirements, setProvenanceRequirements] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const lifetime = useRef<{ active: boolean } | null>(null);

  useLayoutEffect(() => {
    // Each setup gets a fresh owner, including StrictMode effect replay.
    const owner = { active: true };
    lifetime.current = owner;
    const unsubscribe = useAuthStore.subscribe((state) => {
      const identity = state.isAuthenticated ? state.user?.id ?? null : null;
      if (owner.active && identity !== accountId) {
        owner.active = false;
        // Also retire a batched A -> B -> A visit whose final React key is A.
        retireVisit();
      }
    });
    return () => {
      owner.active = false;
      unsubscribe();
    };
  }, [accountId, retireVisit]);

  if (isLoading || !hydrated || (isAuthenticated && !accountId)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    router.push(`/login?redirect=${encodeURIComponent('/requests/new')}`);
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900">Post a data request</h1>
        <p className="mt-3 text-gray-600">Tell sellers what data you need. It's free, and sellers who have it come to you.</p>
        <div className="mt-6 flex flex-col items-start gap-4">
          <Link href="/login?redirect=%2Frequests%2Fnew" className="rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0]">Sign in to post your request</Link>
          <Link href="/register" className="text-sm font-medium text-[#3F51B5] underline">Create a free account</Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const owner = lifetime.current;
    const isCurrent = () => {
      const state = useAuthStore.getState();
      return owner?.active && lifetime.current === owner && state.isAuthenticated
        && state.user?.id === accountId;
    };
    if (!description.trim() || submitting || !isCurrent()) return;

    setSubmitting(true);
    try {
      const parsedCategories = categories
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const result = await createDataRequest({
        description: description.trim(),
        categories: parsedCategories.length > 0 ? parsedCategories : undefined,
        format_preferences: formatPreferences.trim()
          ? formatPreferences.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        price_range_min: priceMin ? parseFloat(priceMin) : undefined,
        price_range_max: priceMax ? parseFloat(priceMax) : undefined,
        currency: 'USD',
        urgency,
        provenance_requirements: provenanceRequirements.trim() || undefined,
      });

      if (!isCurrent()) return;
      toast('Saved as a draft. Review it and publish when you\'re ready.', 'success');
      router.push(ownerRequestHref(result));
    } catch (err) {
      if (!isCurrent()) return;
      if (buyerRequestAnonymizationEnabled()) {
        toast('Could not save your draft. Try again.', 'error');
      } else if (err instanceof AxiosError) {
        const detail = err.response?.data?.detail;
        let message = 'Failed to create data request.';
        if (typeof detail === 'string') {
          message = detail;
        } else if (Array.isArray(detail) && detail.length > 0) {
          // FastAPI validation 422 shape: [{type, loc, msg}, ...]
          message = detail
            .map((d: { msg?: string; loc?: (string | number)[] }) => {
              const field = Array.isArray(d?.loc) ? d.loc.filter((x) => x !== 'body').join('.') : '';
              return field ? `${field}: ${d?.msg ?? 'invalid'}` : (d?.msg ?? 'invalid');
            })
            .join('; ');
        } else if (detail && typeof detail === 'object') {
          message = JSON.stringify(detail);
        }
        toast(message, 'error');
      } else {
        toast('An unexpected error occurred.', 'error');
      }
    } finally {
      if (isCurrent()) setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Post a data request</h1>
      <p className="text-sm text-gray-500 mb-8">
          Describe the data you need. We save it as a draft so you can review it before it goes live.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="description"
            required
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the data you need, how you will use it, and any requirements."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
          />
        </div>

        {/* Categories */}
        <div>
          <label htmlFor="categories" className="block text-sm font-medium text-gray-700 mb-1">
            Categories
          </label>
          <input
            id="categories"
            type="text"
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="e.g., retail, marketing (comma-separated)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
          />
          <p className="mt-1 text-xs text-gray-400">
            Suggested: {CATEGORIES.join(', ')}
          </p>
        </div>

        {/* Format Preferences */}
        <div>
          <label htmlFor="format" className="block text-sm font-medium text-gray-700 mb-1">
            Preferred Formats
          </label>
          <input
            id="format"
            type="text"
            value={formatPreferences}
            onChange={(e) => setFormatPreferences(e.target.value)}
            placeholder="e.g., CSV, JSON, Parquet"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
          />
        </div>

        {/* Price range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="priceMin" className="block text-sm font-medium text-gray-700 mb-1">
              Min Budget (USD)
            </label>
            <input
              id="priceMin"
              type="number"
              min="0"
              step="0.01"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            />
          </div>
          <div>
            <label htmlFor="priceMax" className="block text-sm font-medium text-gray-700 mb-1">
              Max Budget (USD)
            </label>
            <input
              id="priceMax"
              type="number"
              min="0"
              step="0.01"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="10000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            />
          </div>
        </div>

        {/* Urgency */}
        <div>
          <label htmlFor="urgency" className="block text-sm font-medium text-gray-700 mb-1">
            Urgency
          </label>
          <select
            id="urgency"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as DataRequestUrgency)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        {/* Provenance Requirements */}
        <div>
          <label htmlFor="provenance" className="block text-sm font-medium text-gray-700 mb-1">
            Where the data must come from (optional)
          </label>
          <textarea
            id="provenance"
            rows={3}
            value={provenanceRequirements}
            onChange={(e) => setProvenanceRequirements(e.target.value)}
            placeholder="Requirements for data origin, licensing, or compliance."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !description.trim()}
          className="w-full rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Saving draft' : 'Save draft'}
        </button>
      </form>
    </div>
  );
}
