'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { resolveMemberDownload } from './memberDownload';

export type DatasetMember = {
  index: number;
  basename: string;
  size_bytes: number;
  sha256: string;
  state: 'delivered' | 'unavailable';
  address?: string;
};
type Grant = { download_token: string; expires_at: string; downloads_remaining: number };

const reasons: Record<string, string> = {
  grant_rate_limit: 'Too many access requests. Please wait before trying again.',
  download_limit_reached: 'This order has no download allowances remaining.',
  delivery_not_complete: 'This dataset is still being delivered. Try again later.',
  grant_expiring: 'Download access is expiring. Renew access to continue.',
  invalid_grant: 'Download access has expired. Renew access to continue.',
  member_unavailable: 'File unavailable — support notified.',
  byte_budget_exceeded: 'The hourly download byte allowance (DOWNLOAD_GRANT_BYTES_PER_HOUR) has been reached. Try again next hour.',
  delivery_busy: 'Delivery is busy. Please try again shortly.',
  delivery_retention_expired: 'This dataset is no longer available for download.',
};

function refusal(detail: unknown): string {
  const value = typeof detail === 'string' ? detail :
    detail && typeof detail === 'object' && 'code' in detail ? String(detail.code) : 'download_request_failed';
  // Never echo arbitrary server text (which could contain credentials).
  return Object.hasOwn(reasons, value) ? value : 'download_request_failed';
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][unit]}`;
}

export default function DatasetMembers({ orderId, initialMembers, accessExpired, ensureTermsAccepted }: {
  orderId: string;
  initialMembers?: DatasetMember[];
  accessExpired: boolean;
  ensureTermsAccepted: (action: () => Promise<void>) => Promise<unknown>;
}) {
  const [members, setMembers] = useState<DatasetMember[]>(initialMembers || []);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [error, setError] = useState('');
  const [renewalRequired, setRenewalRequired] = useState(false);
  const [loading, setLoading] = useState(!initialMembers);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  const inFlight = useRef(false);
  const authToken = useAuthStore((state) => state.token);
  const needsRenewal = !!grant && (new Date(grant.expires_at).getTime() - now <= 360000 || renewalRequired);
  const base = `/orders/${encodeURIComponent(orderId)}/members`;

  useEffect(() => {
    if (initialMembers) return;
    let cancelled = false;
    api.get<{ members: DatasetMember[] }>(base).then(({ data }) => {
      if (!cancelled) setMembers(data.members);
    }).catch((err) => {
      if (!cancelled) setError(refusal(err.response?.data?.detail));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [base, initialMembers]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function getAccess() {
    if (inFlight.current || accessExpired) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await ensureTermsAccepted(async () => {
        try {
          const { data } = await api.post<Grant>(`${base}/grant`);
          setGrant({ download_token: data.download_token, expires_at: data.expires_at, downloads_remaining: data.downloads_remaining });
          setError('');
          setRenewalRequired(false);
          setNow(Date.now());
        } catch (err) {
          setError(refusal((err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail));
        }
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function download(member: DatasetMember) {
    if (!grant || needsRenewal || inFlight.current || accessExpired) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await resolveMemberDownload(orderId, member.index, grant.download_token, authToken || '');
      if ('reason' in result) {
        const reason = refusal(result.reason);
        setError(reason);
        if (['grant_expiring', 'invalid_grant'].includes(reason)) setRenewalRequired(true);
        if (reason === 'member_unavailable') setMembers((rows) => rows.map((row) => row.index === member.index ? { ...row, state: 'unavailable', address: undefined } : row));
        return;
      }
      const link = document.createElement('a');
      link.href = result.url;
      link.download = member.basename;
      link.rel = 'noopener noreferrer';
      link.referrerPolicy = 'no-referrer';
      link.click();
    } catch {
      setError('download_request_failed');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 p-6" aria-label="Files in this dataset">
      <h2 className="text-lg font-semibold text-gray-900">Files in this dataset</h2>
      <p className="mt-2 text-sm text-gray-600">One download allowance gives access to the whole dataset. Renewing access uses another allowance.</p>
      {accessExpired ? <p>Download window expired.</p> : <>
        {(!grant || needsRenewal) && <button type="button" disabled={busy} onClick={getAccess} className="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Requesting access…' : grant ? 'Renew download access' : 'Get download access'}
        </button>}
        {grant && <p className="mt-2 text-sm">Downloads remaining: {grant.downloads_remaining}. Access expires <time dateTime={grant.expires_at}>{new Date(grant.expires_at).toLocaleString()}</time>.</p>}
      </>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{reasons[error] || 'Could not prepare this download. Please try again.'} ({error})</p>}
      {loading && <p role="status">Loading files…</p>}
      {!loading && members.length === 0 && <p>No files are available yet.</p>}
      <ul className="mt-4 divide-y divide-gray-200">
        {members.map((member) => <li key={member.index} className="flex items-center justify-between gap-4 py-3">
          <div><p className="break-all font-medium">{member.basename}</p><p className="text-sm text-gray-500">{sizeLabel(member.size_bytes)}</p></div>
          {member.state === 'unavailable' ? <span className="text-sm text-gray-600">File unavailable — support notified.</span> :
            <button type="button" disabled={!grant || busy || needsRenewal || accessExpired} onClick={() => download(member)} aria-label={`Download ${member.basename}`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">Download</button>}
        </li>)}
      </ul>
    </section>
  );
}
