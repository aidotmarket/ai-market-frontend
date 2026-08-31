'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AWSAuthorization,
  type ConnectionVerifyRequest,
  type SellerWorkspaceConnection,
  SellerWorkspaceApiError,
  createIdempotencyKey,
  createSellerWorkspaceConnection,
  disconnectSellerWorkspaceConnection,
  getSellerWorkspaceAuthorization,
  getSellerWorkspaceCapabilities,
  isAWSConnectionAvailable,
  listSellerWorkspaceConnections,
  rotateSellerWorkspaceConnection,
  verifySellerWorkspaceConnection,
} from '@/api/sellerWorkspace';

type PageState = 'loading' | 'ready' | 'unavailable' | 'gated' | 'error';

type AuthorizationSession = {
  connectionId: string;
  authorization: AWSAuthorization;
};

const MAX_DEADLINE_TIMEOUT_MS = 2_147_483_647;

const EMPTY_SCOPE: ConnectionVerifyRequest = {
  role_arn: '',
  bucket: '',
  prefix: '',
  region: '',
};

const STATUS_PRESENTATION: Record<
  SellerWorkspaceConnection['status'],
  { label: string; classes: string }
> = {
  pending_authorization: { label: 'Pending setup', classes: 'bg-amber-100 text-amber-800' },
  verified: { label: 'Verified', classes: 'bg-green-100 text-green-800' },
  disabled: { label: 'Disabled', classes: 'bg-gray-100 text-gray-700' },
  revoked: { label: 'Disconnected', classes: 'bg-gray-100 text-gray-700' },
  error: { label: 'Action needed', classes: 'bg-red-100 text-red-800' },
  expired: { label: 'Expired', classes: 'bg-gray-100 text-gray-700' },
};

function errorCode(error: unknown) {
  return error instanceof SellerWorkspaceApiError ? error.code : 'unknown';
}

function safeActionMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 'authorization_expired':
      return 'This setup has expired and cannot be verified. Create a new connection.';
    case 'invalid_scope':
      return 'Enter a valid role ARN, bucket, bounded non-root prefix, and AWS region.';
    case 'verification_failed':
      return 'AWS could not verify this connection. Check the trust policy and scope, then try again.';
    case 'rate_limited':
      return 'Too many requests. Wait a moment, then try again.';
    case 'conflict':
      return 'The connection changed before this action completed. Refresh and try again.';
    case 'not_found':
      return 'This connection is no longer available. Refresh the workspace.';
    default:
      return 'The action could not be completed. Try again.';
  }
}

