'use client';

import { useState } from 'react';
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

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState('');
  const [formatPreferences, setFormatPreferences] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [urgency, setUrgency] = useState<DataRequestUrgency>('medium');
  const [provenanceRequirements, setProvenanceRequirements] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    router.push(`/login?redirect=${encodeURIComponent('/requests/new')}`);
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const parsedCategories = categories
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const result = await createDataRequest({
        title: title.trim(),
        description: description.trim(),
        categories: parsedCategories.length > 0 ? parsedCategories : undefined,
        format_preferences: formatPreferences.trim() || undefined,
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
        toast(err.response?.data?.detail || 'Failed to create data request.', 'error');
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
        Describe the data you need. Your request will be created as a draft — you can publish it from the detail page.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., US retail foot traffic data for 2024"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

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
            placeholder="Describe exactly what data you're looking for, how you'll use it, and any requirements..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Suggested: {CATEGORIES.join(', ')}
          </p>
        </div>

        {/* Format Preferences */}
        <div>
          <label htmlFor="format" className="block text-sm font-medium text-gray-700 mb-1">
            Format Preferences
          </label>
          <input
            id="format"
            type="text"
            value={formatPreferences}
            onChange={(e) => setFormatPreferences(e.target.value)}
            placeholder="e.g., CSV, JSON, Parquet"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
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
            placeholder="Any requirements on data origin, licensing, compliance..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !title.trim() || !description.trim()}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Creating...' : 'Create Data Request'}
        </button>
      </form>
    </div>
  );
}
