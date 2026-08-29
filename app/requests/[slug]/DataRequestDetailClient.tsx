'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import {
  getDataRequest,
  publishDataRequest,
  deleteDataRequest,
  submitDataRequestResponse,
  getDataRequestResponses,
  confirmDataRequestPublication,
  withdrawDataRequestPublication,
} from '@/api/data-requests';
import { formatDate } from '@/lib/format';
import { AxiosError } from 'axios';
import type { DataRequestDetail, DataRequestResponse, DataRequestUrgency } from '@/types';

const URGENCY_BADGE: Record<DataRequestUrgency, string> = {
  low: 'bg-gray-100 text-gray-700',
  normal: 'bg-[#E8EAF6] text-[#3F51B5]',
  high: 'bg-amber-100 text-amber-800',
  urgent: 'bg-red-100 text-red-800',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-green-100 text-green-800',
  responses_received: 'bg-[#E8EAF6] text-[#303F9F]',
  fulfilled: 'bg-purple-100 text-purple-800',
  closed: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-700',
};

interface DataRequestDetailClientProps {
  slug: string;
  initialRequest: DataRequestDetail | null;
}

export default function DataRequestDetailClient({
  slug,
  initialRequest,
}: DataRequestDetailClientProps) {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const { toast } = useToast();

  const [request, setRequest] = useState<DataRequestDetail | null>(initialRequest);
  const [responses, setResponses] = useState<DataRequestResponse[]>([]);
  const [loading, setLoading] = useState(initialRequest === null);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingPublication, setUpdatingPublication] = useState(false);

  // Response form
  const [proposal, setProposal] = useState('');
  const [proposedPrice, setProposedPrice] = useState('');
  const [timeline, setTimeline] = useState('');
  const [submittingResponse, setSubmittingResponse] = useState(false);

  const isOwner = user && request && user.id === request.buyer_id;

  const loadData = useCallback(async () => {
    try {
      const data = await getDataRequest(slug);
      setRequest(data);

      // Load responses if owner
      if (data && user && user.id === data.buyer_id) {
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
      toast(
        updated.publication_decision === 'eligible'
          ? 'Your request is open and available to the market.'
          : 'Your request is open. Review the public visibility step below.',
        'success'
      );
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

  async function handleConfirmPublication() {
    if (!request?.public_content_hash || !request.required_public_consent_policy_version) return;
    setUpdatingPublication(true);
    try {
      const updated = await confirmDataRequestPublication(
        request.id,
        request.public_content_hash,
        request.required_public_consent_policy_version
      );
      setRequest(updated);
      toast(
        updated.publication_decision === 'eligible'
          ? 'Your request is now available to the market.'
          : 'Your publication choice was saved. The status below explains what happens next.',
        'success'
      );
    } catch (err) {
      if (err instanceof AxiosError) {
        toast(err.response?.data?.detail || 'Failed to update public visibility.', 'error');
      } else {
        toast('An unexpected error occurred.', 'error');
      }
    } finally {
      setUpdatingPublication(false);
    }
  }

  async function handleWithdrawPublication() {
    if (!request) return;
    setUpdatingPublication(true);
    try {
      const updated = await withdrawDataRequestPublication(request.id);
      setRequest(updated);
      toast('Your request is now private.', 'success');
    } catch (err) {
      if (err instanceof AxiosError) {
        toast(err.response?.data?.detail || 'Failed to update public visibility.', 'error');
      } else {
        toast('An unexpected error occurred.', 'error');
      }
    } finally {
      setUpdatingPublication(false);
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Request not found</h1>
        <p className="text-gray-500 mb-6">This data request was removed or does not exist.</p>
        <Link
          href="/requests"
          className="rounded-lg bg-[#3F51B5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0]"
        >
          Browse Requests
        </Link>
      </div>
    );
  }

  const urgencyCss = URGENCY_BADGE[request.urgency] || URGENCY_BADGE.low;
  const statusCss = STATUS_BADGE[request.status] || STATUS_BADGE.draft;
  const canConfirmPublication =
    Boolean(request.public_content_hash) &&
    Boolean(request.required_public_consent_policy_version) &&
    ['public_consent_required', 'public_content_changed', 'consent_withdrawn'].includes(
      request.publication_reason || ''
    );
  const canWithdrawPublication = request.public_consent_status === 'consented';

  const priceRange =
    request.price_range_min != null || request.price_range_max != null
      ? `${request.price_range_min != null ? `$${request.price_range_min.toLocaleString()}` : ''}${request.price_range_min != null && request.price_range_max != null ? ' – ' : ''}${request.price_range_max != null ? `$${request.price_range_max.toLocaleString()}` : ''} ${request.currency || 'USD'}`
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link href="/requests" className="text-sm text-[#3F51B5] hover:underline mb-6 inline-block">
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
          {!priceRange && <span>Currency: {request.currency || 'USD'}</span>}
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
              {publishing ? 'Opening...' : 'Open request'}
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

      {isOwner && request.publication_decision && (
        <section className="rounded-xl border border-[#D8DDF4] bg-[#F7F8FE] p-5 mb-6" aria-labelledby="publication-status-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="publication-status-heading" className="font-semibold text-gray-900">
                Public visibility: {request.publication_decision === 'eligible' ? 'Public' : 'Private'}
              </h2>
              <p className="mt-1 text-sm text-gray-700">
                {request.publication_next_action || 'No public action is available.'}
              </p>
              {request.publication_reason && request.publication_reason !== 'eligible' && (
                <p className="mt-1 text-xs text-gray-500">
                  Reason: {request.publication_reason.replaceAll('_', ' ')}
                </p>
              )}
            </div>
            {request.publication_reason === 'automated_check_unavailable' && (
              <span className="inline-flex w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                Automatic check pending
              </span>
            )}
          </div>

          {canConfirmPublication && (
            <div className="mt-4 border-t border-[#D8DDF4] pt-4">
              <p className="mb-3 text-sm text-gray-700">
                By making this request public, you agree that the request details shown on this page may appear on ai.market, in search engines, to AI agents, and in relevant seller alerts. Your full account profile is not included; your existing public buyer name may appear. Do not put contact details in the request text.
              </p>
              <button
                type="button"
                onClick={handleConfirmPublication}
                disabled={updatingPublication}
                className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50"
              >
                {updatingPublication ? 'Updating...' : 'Make this request public'}
              </button>
            </div>
          )}

          {canWithdrawPublication && (
            <div className="mt-4 border-t border-[#D8DDF4] pt-4">
              <p className="mb-3 text-sm text-gray-700">
                You can remove this request from public discovery without deleting your work.
              </p>
              <button
                type="button"
                onClick={handleWithdrawPublication}
                disabled={updatingPublication}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {updatingPublication ? 'Updating...' : 'Make this request private'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Description */}
      <div className="rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Request</h2>
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
        {request.format_preferences?.length > 0 && (
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Preferred Formats</h3>
            <p className="text-sm text-gray-800">{request.format_preferences.join(', ')}</p>
          </div>
        )}
        {request.regulatory_requirements && request.regulatory_requirements.length > 0 && (
          <div className="rounded-xl border border-gray-200 p-4 sm:col-span-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Regulatory Requirements</h3>
            <p className="text-sm text-gray-800">{request.regulatory_requirements.join(', ')}</p>
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Respond to Request</h2>
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
                placeholder="Describe the data you can provide and how it meets the request."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submittingResponse || !proposal.trim()}
              className="rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="rounded-lg bg-[#3F51B5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0]"
          >
            Log in to Respond
          </Link>
        </div>
      )}
    </div>
  );
}
