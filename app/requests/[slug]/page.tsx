'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import {
  getDataRequest,
  publishDataRequest,
  deleteDataRequest,
  submitDataRequestResponse,
  getDataRequestResponses,
} from '@/api/data-requests';
import { formatDate } from '@/lib/format';
import { AxiosError } from 'axios';
import type { DataRequestDetail, DataRequestResponse, DataRequestUrgency } from '@/types';

const URGENCY_BADGE: Record<DataRequestUrgency, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-800',
  urgent: 'bg-red-100 text-red-800',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-green-100 text-green-800',
  responses_received: 'bg-blue-100 text-blue-800',
  fulfilled: 'bg-purple-100 text-purple-800',
  closed: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-700',
};

export default function DataRequestDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const { toast } = useToast();

  const [request, setRequest] = useState<DataRequestDetail | null>(null);
  const [responses, setResponses] = useState<DataRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Response form
  const [proposal, setProposal] = useState('');
  const [proposedPrice, setProposedPrice] = useState('');
  const [timeline, setTimeline] = useState('');
  const [submittingResponse, setSubmittingResponse] = useState(false);

  const isOwner = user && request && user.id === request.owner_id;

  const loadData = useCallback(async () => {
    try {
      const data = await getDataRequest(slug);
      setRequest(data);

      // Load responses if owner
      if (data && user && user.id === data.owner_id) {
        try {
          const resps = await getDataRequestResponses(data.id);
          setResponses(resps);
        } catch {
          // May not have permission
        }
      }
    } catch {
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [slug, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handlePublish() {
    if (!request) return;
    setPublishing(true);
    try {
      const updated = await publishDataRequest(request.id);
      setRequest(updated);
      toast('Data request published successfully.', 'success');
    } catch (err) {
      if (err instanceof AxiosError) {
        toast(err.response?.data?.detail || 'Failed to publish.', 'error');
      } else {
        toast('An unexpected error occurred.', 'error');
      }
    } finally {
      setPublishing(false);
    }
  }

  async function handleDelete() {
    if (!request) return;
    setDeleting(true);
    try {
      await deleteDataRequest(request.id);
      toast('Data request deleted.', 'success');
      router.push('/dashboard/requests');
    } catch (err) {
      if (err instanceof AxiosError) {
        toast(err.response?.data?.detail || 'Failed to delete.', 'error');
      } else {
        toast('An unexpected error occurred.', 'error');
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmitResponse(e: React.FormEvent) {
    e.preventDefault();
    if (!request || !proposal.trim()) return;

    setSubmittingResponse(true);
    try {
      await submitDataRequestResponse(request.id, {
        proposal: proposal.trim(),
        proposed_price: proposedPrice ? parseFloat(proposedPrice) : undefined,
        timeline: timeline.trim() || undefined,
      });
      toast('Response submitted successfully.', 'success');
      setProposal('');
      setProposedPrice('');
      setTimeline('');
      // Reload to update response count
      loadData();
    } catch (err) {
      if (err instanceof AxiosError) {
        toast(err.response?.data?.detail || 'Failed to submit response.', 'error');
      } else {
        toast('An unexpected error occurred.', 'error');
      }
    } finally {
      setSubmittingResponse(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Request not found</h1>
        <p className="text-gray-500 mb-6">This data request may have been removed or doesn&apos;t exist.</p>
        <Link
          href="/requests"
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Browse Requests
        </Link>
      </div>
    );
  }

  const urgencyCss = URGENCY_BADGE[request.urgency] || URGENCY_BADGE.low;
  const statusCss = STATUS_BADGE[request.status] || STATUS_BADGE.draft;

  const priceRange =
    request.price_range_min != null || request.price_range_max != null
      ? `${request.price_range_min != null ? `$${request.price_range_min.toLocaleString()}` : ''}${request.price_range_min != null && request.price_range_max != null ? ' – ' : ''}${request.price_range_max != null ? `$${request.price_range_max.toLocaleString()}` : ''} ${request.currency || 'USD'}`
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link href="/requests" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
        &larr; Back to requests
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start gap-3 mb-3">
          <h1 className="text-2xl font-bold text-gray-900 flex-1">{request.title}</h1>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${statusCss}`}>
            {request.status.replace('_', ' ')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencyCss}`}>
            {request.urgency} urgency
          </span>
          {priceRange && <span className="font-medium text-gray-700">{priceRange}</span>}
          <span>Posted {formatDate(request.created_at)}</span>
          {request.buyer_display_name && <span>by {request.buyer_display_name}</span>}
          <span>{request.response_count} response{request.response_count !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Owner actions */}
      {isOwner && (
        <div className="flex gap-3 mb-6">
          {request.status === 'draft' && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {publishing ? 'Publishing...' : 'Publish'}
            </button>
          )}
          <Link
            href={`/requests/${request.slug}`}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      )}

      {/* Description */}
      <div className="rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Description</h2>
        <p className="text-gray-800 whitespace-pre-wrap">{request.description}</p>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {request.categories.length > 0 && (
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Categories</h3>
            <div className="flex flex-wrap gap-1.5">
              {request.categories.map((cat) => (
                <span key={cat} className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {cat}
                </span>
              ))}
            </div>
          </div>
        )}
        {request.format_preferences && (
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Format Preferences</h3>
            <p className="text-sm text-gray-800">{request.format_preferences}</p>
          </div>
        )}
        {request.provenance_requirements && (
          <div className="rounded-xl border border-gray-200 p-4 sm:col-span-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Provenance Requirements</h3>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{request.provenance_requirements}</p>
          </div>
        )}
      </div>

      {/* Owner: Responses list */}
      {isOwner && responses.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Responses ({responses.length})</h2>
          <div className="space-y-4">
            {responses.map((resp) => (
              <div key={resp.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500">{formatDate(resp.created_at)}</span>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    {resp.status}
                  </span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap mb-2">{resp.proposal}</p>
                <div className="flex gap-4 text-xs text-gray-500">
                  {resp.proposed_price != null && (
                    <span>Price: <span className="font-medium text-gray-700">${resp.proposed_price.toLocaleString()}</span></span>
                  )}
                  {resp.timeline && <span>Timeline: {resp.timeline}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seller: Submit Response form */}
      {isAuthenticated && !isOwner && (request.status === 'open' || request.status === 'responses_received') && (
        <div className="rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Submit a Response</h2>
          <form onSubmit={handleSubmitResponse} className="space-y-4">
            <div>
              <label htmlFor="proposal" className="block text-sm font-medium text-gray-700 mb-1">
                Proposal
              </label>
              <textarea
                id="proposal"
                required
                rows={4}
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
                placeholder="Describe the data you can provide and how it meets the requirements..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="resPrice" className="block text-sm font-medium text-gray-700 mb-1">
                  Proposed Price (USD)
                </label>
                <input
                  id="resPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={proposedPrice}
                  onChange={(e) => setProposedPrice(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="resTimeline" className="block text-sm font-medium text-gray-700 mb-1">
                  Timeline
                </label>
                <input
                  id="resTimeline"
                  type="text"
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  placeholder="e.g., 2 weeks"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submittingResponse || !proposal.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submittingResponse ? 'Submitting...' : 'Submit Response'}
            </button>
          </form>
        </div>
      )}

      {/* Not logged in CTA */}
      {!isAuthenticated && (request.status === 'open' || request.status === 'responses_received') && (
        <div className="rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-gray-600 mb-4">Have the data this buyer needs?</p>
          <Link
            href={`/login?redirect=${encodeURIComponent(`/requests/${request.slug}`)}`}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Log in to Respond
          </Link>
        </div>
      )}
    </div>
  );
}
