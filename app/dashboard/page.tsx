'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  getConnectStatus,
  getConnectOnboarding,
  isConnectOnboardingTwoFactorRequired,
  redirectToConnectOnboarding,
} from '@/api/connect';
import { getOnboardingStatus, setup2FA, verify2FASetup, type OnboardingStatusResponse } from '@/api/auth';
import { getSellerStats } from '@/api/seller';
import { getMyListings } from '@/api/listings';
import {
  getCapabilities,
  requestSellerCapability,
  type CapabilitySetResponse,
} from '@/api/capabilities';
import { notifyCapabilitiesChanged } from '@/components/onboarding/SellerSetupProgressBar';
import { useToast } from '@/components/Toast';
import { AxiosError } from 'axios';

type TwoFactorFlow = 'idle' | 'showing_qr' | 'verifying' | 'showing_backup_codes';

export default function DashboardOverview() {
  const { user, refreshAuth } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<{ details_submitted?: boolean; payouts_enabled?: boolean } | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatusResponse | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilitySetResponse | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [heldPublishedCount, setHeldPublishedCount] = useState(0);
  const [requestingSeller, setRequestingSeller] = useState(false);
  const [twoFactorFlow, setTwoFactorFlow] = useState<TwoFactorFlow>('idle');
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrUri, setTotpQrUri] = useState('');
  const [setupExpiresIn, setSetupExpiresIn] = useState<number | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const capabilityRes = await getCapabilities();
      setCapabilities(capabilityRes);

      const sellerIsActive = capabilityRes.seller.effective_status === 'active';
      const sellerIsProvisioning = capabilityRes.seller.effective_status === 'provisioning';

      setStripeStatus(null);
      setStats(null);
      setHeldPublishedCount(0);

      if (sellerIsActive) {
        const [statusRes, onboardingRes, statsRes, listingsRes] = await Promise.all([
          getConnectStatus(),
          getOnboardingStatus(),
          getSellerStats(),
          getMyListings(),
        ]);
        const listings = Array.isArray(listingsRes.data) ? listingsRes.data : [];

        setStripeStatus(statusRes.data);
        setOnboardingStatus(onboardingRes);
        setStats(statsRes.data);
        setHeldPublishedCount(listings.filter((listing: any) => listing.status === 'published').length);
      } else if (sellerIsProvisioning) {
        setOnboardingStatus(await getOnboardingStatus());
      } else {
        setOnboardingStatus(null);
      }
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
      redirectToConnectOnboarding(res.data);
    } catch (err) {
      if (isConnectOnboardingTwoFactorRequired(err)) {
        toast('Complete 2FA setup before connecting payouts.', 'info');
      } else {
        toast('Failed to start Stripe connection', 'error');
      }
      setConnecting(false);
    }
  };

  const handleStartSelling = async () => {
    setRequestingSeller(true);
    try {
      const capabilityRes = await requestSellerCapability();
      setCapabilities(capabilityRes);
      notifyCapabilitiesChanged();
      toast('Seller setup started', 'success');
      await fetchData();
    } catch (err) {
      toast('Failed to start seller setup', 'error');
    } finally {
      setRequestingSeller(false);
    }
  };

  const resetTwoFactorState = () => {
    setTwoFactorFlow('idle');
    setSecurityError('');
    setSecurityLoading(false);
    setTotpSecret('');
    setTotpQrUri('');
    setSetupExpiresIn(null);
    setTotpCode('');
    setBackupCodes([]);
  };

  const handleSetup2FA = async () => {
    setSecurityLoading(true);
    setSecurityError('');
    try {
      const res = await setup2FA();
      setTotpSecret(res.secret);
      setTotpQrUri(res.qr_uri);
      setSetupExpiresIn(res.expires_in);
      setTotpCode('');
      setBackupCodes([]);
      setTwoFactorFlow('showing_qr');
    } catch (err) {
      if (err instanceof AxiosError) {
        setSecurityError(err.response?.data?.detail || 'Failed to start 2FA setup.');
      } else {
        setSecurityError('Failed to start 2FA setup.');
      }
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleVerify2FASetup = async () => {
    setSecurityLoading(true);
    setSecurityError('');
    setTwoFactorFlow('verifying');
    try {
      const res = await verify2FASetup(totpCode.trim());
      setBackupCodes(res.backup_codes);
      setTwoFactorFlow('showing_backup_codes');
      await refreshAuth();
      await fetchData();
      toast('Two-factor authentication enabled', 'success');
    } catch (err) {
      setTwoFactorFlow('showing_qr');
      if (err instanceof AxiosError) {
        setSecurityError(err.response?.data?.detail || 'Failed to verify the code.');
      } else {
        setSecurityError('Failed to verify the code.');
      }
    } finally {
      setSecurityLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent"></div>
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

  const sellerStatus = capabilities?.seller.effective_status;
  const sellerMissingSteps = capabilities?.seller.missing_steps ?? [];
  const isStripeConnected = !!stripeStatus?.details_submitted;
  const payoutsEnabled = sellerStatus === 'active'
    ? !!stripeStatus?.payouts_enabled
    : !!capabilities && !sellerMissingSteps.includes('stripe_payouts_live');
  const isSellerActive = sellerStatus === 'active';
  const isSellerProvisioning = sellerStatus === 'provisioning';
  const canStartSelling = sellerStatus === 'not_requested';
  const twoFactorEnabled = !!user?.totp_enabled;
  const showSetupFlow =
    isSellerProvisioning &&
    !(twoFactorEnabled && payoutsEnabled);
  const showHeldPublishedNotice = isSellerActive && heldPublishedCount > 0 && !payoutsEnabled;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.first_name || 'there'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isSellerActive ? "Here's what's happening with your store today." : 'Manage your marketplace account.'}
        </p>
      </div>

      {canStartSelling && (
        <div className="rounded-xl border border-[#C5CAE9] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Start selling on AI Market</h2>
              <p className="mt-1 text-sm text-gray-600">
                Set up your seller profile, security, and Stripe payouts before publishing paid listings.
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartSelling}
              disabled={requestingSeller}
              className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {requestingSeller ? 'Starting...' : 'Start selling'}
            </button>
          </div>
        </div>
      )}

      {showSetupFlow && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-5">
            <h2 className="text-lg font-medium text-gray-900">Finish seller setup</h2>
            <p className="mt-1 text-sm text-gray-500">
              Secure your account first, then connect payouts to make published listings purchasable.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`rounded-lg border p-4 ${twoFactorEnabled ? 'border-green-200 bg-green-50' : 'border-[#C5CAE9] bg-[#F8F9FF]'}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${twoFactorEnabled ? 'bg-green-100 text-green-700' : 'bg-[#E8EAF6] text-[#3F51B5]'}`}>
                  {twoFactorEnabled ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-semibold">1</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">Secure your account (2FA)</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {twoFactorEnabled ? 'Two-factor authentication is enabled.' : 'Enable authenticator-app verification before connecting payouts.'}
                  </p>
                  {!twoFactorEnabled && twoFactorFlow === 'idle' && (
                    <button
                      onClick={handleSetup2FA}
                      disabled={securityLoading}
                      className="mt-3 rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {securityLoading ? 'Starting...' : 'Enable 2FA'}
                    </button>
                  )}
                </div>
              </div>

              {securityError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {securityError}
                </div>
              )}

              {!twoFactorEnabled && twoFactorFlow === 'showing_qr' && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Set up your authenticator app</h3>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpQrUri)}`}
                      alt="QR code for two-factor authentication setup"
                      className="h-36 w-36 rounded-lg border border-gray-200 bg-white p-2"
                    />
                    <div className="flex-1 space-y-3">
                      <p className="text-sm text-gray-600">
                        Scan the QR code in your authenticator app, or enter the secret manually.
                      </p>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Manual entry secret</p>
                        <code className="block rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-900 break-all">{totpSecret}</code>
                      </div>
                      {setupExpiresIn !== null && (
                        <p className="text-xs text-gray-500">Setup expires in {setupExpiresIn} seconds.</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label htmlFor="dashboardTotpCode" className="block text-sm font-medium text-gray-700 mb-1">
                        6-digit code
                      </label>
                      <input
                        id="dashboardTotpCode"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:border-transparent"
                        placeholder="123456"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleVerify2FASetup}
                        disabled={securityLoading || totpCode.trim().length !== 6}
                        className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {securityLoading ? 'Verifying...' : 'Verify and enable'}
                      </button>
                      <button
                        onClick={resetTwoFactorState}
                        disabled={securityLoading}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {twoFactorFlow === 'showing_backup_codes' && backupCodes.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-semibold text-amber-900">Backup codes</h3>
                  <p className="mt-1 text-sm text-amber-800">
                    Save these backup codes now. You will need them if you lose access to your authenticator app.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {backupCodes.map((code) => (
                      <div key={code} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-gray-900">
                        {code}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={resetTwoFactorState}
                    className="mt-4 rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0]"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>

            <div className={`rounded-lg border p-4 ${payoutsEnabled ? 'border-green-200 bg-green-50' : twoFactorEnabled ? 'border-[#C5CAE9] bg-[#F8F9FF]' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${payoutsEnabled ? 'bg-green-100 text-green-700' : twoFactorEnabled ? 'bg-[#E8EAF6] text-[#3F51B5]' : 'bg-gray-100 text-gray-500'}`}>
                  {payoutsEnabled ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-semibold">2</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">Connect payouts (Stripe)</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {payoutsEnabled
                      ? 'Stripe payouts are live.'
                      : twoFactorEnabled
                        ? 'Connect Stripe payouts to enable purchases on published listings.'
                        : 'Locked until 2FA is enabled.'}
                  </p>
                  {!payoutsEnabled && (
                    <button
                      onClick={handleConnectStripe}
                      disabled={connecting || !twoFactorEnabled}
                      className="mt-3 rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {connecting ? 'Connecting...' : isStripeConnected ? 'Resume Stripe setup' : 'Connect Stripe'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showHeldPublishedNotice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Published listings are not yet purchasable. Finish payout setup to enable sales.
        </div>
      )}

      {isSellerActive && (
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
      )}
    </div>
  );
}
