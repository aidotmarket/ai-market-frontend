'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { disable2FA, regenerateBackupCodes, setup2FA, updateProfile, verify2FASetup } from '@/api/auth';
import { useToast } from '@/components/Toast';
import { AxiosError } from 'axios';

type TwoFactorFlow = 'idle' | 'showing_qr' | 'verifying' | 'showing_backup_codes';
type SecurityAction = 'disable' | 'regenerate' | null;

export default function SettingsPage() {
  const { user, refreshAuth } = useAuthStore();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [twoFactorFlow, setTwoFactorFlow] = useState<TwoFactorFlow>('idle');
  const [securityAction, setSecurityAction] = useState<SecurityAction>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [verifyingSetup, setVerifyingSetup] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrUri, setTotpQrUri] = useState('');
  const [setupExpiresIn, setSetupExpiresIn] = useState<number | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesLabel, setBackupCodesLabel] = useState('Save these backup codes before you continue.');
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setCompanyName(user.company_name || '');
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const changed =
      firstName !== (user.first_name || '') ||
      lastName !== (user.last_name || '') ||
      companyName !== (user.company_name || '');
    setDirty(changed);
  }, [firstName, lastName, companyName, user]);

  useEffect(() => {
    if (!copiedBackupCodes) return;
    const timer = window.setTimeout(() => setCopiedBackupCodes(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedBackupCodes]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        company_name: companyName.trim() || undefined,
      });
      await refreshAuth();
      toast('Profile updated', 'success');
      setDirty(false);
    } catch (err) {
      if (err instanceof AxiosError) {
        toast(err.response?.data?.detail || 'Failed to update profile', 'error');
      } else {
        toast('An unexpected error occurred', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const resetTwoFactorState = () => {
    setTwoFactorFlow('idle');
    setSecurityAction(null);
    setSecurityError('');
    setVerifyingSetup(false);
    setTotpSecret('');
    setTotpQrUri('');
    setSetupExpiresIn(null);
    setTotpCode('');
    setBackupCodes([]);
    setBackupCodesLabel('Save these backup codes before you continue.');
    setCopiedBackupCodes(false);
  };

  const handleSetup2FA = async () => {
    setSecurityLoading(true);
    setVerifyingSetup(false);
    setSecurityError('');

    try {
      const res = await setup2FA();
      setTotpSecret(res.secret);
      setTotpQrUri(res.qr_uri);
      setSetupExpiresIn(res.expires_in);
      setTotpCode('');
      setBackupCodes([]);
      setBackupCodesLabel('Save these backup codes before you continue.');
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
    setVerifyingSetup(true);
    setTwoFactorFlow('verifying');

    try {
      const res = await verify2FASetup(totpCode.trim());
      setBackupCodes(res.backup_codes);
      setBackupCodesLabel('Save these backup codes now. You will need them if you lose access to your authenticator app.');
      setTwoFactorFlow('showing_backup_codes');
      toast('Two-factor authentication enabled', 'success');
    } catch (err) {
      setTwoFactorFlow('showing_qr');
      if (err instanceof AxiosError) {
        setSecurityError(err.response?.data?.detail || 'Failed to verify the code.');
      } else {
        setSecurityError('Failed to verify the code.');
      }
    } finally {
      setVerifyingSetup(false);
      setSecurityLoading(false);
    }
  };

  const handleCopyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopiedBackupCodes(true);
      toast('Backup codes copied', 'success');
    } catch {
      toast('Failed to copy backup codes', 'error');
    }
  };

  const handleTwoFactorDone = async () => {
    setSecurityLoading(true);
    try {
      await refreshAuth();
      resetTwoFactorState();
    } catch {
      toast('Failed to refresh your account state', 'error');
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setSecurityLoading(true);
    setSecurityError('');

    try {
      // TODO: Replace the placeholder reauth token once a dedicated frontend re-auth flow exists.
      const res = await disable2FA('', totpCode.trim());
      await refreshAuth();
      resetTwoFactorState();
      toast(res.message || 'Two-factor authentication disabled', 'success');
    } catch (err) {
      if (err instanceof AxiosError) {
        setSecurityError(err.response?.data?.detail || 'Failed to disable 2FA.');
      } else {
        setSecurityError('Failed to disable 2FA.');
      }
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    setSecurityLoading(true);
    setSecurityError('');

    try {
      // TODO: Replace the placeholder reauth token once a dedicated frontend re-auth flow exists.
      const res = await regenerateBackupCodes('', totpCode.trim());
      setBackupCodes(res.backup_codes);
      setBackupCodesLabel('Your backup codes were regenerated. Store this new set securely; older codes are no longer valid.');
      setTwoFactorFlow('showing_backup_codes');
      setSecurityAction(null);
      setTotpCode('');
      toast('Backup codes regenerated', 'success');
    } catch (err) {
      if (err instanceof AxiosError) {
        setSecurityError(err.response?.data?.detail || 'Failed to regenerate backup codes.');
      } else {
        setSecurityError('Failed to regenerate backup codes.');
      }
    } finally {
      setSecurityLoading(false);
    }
  };

  if (!user) return null;

  const isSeller = user.role === 'seller' || user.role === 'admin';

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

      {/* Profile Section */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {isSeller && (
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
                Company name
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </section>

      {/* Account Info Section */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account</h2>
        <dl className="space-y-3">
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">Email</dt>
            <dd className="text-sm font-medium text-gray-900">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">Role</dt>
            <dd className="text-sm font-medium text-gray-900 capitalize">{user.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">Member since</dt>
            <dd className="text-sm font-medium text-gray-900">
              {new Date(user.created_at).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            </dd>
          </div>
        </dl>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Security</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage two-factor authentication for your account.
            </p>
          </div>
          {user.totp_enabled ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              2FA Enabled
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              2FA Disabled
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Two-factor authentication</p>
              <p className="text-sm text-gray-500">
                {user.totp_enabled ? 'Your account requires an authenticator code at sign-in.' : 'Add an authenticator app for stronger account protection.'}
              </p>
            </div>
            {!user.totp_enabled && (
              <button
                onClick={handleSetup2FA}
                disabled={securityLoading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {securityLoading && twoFactorFlow === 'idle' ? 'Starting...' : 'Enable two-factor authentication'}
              </button>
            )}
          </div>

          {securityError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {securityError}
            </div>
          )}

          {twoFactorFlow === 'showing_qr' && (
            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Set up your authenticator app</h3>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpQrUri)}`}
                  alt="QR code for two-factor authentication setup"
                  className="h-40 w-40 rounded-lg border border-gray-200 bg-white p-2"
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
                  <label htmlFor="totpCode" className="block text-sm font-medium text-gray-700 mb-1">
                    6-digit code
                  </label>
                  <input
                    id="totpCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="123456"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleVerify2FASetup}
                    disabled={securityLoading || totpCode.trim().length !== 6}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {securityLoading && verifyingSetup ? 'Verifying...' : 'Verify and enable'}
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
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">Backup codes</h3>
                  <p className="mt-1 text-sm text-amber-800">{backupCodesLabel}</p>
                </div>
                <button
                  onClick={handleCopyBackupCodes}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  {copiedBackupCodes ? 'Copied!' : 'Copy all'}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {backupCodes.map((code) => (
                  <div key={code} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-gray-900">
                    {code}
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <button
                  onClick={handleTwoFactorDone}
                  disabled={securityLoading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {securityLoading ? 'Refreshing...' : 'Done'}
                </button>
              </div>
            </div>
          )}

          {user.totp_enabled && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setSecurityAction('disable');
                  setSecurityError('');
                  setTotpCode('');
                }}
                disabled={securityLoading}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Disable 2FA
              </button>
              <button
                onClick={() => {
                  setSecurityAction('regenerate');
                  setSecurityError('');
                  setTotpCode('');
                }}
                disabled={securityLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Regenerate backup codes
              </button>
            </div>
          )}

          {securityAction && user.totp_enabled && (
            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                {securityAction === 'disable' ? 'Confirm 2FA disable' : 'Confirm backup code regeneration'}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Enter your current authenticator code to continue.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label htmlFor="securityTotpCode" className="block text-sm font-medium text-gray-700 mb-1">
                    Current TOTP code
                  </label>
                  <input
                    id="securityTotpCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="123456"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={securityAction === 'disable' ? handleDisable2FA : handleRegenerateBackupCodes}
                    disabled={securityLoading || totpCode.trim().length !== 6}
                    className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${securityAction === 'disable' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {securityLoading ? 'Working...' : securityAction === 'disable' ? 'Confirm disable' : 'Generate new codes'}
                  </button>
                  <button
                    onClick={() => {
                      setSecurityAction(null);
                      setTotpCode('');
                    }}
                    disabled={securityLoading}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