function formatDate(value: string | null): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function CopyValue({
  label,
  value,
  multiline = false,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium text-gray-900">{label}</h3>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
          aria-label={`Copy ${label}`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {multiline ? (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-gray-800">
          {value}
        </pre>
      ) : (
        <code className="mt-3 block break-all text-sm text-gray-800">{value}</code>
      )}
    </div>
  );
}

export default function SellerWorkspacePage() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [connections, setConnections] = useState<SellerWorkspaceConnection[]>([]);
  const [authorizationSession, setAuthorizationSession] =
    useState<AuthorizationSession | null>(null);
  const authorizationRef = useRef<AuthorizationSession | null>(null);
  const mountedRef = useRef(true);
  const mutationKeysRef = useRef(new Map<string, string>());
  const [scope, setScope] = useState<ConnectionVerifyRequest>(EMPTY_SCOPE);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [disconnectConfirmation, setDisconnectConfirmation] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const clearSensitive = useCallback(() => {
    authorizationRef.current = null;
    setAuthorizationSession(null);
    setCopiedField(null);
    setScope(EMPTY_SCOPE);
  }, []);

  const showAuthorization = useCallback((session: AuthorizationSession | null) => {
    if (!mountedRef.current) return;
    authorizationRef.current = session;
    setAuthorizationSession(session);
    setCopiedField(null);
  }, []);

  useEffect(() => {
    if (!authorizationSession) return;

    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const expiresAt = Date.parse(authorizationSession.authorization.expires_at);

    const clearAtDeadline = () => {
      const remaining = expiresAt - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) {
        clearSensitive();
        return;
      }
      deadlineTimer = setTimeout(clearAtDeadline, Math.min(remaining, MAX_DEADLINE_TIMEOUT_MS));
    };

    clearAtDeadline();
    return () => {
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    };
  }, [authorizationSession, clearSensitive]);

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;
    clearSensitive();
    setConnections([]);
    setActionError(null);
    setPageState('loading');

    async function load() {
      try {
        const capabilities = await getSellerWorkspaceCapabilities();
        if (cancelled) return;
        if (!isAWSConnectionAvailable(capabilities)) {
          setPageState('unavailable');
          return;
        }

        const listed = await listSellerWorkspaceConnections();
        if (!cancelled) {
          setConnections(listed);
          setPageState('ready');
        }
      } catch (error) {
        if (cancelled) return;
        const code = errorCode(error);
        if (code === 'active_seller_required') setPageState('gated');
        else if (code === 'unavailable') setPageState('unavailable');
        else setPageState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      authorizationRef.current = null;
      mutationKeysRef.current.clear();
    };
  }, [clearSensitive, retryKey]);

  const trustPolicyJSON = useMemo(
    () =>
      authorizationSession
        ? JSON.stringify(authorizationSession.authorization.trust_policy, null, 2)
        : '',
    [authorizationSession]
  );

  const keyFor = (operation: string) => {
    const existing = mutationKeysRef.current.get(operation);
    if (existing) return existing;
    const created = createIdempotencyKey(operation);
    mutationKeysRef.current.set(operation, created);
    return created;
  };

  const clearKey = (operation: string) => {
    mutationKeysRef.current.delete(operation);
  };

  const updateConnection = (connection: SellerWorkspaceConnection) => {
    setConnections((current) => {
      const exists = current.some(({ id }) => id === connection.id);
      return exists
        ? current.map((item) => (item.id === connection.id ? connection : item))
        : [connection, ...current];
    });
  };

  const closeForCapabilityError = (error: unknown) => {
    const code = errorCode(error);
    if (code === 'active_seller_required') {
      clearSensitive();
      setPageState('gated');
      return true;
    }
    if (code === 'unavailable') {
      clearSensitive();
      setPageState('unavailable');
      return true;
    }
    return false;
  };

  const markExpired = (connectionId: string) => {
    setConnections((current) =>
      current.map((connection) =>
        connection.id === connectionId
          ? { ...connection, status: 'expired', expired_at: new Date().toISOString() }
          : connection
      )
    );
  };

  const handleCreate = async () => {
    const operation = 'create-connection';
    setBusyAction(operation);
    setActionError(null);
    clearSensitive();
    try {
      const result = await createSellerWorkspaceConnection(keyFor(operation));
      clearKey(operation);
      updateConnection(result.connection);
      if (result.authorization) {
        showAuthorization({ connectionId: result.connection.id, authorization: result.authorization });
      } else {
        setActionError('Setup values are unavailable. Open the connection to try again.');
      }
    } catch (error) {
      if (!closeForCapabilityError(error)) setActionError(safeActionMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenAuthorization = async (connection: SellerWorkspaceConnection) => {
    const operation = `authorization-${connection.id}`;
    setBusyAction(operation);
    setActionError(null);
    clearSensitive();
    try {
      const authorization = await getSellerWorkspaceAuthorization(connection.id);
      showAuthorization({ connectionId: connection.id, authorization });
    } catch (error) {
      if (errorCode(error) === 'authorization_expired') {
        markExpired(connection.id);
        clearSensitive();
      }
      if (!closeForCapabilityError(error)) setActionError(safeActionMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (!authorizationSession) return;
    const normalizedPrefix = scope.prefix.trim().replace(/^\/+|\/+$/g, '');
    if (!normalizedPrefix || normalizedPrefix.split('/').includes('..')) {
      setActionError('Prefix must identify a bounded, non-root S3 location.');
      return;
    }
    const connectionId = authorizationSession.connectionId;
    const operation = `verify-${connectionId}`;
    const submittedScope = {
      role_arn: scope.role_arn.trim(),
      bucket: scope.bucket.trim(),
      prefix: normalizedPrefix,
      region: scope.region.trim(),
    };
    setBusyAction(operation);
    setActionError(null);
    clearSensitive();
    try {
      const result = await verifySellerWorkspaceConnection(
        connectionId,
        submittedScope,
        keyFor(operation)
      );
      clearKey(operation);
      updateConnection(result.connection);
    } catch (error) {
      if (errorCode(error) === 'authorization_expired') {
        markExpired(connectionId);
        clearSensitive();
      }
      if (!closeForCapabilityError(error)) setActionError(safeActionMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartRotation = async (connection: SellerWorkspaceConnection) => {
    const operation = `rotate-start-${connection.id}`;
    setBusyAction(operation);
    setActionError(null);
    clearSensitive();
    try {
      const result = await rotateSellerWorkspaceConnection(
        connection.id,
        'start',
        keyFor(operation)
      );
      clearKey(operation);
      updateConnection(result.connection);
      if (result.authorization) {
        showAuthorization({ connectionId: connection.id, authorization: result.authorization });
      } else {
        setActionError('Rotation setup values are unavailable. Open the rotation to try again.');
      }
    } catch (error) {
      if (!closeForCapabilityError(error)) setActionError(safeActionMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCompleteRotation = async () => {
    if (!authorizationSession) return;
    const connectionId = authorizationSession.connectionId;
    const operation = `rotate-complete-${connectionId}`;
    setBusyAction(operation);
    setActionError(null);
    clearSensitive();
    try {
      const result = await rotateSellerWorkspaceConnection(
        connectionId,
        'complete',
        keyFor(operation)
      );
      clearKey(operation);
      updateConnection(result.connection);
    } catch (error) {
      if (errorCode(error) === 'authorization_expired') clearSensitive();
      if (!closeForCapabilityError(error)) setActionError(safeActionMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnect = async (connection: SellerWorkspaceConnection) => {
    const operation = `disconnect-${connection.id}`;
    setBusyAction(operation);
    setActionError(null);
    clearSensitive();
    try {
      const result = await disconnectSellerWorkspaceConnection(
        connection.id,
        keyFor(operation)
      );
      clearKey(operation);
      setDisconnectConfirmation(null);
      updateConnection(result.connection);
    } catch (error) {
      if (!closeForCapabilityError(error)) setActionError(safeActionMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopy = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
    } catch {
      setActionError('Copy was blocked by the browser. Select and copy the value manually.');
    }
  };

  if (pageState === 'loading') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Seller Workspace</h1>
        <div className="flex items-center gap-3 py-12 text-sm text-gray-600" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent" />
          <span>Checking AWS connection availability...</span>
        </div>
      </div>
    );
  }

  if (pageState === 'unavailable') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Seller Workspace</h1>
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">AWS connections are unavailable</h2>
          <p className="mt-2 text-sm text-gray-600">
            This capability is disabled or unavailable. No AWS connection actions are enabled.
          </p>
        </div>
      </div>
    );
  }

  if (pageState === 'gated') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Seller Workspace</h1>
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Active seller access required</h2>
          <p className="mt-2 text-sm text-gray-600">
            AWS connections are available only after the server confirms an active seller capability.
          </p>
        </div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Seller Workspace</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-8">
          <h2 className="text-lg font-semibold text-red-900">Workspace could not be loaded</h2>
          <p className="mt-2 text-sm text-red-800">No connection actions are available until this check succeeds.</p>
          <button
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seller Workspace</h1>
          <p className="mt-2 text-sm text-gray-600">
            Connect an AWS S3 prefix for seller data workflows. No AWS credentials are stored here.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={busyAction !== null}
          className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#303F9F] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === 'create-connection' ? 'Creating...' : 'Add AWS connection'}
        </button>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {actionError}
        </div>
      )}

      {authorizationSession && (
        <section className="rounded-xl border border-indigo-200 bg-white p-6 shadow-sm" aria-labelledby="aws-setup-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="aws-setup-title" className="text-lg font-semibold text-gray-900">
                {authorizationSession.authorization.purpose === 'aws_external_id_rotation'
                  ? 'Reconnect / rotate AWS trust'
                  : 'Configure AWS trust'}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                These server-generated values stay in this page only. Copy them into the AWS role trust policy.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Available until {formatDate(authorizationSession.authorization.expires_at)}.
              </p>
            </div>
            <button
              type="button"
              onClick={clearSensitive}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close setup values
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <CopyValue
              label="ai.market AWS principal"
              value={authorizationSession.authorization.principal_arn}
              copied={copiedField === 'principal'}
              onCopy={() => handleCopy('principal', authorizationSession.authorization.principal_arn)}
            />
            <CopyValue
              label="ExternalId"
              value={authorizationSession.authorization.external_id}
              copied={copiedField === 'external-id'}
              onCopy={() => handleCopy('external-id', authorizationSession.authorization.external_id)}
            />
            <CopyValue
              label="Trust policy JSON"
              value={trustPolicyJSON}
              multiline
              copied={copiedField === 'trust-policy'}
              onCopy={() => handleCopy('trust-policy', trustPolicyJSON)}
            />
          </div>

          {authorizationSession.authorization.purpose === 'aws_external_id' ? (
            <form className="mt-6 space-y-4 border-t border-gray-200 pt-6" onSubmit={handleVerify} autoComplete="off">
              <div>
                <h3 className="font-medium text-gray-900">Verify the bounded S3 scope</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Enter the role and exact non-root prefix that ai.market should verify.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">
                  Role ARN
                  <input
                    required
                    value={scope.role_arn}
                    onChange={(event) => setScope((current) => ({ ...current, role_arn: event.target.value }))}
                    placeholder="arn:aws:iam::123456789012:role/seller-data"
                    spellCheck={false}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-[#3F51B5] focus:outline-none focus:ring-1 focus:ring-[#3F51B5]"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Bucket
                  <input
                    required
                    value={scope.bucket}
                    onChange={(event) => setScope((current) => ({ ...current, bucket: event.target.value }))}
                    placeholder="seller-data-bucket"
                    spellCheck={false}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-[#3F51B5] focus:outline-none focus:ring-1 focus:ring-[#3F51B5]"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Non-root prefix
                  <input
                    required
                    value={scope.prefix}
                    onChange={(event) => setScope((current) => ({ ...current, prefix: event.target.value }))}
                    placeholder="ai-market/data"
                    spellCheck={false}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-[#3F51B5] focus:outline-none focus:ring-1 focus:ring-[#3F51B5]"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  AWS region
                  <input
                    required
                    value={scope.region}
                    onChange={(event) => setScope((current) => ({ ...current, region: event.target.value }))}
                    placeholder="eu-west-1"
                    spellCheck={false}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-[#3F51B5] focus:outline-none focus:ring-1 focus:ring-[#3F51B5]"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={busyAction !== null}
                className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#303F9F] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyAction?.startsWith('verify-') ? 'Verifying...' : 'Verify AWS connection'}
              </button>
            </form>
          ) : (
            <div className="mt-6 border-t border-gray-200 pt-6">
              <h3 className="font-medium text-gray-900">Complete rotation</h3>
              <p className="mt-1 text-sm text-gray-600">
                Update the AWS trust policy with the new ExternalId, then explicitly complete verification.
              </p>
              <button
                type="button"
                onClick={handleCompleteRotation}
                disabled={busyAction !== null}
                className="mt-4 rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#303F9F] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyAction?.startsWith('rotate-complete-') ? 'Completing...' : 'Complete reconnect / rotation'}
              </button>
            </div>
          )}
        </section>
      )}

      {connections.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">No AWS connections</h2>
          <p className="mt-2 text-sm text-gray-500">Create a pending connection to receive server-generated trust values.</p>
        </div>
      ) : (
        <section className="space-y-4" aria-label="AWS connections">
          {connections.map((connection) => {
            const status = STATUS_PRESENTATION[connection.status];
            const terminal = ['expired', 'revoked', 'disabled'].includes(connection.status);
            const rotationPending = connection.rotation_substate === 'pending_verification';
            const awaitingSetup = connection.status === 'pending_authorization';
            return (
              <article key={connection.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-semibold text-gray-900">AWS S3 connection</h2>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.classes}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-gray-500">{connection.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {awaitingSetup && (
                      <button
                        type="button"
                        onClick={() => handleOpenAuthorization(connection)}
                        disabled={busyAction !== null}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {busyAction === `authorization-${connection.id}` ? 'Opening...' : 'Open setup values'}
                      </button>
                    )}
                    {connection.status === 'verified' && rotationPending && (
                      <button
                        type="button"
                        onClick={() => handleOpenAuthorization(connection)}
                        disabled={busyAction !== null}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Resume reconnect / rotation
                      </button>
                    )}
                    {connection.status === 'verified' && !rotationPending && (
                      <button
                        type="button"
                        onClick={() => handleStartRotation(connection)}
                        disabled={busyAction !== null}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Start reconnect / rotation
                      </button>
                    )}
                    {!terminal && (
                      <button
                        type="button"
                        onClick={() => setDisconnectConfirmation(connection.id)}
                        disabled={busyAction !== null}
                        className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>

                {connection.status === 'expired' && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    This pending connection expired and cannot be verified. Create a new connection to receive new setup values.
                  </div>
                )}

                {connection.status === 'verified' && (
                  <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="text-gray-500">Role ARN</dt><dd className="mt-1 break-all font-mono text-gray-900">{connection.role_arn}</dd></div>
                    <div><dt className="text-gray-500">Bucket</dt><dd className="mt-1 font-mono text-gray-900">{connection.bucket}</dd></div>
                    <div><dt className="text-gray-500">Prefix</dt><dd className="mt-1 break-all font-mono text-gray-900">{connection.prefix}</dd></div>
                    <div><dt className="text-gray-500">Region</dt><dd className="mt-1 font-mono text-gray-900">{connection.region}</dd></div>
                  </dl>
                )}

                {rotationPending && (
                  <p className="mt-4 text-sm text-amber-800">
                    Reconnect / rotation is waiting for the new trust policy. Complete it by {formatDate(connection.rotation_deadline)}.
                  </p>
                )}

                {disconnectConfirmation === connection.id && (
                  <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4" role="alertdialog" aria-label="Confirm disconnect">
                    <p className="text-sm font-medium text-red-900">
                      Disconnect this AWS connection? ai.market will no longer use this connection.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDisconnect(connection)}
                        disabled={busyAction !== null}
                        className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                      >
                        {busyAction === `disconnect-${connection.id}` ? 'Disconnecting...' : 'Confirm disconnect'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisconnectConfirmation(null)}
                        disabled={busyAction !== null}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
