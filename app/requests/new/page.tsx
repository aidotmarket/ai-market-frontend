'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { createDataRequest } from '@/api/data-requests';
import { AxiosError } from 'axios';
import type { DataRequestUrgency } from '@/types';

const CATEGORIES = [
  'healthcare', 'finance', 'technology', 'retail',
  'real-estate', 'marketing', 'government', 'other',
];

export default function NewDataRequestPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent('/requests/new')}`);
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;

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

      toast('Data request created as draft. Publish it from the detail page.', 'success');
      router.push(`/requests/${result.slug}`);
    } catch (err) {
      if (err instanceof AxiosError) {
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
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Post a Data Request</h1>
      <p className="text-sm text-gray-500 mb-8">
        Describe the data you need. We create it as a draft. Publish it from the detail page.
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
            Provenance Requirements
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
          {submitting ? 'Creating...' : 'Create Data Request'}
        </button>
      </form>
    </div>
  );
}
