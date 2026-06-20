'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { S3ScopedDeliveryCredentials, S3ScopedDeliveryResponse } from '@/types';

interface ScopedCredentialDownloadProps {
  orderId: string;
  delivery: S3ScopedDeliveryResponse;
  onRefresh: () => Promise<S3ScopedDeliveryResponse>;
  refreshError?: string;
}

export function isS3ScopedDeliveryResponse(value: unknown): value is S3ScopedDeliveryResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { delivery_type?: unknown }).delivery_type === 's3_scoped_credential'
  );
}

export function buildSyncCommand(orderId: string, credentials: S3ScopedDeliveryCredentials) {
  const bucket = validateS3BucketName(credentials.bucket);
  const prefix = normalizePrefix(credentials.prefix);
  const source = prefix
    ? `s3://${bucket}/${prefix}`
    : `s3://${bucket}`;

  return `aws s3 sync ${shellQuote(source)} ${shellQuote(`./ai-market-order-${shortOrderId(orderId)}`)}`;
}

export function buildEnvBlock(credentials: S3ScopedDeliveryCredentials) {
  return [
    `AWS_ACCESS_KEY_ID=${credentials.access_key_id}`,
    `AWS_SECRET_ACCESS_KEY=${credentials.secret_access_key}`,
    `AWS_SESSION_TOKEN=${credentials.session_token}`,
    `AWS_DEFAULT_REGION=${credentials.region || 'us-east-1'}`,
  ].join('\n');
}

export function buildProfileSnippet(orderId: string, credentials: S3ScopedDeliveryCredentials) {
  return [
    `[profile ai-market-order-${shortOrderId(orderId)}]`,
    `aws_access_key_id = ${credentials.access_key_id}`,
    `aws_secret_access_key = ${credentials.secret_access_key}`,
    `aws_session_token = ${credentials.session_token}`,
    `region = ${credentials.region || 'us-east-1'}`,
  ].join('\n');
}

export function getCredentialSecondsLeft(expiration: string, now: number) {
  const expiry = new Date(expiration).getTime();
  if (Number.isNaN(expiry)) return 0;
  return Math.max(0, Math.floor((expiry - now) / 1000));
}

export function formatCredentialCountdown(secondsLeft: number) {
  if (secondsLeft <= 0) return 'Expired';
  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

export default function ScopedCredentialDownload({
  orderId,
  delivery,
  onRefresh,
  refreshError = '',
}: ScopedCredentialDownloadProps) {
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [localError, setLocalError] = useState('');
  const refreshPromiseRef = useRef<Promise<S3ScopedDeliveryResponse> | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const credentials = delivery.s3_scoped_delivery;
  const secondsLeft = getCredentialSecondsLeft(credentials.expiration, now);
  const expired = secondsLeft <= 0;
  const syncCommand = useMemo(() => (
    expired ? '' : buildSyncCommand(orderId, credentials)
  ), [expired, orderId, credentials]);
  const envBlock = useMemo(() => (
    expired ? '' : buildEnvBlock(credentials)
  ), [expired, credentials]);
  const profileSnippet = useMemo(() => (
    expired ? '' : buildProfileSnippet(orderId, credentials)
  ), [expired, orderId, credentials]);

  const handleRefresh = async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    setRefreshing(true);
    setLocalError('');
    const refreshPromise = onRefresh();
    refreshPromiseRef.current = refreshPromise;
    try {
      await refreshPromise;
    } catch {
      setLocalError('Could not refresh credentials. Try again in a moment.');
    } finally {
      if (refreshPromiseRef.current === refreshPromise) {
        refreshPromiseRef.current = null;
        setRefreshing(false);
      }
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Download</h2>
          <p className={`mt-1 text-sm ${expired ? 'text-red-700' : 'text-gray-600'}`}>
            {expired
              ? 'These credentials have expired. Refresh credentials to continue.'
              : `Credentials expire in ${formatCredentialCountdown(secondsLeft)}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className={`rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
            expired
              ? 'bg-[#3F51B5] text-white hover:bg-[#3545a0]'
              : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {refreshing ? 'Refreshing credentials...' : 'Refresh credentials'}
        </button>
      </div>

      {(refreshError || localError) && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {refreshError || localError}
        </div>
      )}

      {expired ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Refresh credentials to show download commands and temporary AWS credentials.
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <CopyBlock title="Sync command" value={syncCommand} />
            <CopyBlock title="Environment variables" value={envBlock} />
            <CopyBlock title="AWS profile" value={profileSnippet} />
          </div>

          <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-gray-700">
            <li>Install the AWS CLI.</li>
            <li>Paste the credentials into your terminal or AWS config.</li>
            <li>Run the sync command.</li>
            <li>Refresh credentials if they expire before the download finishes.</li>
          </ol>
        </>
      )}
    </div>
  );
}

function CopyBlock({ title, value }: { title: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2">
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-5 text-gray-900">
        {value}
      </pre>
    </section>
  );
}

function normalizePrefix(prefix: string | null) {
  return (prefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
}

function shortOrderId(orderId: string) {
  return orderId.slice(0, 8);
}

function validateS3BucketName(bucket: string) {
  if (
    bucket.length < 3 ||
    bucket.length > 63 ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket) ||
    bucket.includes('..') ||
    bucket.includes('.-') ||
    bucket.includes('-.') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket)
  ) {
    throw new Error('Invalid S3 bucket name.');
  }

  return bucket;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
