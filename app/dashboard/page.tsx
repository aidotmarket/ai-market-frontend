'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { getConnectStatus, getConnectOnboarding } from '@/api/connect';
import { getSellerStats } from '@/api/seller';
import { getListings } from '@/api/listings';
import { useToast } from '@/components/Toast';

const STRIPE_CONNECT_URL_PREFIX = 'https://connect.stripe.com/';

export default function DashboardOverview() {
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<{ details_submitted?: boolean; payouts_enabled?: boolean } | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [listingsCount, setListingsCount] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [statusRes, statsRes, listingsRes] = await Promise.all([
        getConnectStatus(),
        getSellerStats(),
        getListings(),
      ]);

      setStripeStatus(statusRes.data);
      setStats(statsRes.data);
      setListingsCount(Array.isArray(listingsRes.data) ? listingsRes.data.length : 0);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConnectStripe = async () => {
    setConnecting(true);
    try {
      const res = await getConnectOnboarding();
      const url = res.data?.url;
      if (url && typeof url === 'string' && url.startsWith(STRIPE_CONNECT_URL_PREFIX)) {
        window.location.href = url;
      } else {
        throw new Error('Invalid Stripe onboarding URL');
      }
    } catch (err) {
      toast('Failed to start Stripe connection', 'error');
      setConnecting(false);
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
        <p className="text-sm text-red-700 mb-4">Failed to load dashboard data.</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const isStripeConnected = !!stripeStatus?.details_submitted;
  const hasListings = listingsCount > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.first_name || 'Seller'}</h1>
        <p className="mt-1 text-sm text-gray-500">Here's what's happening with your store today.</p>
      </div>

      {/* Onboarding Stepper */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Getting Started</h2>
        <div className="flex items-center justify-between">
          <div className="flex-1 flex items-center">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-900">Account Created</p>
            </div>
          </div>

          <div className="w-16 h-px bg-gray-200 mx-4"></div>

          <div className="flex-1 flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${isStripeConnected ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
              {isStripeConnected ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-sm font-medium">2</span>
              )}
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-900">Connect Stripe</p>
              {!isStripeConnected && (
                <button
                  onClick={handleConnectStripe}
                  disabled={connecting}
                  className="mt-1 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                >
                  {connecting ? 'Connecting...' : 'Connect now →'}
                </button>
              )}
            </div>
          </div>

          <div className="w-16 h-px bg-gray-200 mx-4"></div>

          <div className="flex-1 flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${hasListings ? 'bg-green-100 text-green-600' : (isStripeConnected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500')}`}>
              {hasListings ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-sm font-medium">3</span>
              )}
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-900">Create First Listing</p>
              {!hasListings && isStripeConnected && (
                <Link href="/dashboard/listings/new" className="mt-1 text-sm text-blue-600 hover:text-blue-700 font-medium block">
                  Create listing →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Views</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">{stats?.views || 0}</div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Sales</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">{stats?.sales || 0}</div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Revenue</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">${(stats?.revenue || 0).toFixed(2)}</div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
