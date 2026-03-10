'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getListings, publishListing, unpublishListing, deleteListing } from '@/api/listings';
import { useToast } from '@/components/Toast';
import { formatPrice, formatDate } from '@/lib/format';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  published: 'bg-green-100 text-green-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  suspended: 'bg-red-100 text-red-800',
  archived: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  pending_review: 'Pending Review',
  suspended: 'Suspended',
  archived: 'Archived',
};

export default function ListingsPage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getListings();
      setListings(res.data || []);
    } catch {
      setError('Failed to load listings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handlePublish = async (id: string) => {
    setActionLoading(id);
    try {
      await publishListing(id);
      toast('Listing published', 'success');
      fetchListings();
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to publish', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnpublish = async (id: string) => {
    setActionLoading(id);
    try {
      await unpublishListing(id);
      toast('Listing unpublished', 'success');
      fetchListings();
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to unpublish', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      await deleteListing(id);
      toast('Listing deleted', 'success');
      setDeleteConfirm(null);
      fetchListings();
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to delete', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-sm text-red-700 mb-4">{error}</p>
        <button
          onClick={fetchListings}
          className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Your Listings</h1>
        <Link
          href="/dashboard/listings/new"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create New Listing
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No listings yet</h3>
          <p className="mt-2 text-sm text-gray-500">Get started by creating your first data listing.</p>
          <div className="mt-6">
            <Link
              href="/dashboard/listings/new"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create your first listing
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Title
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Category
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Price
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {listings.map((listing) => (
                <tr key={listing.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{listing.title}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[listing.status] || 'bg-gray-100 text-gray-800'}`}>
                      {STATUS_LABELS[listing.status] || listing.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {listing.category}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatPrice(listing.price)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatDate(listing.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {listing.status === 'draft' && (
                        <button
                          onClick={() => handlePublish(listing.id)}
                          disabled={actionLoading === listing.id}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          Publish
                        </button>
                      )}
                      {listing.status === 'published' && (
                        <button
                          onClick={() => handleUnpublish(listing.id)}
                          disabled={actionLoading === listing.id}
                          className="text-xs font-medium text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
                        >
                          Unpublish
                        </button>
                      )}
                      {deleteConfirm === listing.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(listing.id)}
                            disabled={actionLoading === listing.id}
                            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-xs font-medium text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(listing.id)}
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
