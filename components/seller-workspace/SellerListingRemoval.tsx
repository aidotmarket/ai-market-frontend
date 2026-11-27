'use client';

import {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {sessionLifecycle} from '@/api/connector-seller-settings';
import {
  changeListingRemoval, pauseOwnerListing, readOwnerListings, removalError, withdrawOwnerListings,
  type BulkWithdrawalRequest, type OwnerListing, type RemovalAction, type RemovalRequest,
} from '@/api/sellerListingPublication';
import {dangerButtonClass, dangerSecondaryButtonClass, primaryButtonClass, secondaryButtonClass} from '@/components/ui/button-styles';
import {authSessionOwner, subscribeAuthSessionOwner} from '@/lib/auth-session-owner';
import {authSessionIdentity, useAuthStore} from '@/store/auth';
import {WorkspaceConfirmation} from './WorkspacePanel';

const actionLabel = {hide: 'Hide listing', unhide: 'Unhide listing', withdraw: 'Withdraw listing permanently'};
const checkoutMessage = 'You can hide or withdraw this listing once its open checkouts finish. You can pause it now to stop new sales, or contact support.';
const approvalGuidance = 'Start a new listing and get it approved before publishing it.';
const storageGuidance = 'Check your storage connection and make sure the approved files are still available.';

type Single = {listing: OwnerListing; body: RemovalRequest; pauseOnly?: boolean};
type Bulk = {listings: OwnerListing[]; body: BulkWithdrawalRequest};
type Confirmation = Single | Bulk;
type Failure = {message: string; retry: boolean; uncertain?: boolean; checkout?: boolean; recovery?: boolean};
type Outcome = {listing: OwnerListing; code?: string};

function explainFailure(status?: number, code?: string, message?: string): Failure {
  switch (code) {
    case 'listing_has_open_checkouts':
      return {message: message ?? checkoutMessage, retry: true, checkout: true};
    case 'STATE_STALE':
    case 'IDEMPOTENCY_CONFLICT':
      return {message: 'This listing changed. Refresh your listings and try again.', retry: false};
    case 'WITHDRAWN_TERMINAL':
      return {message: 'This listing was permanently withdrawn.', retry: false};
    case 'DELIVERY_MATERIAL_DESTROYED':
    case 'APPROVAL_REQUIRED':
      return {message: 'This listing needs a new approval before it can go public.', retry: false, recovery: true};
    case 'DELIVERY_UNAVAILABLE':
    case 'PUBLICATION_UNAVAILABLE':
      return {message: 'We could not restore this listing.', retry: status === 503, recovery: true};
    case 'STAFF_RESTRICTED':
      return {message: 'The marketplace has restricted this listing. Contact support for help.', retry: false};
    case 'BUYER_APPROVAL_UNAVAILABLE':
      return {message: 'Buyer approvals are temporarily unavailable. Try again later.', retry: true, recovery: true};
    case 'NOT_FOUND':
      return {message: 'This listing could not be found. Refresh your listings.', retry: false};
    case 'REMOVAL_UNAVAILABLE':
      return {message: 'Listing visibility changes are temporarily unavailable.', retry: false};
    case 'FEE_COLLECTION_REQUIRED':
      return {message: 'Pay your outstanding seller balance before restoring this listing.', retry: false};
    case 'capability_required':
      return {message: 'Complete seller setup before restoring this listing.', retry: false};
  }
  switch (status) {
    case 401:
    case 403:
      return {message: 'Sign in again to confirm this change.', retry: false};
    case 409:
      return {message: 'We could not make this change. Refresh your listings and try again.', retry: false};
    case 404:
      return {message: 'This listing could not be found. Refresh your listings.', retry: false};
    case 410:
      return {message: 'This listing is no longer available.', retry: false};
    case 451:
      return {message: 'This listing is unavailable for legal reasons.', retry: false};
    case 422:
      return {message: 'We could not accept this confirmation. Refresh your listings and confirm again.', retry: false};
    case 429:
      return {message: 'Too many requests. Wait a moment, then try again.', retry: true};
    default:
      return {message: 'We could not confirm this change. Try again or refresh your listings.', retry: true, uncertain: true};
  }
}

function displayStatus(listing: OwnerListing) {
  if (listing.seller_status === 'withdrawn') return listing.staff_restriction === 'none'
    ? 'Withdrawn' : 'Withdrawn. Marketplace restriction applies.';
  if (listing.staff_restriction !== 'none') return 'Restricted by the marketplace';
  if (listing.seller_status === 'hidden') return 'Hidden';
  if (listing.status === 'published' && listing.is_listed) return 'Published';
  if (listing.status === 'unlisted') return 'New sales paused';
  return 'Not published';
}

function Effects({action, listings}: {action: RemovalAction; listings: OwnerListing[]}) {
  return <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
    {action === 'unhide' ? <>
      <li>The public page will be viewable by link again.</li>
      <li>If sales were on before hiding, sales will resume and the listing can appear in search and AI assistants again.</li>
      <li>Existing buyers keep their purchased access.</li>
      <li>Waiting buyer approval requests resume. Closed inquiries and listing responses to data requests stay closed. Existing orders continue.</li>
      <li>You can hide the listing again.</li>
    </> : <>
      <li>The public page will be unavailable, including by direct link.</li>
      <li>The listing will be removed from marketplace search and AI discovery. Other sites may take time to update.</li>
      <li>Existing buyers keep their purchased access.</li>
      <li>Open inquiries and responses to data requests for this listing will close.</li>
      <li>{action === 'hide' ? 'Waiting buyer approval requests will pause.' : 'Waiting buyer approval requests will close.'}</li>
      <li>Open checkouts must finish first. Existing orders continue.</li>
      <li>{action === 'hide' ? 'You can restore an eligible listing after checking its approval and storage.' : 'Withdrawal is permanent. To sell again, create a new listing and get it approved.'}</li>
    </>}
    {listings.length === 1 && <li>{listings[0].protected_buyer_count === 1
      ? '1 buyer currently has protected access.'
      : `${listings[0].protected_buyer_count} buyers currently have protected access.`}</li>}
  </ul>;
}

interface Props {
  active: boolean;
  onChange?: () => void;
  onOpenConfirmation?: () => void;
  onRecovery?: (section: 'listing' | 'storage') => void;
  recoveryPrerequisite?: string;
  compact?: boolean;
  refresh?: number;
}

export default function SellerListingRemoval(props: Props) {
  const principal = useAuthStore(authSessionIdentity);
  const generation = useSyncExternalStore(subscribeAuthSessionOwner, authSessionOwner, authSessionOwner);
  return principal ? <OwnerListings key={JSON.stringify([principal, generation])} {...props} /> : null;
}

function OwnerListings({active: enabled, onChange, onOpenConfirmation, onRecovery, recoveryPrerequisite, compact, refresh = 0}: Props) {
  const [sameSession] = useState(sessionLifecycle);
  const [rows, setRows] = useState<OwnerListing[] | null>(null);
  const [readError, setReadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const active = enabled || confirmation !== null;
  const [failure, setFailure] = useState<Failure | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [bulkGateClosed, setBulkGateClosed] = useState(false);
  const [reconfirmed, setReconfirmed] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  const pauseKey = useRef<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    if (!active || !sameSession()) return;
    const request = new AbortController();
    const current = () => !request.signal.aborted && sameSession();
    setRefreshing(true);
    setReadError(false);
    readOwnerListings(request.signal).then(value => {
      if (current()) {
        setRows(value);
        setBulkGateClosed(false);
        if (value === null) {
          setConfirmation(null);
          setOutcomes([]);
          setNotice('');
        }
      }
    }).catch(() => {
      if (current()) {
        setRows(null);
        setReadError(true);
      }
    }).finally(() => { if (current()) setRefreshing(false); });
    return () => request.abort();
  }, [active, refresh, revision, sameSession]);

  useEffect(() => {
    if (confirmation) cancel.current?.focus();
  }, [confirmation]);

  function refreshListings() {
    setRefreshing(true);
    setRevision(value => value + 1);
  }

  function closeConfirmation() {
    setConfirmation(null);
    setFailure(null);
    pauseKey.current = null;
    // The opening button becomes enabled after React closes the panel.
    const button = trigger.current;
    requestAnimationFrame(() => button?.focus());
  }

  function openConfirmation(value: Confirmation, button: HTMLButtonElement) {
    setNotice('');
    setFailure(null);
    trigger.current = button;
    setConfirmation(value);
    onOpenConfirmation?.();
  }

  async function submit(pause: boolean) {
    if (!active || !sameSession() || !confirmation || mutation.current || refreshing) return;
    if (pause && !('listing' in confirmation)) return;
    if (!pause && 'listing' in confirmation && confirmation.pauseOnly) return;
    const request = new AbortController();
    const current = () => !request.signal.aborted && sameSession();
    mutation.current = request;
    setBusy(true);
    if (!pause) setFailure(null);
    setNotice('');
    try {
      if ('listing' in confirmation) {
        const {listing, body} = confirmation;
        if (pause) {
          pauseKey.current ??= crypto.randomUUID();
          await pauseOwnerListing(listing.listing_id, pauseKey.current, request.signal);
        } else {
          await changeListingRemoval(listing.listing_id, body, request.signal);
        }
        if (!current()) return;
        setNotice(pause ? 'New sales paused. The page is still viewable by link.' :
          {hide: 'Listing hidden.', unhide: 'Listing restored.', withdraw: 'Listing permanently withdrawn.'}[body.action]);
        closeConfirmation();
        refreshListings();
      } else {
        const result = await withdrawOwnerListings(confirmation.body, request.signal);
        if (!current()) return;
        const failed = new Map(result.failed.map(item => [item.listing_id, item.code]));
        const attempted = new Set(confirmation.body.listing_ids);
        setOutcomes(previous => [
          ...previous.filter(({listing}) => !attempted.has(listing.listing_id)),
          ...confirmation.listings.map(listing => ({listing, code: failed.get(listing.listing_id)})),
        ]);
        setReconfirmed(false);
        if (result.failed.some(item => item.code === 'REMOVAL_UNAVAILABLE')) {
          setBulkGateClosed(true);
          setRows(null);
        } else {
          const receipts = new Map(result.receipts.map(receipt => [receipt.listing_id, receipt]));
          setRows(previous => previous?.map(listing => {
            const receipt = receipts.get(listing.listing_id);
            return receipt ? {...listing, ...receipt, allowed_actions: []} : listing;
          }) ?? null);
        }
        closeConfirmation();
      }
      onChange?.();
    } catch (error) {
      if (!current()) return;
      const {status, code, message} = removalError(error);
      if (status === 503 && code === 'REMOVAL_UNAVAILABLE') {
        closeConfirmation();
        setRows(null);
        setOutcomes([]);
      } else if (pause) {
        setNotice('We could not confirm that new sales paused. Try pausing again or contact support.');
      } else {
        setFailure(explainFailure(status, code, message));
      }
    } finally {
      if (mutation.current === request) mutation.current = null;
      if (current()) setBusy(false);
    }
  }

  const showReadError = readError && !compact;
  const hasOperation = !!confirmation || !!notice || outcomes.length > 0;
  if (!active || ((!rows && !showReadError) && !hasOperation)) return null;
  const eligible = rows?.filter(row => row.allowed_actions.includes('withdraw')) ?? [];
  const retryIds = new Set(outcomes.filter(item => item.code).map(item => item.listing.listing_id));
  const remaining = eligible.filter(row => retryIds.has(row.listing_id));
  const bulkTargets = retryIds.size ? remaining : eligible;
  const confirmationListings = confirmation ? ('listing' in confirmation ? [confirmation.listing] : confirmation.listings) : [];
  const action = confirmation && 'listing' in confirmation ? confirmation.body.action : 'withdraw';
  const pauseOnly = !!confirmation && 'listing' in confirmation && confirmation.pauseOnly;
  const label = pauseOnly ? 'Pause new sales' : confirmation && 'listings' in confirmation
    ? retryIds.size ? 'Withdraw remaining listings' : 'Withdraw all listings'
    : actionLabel[action];

  function showBulk(button: HTMLButtonElement) {
    openConfirmation({listings: bulkTargets, body: {
      listing_ids: bulkTargets.map(row => row.listing_id),
      request_id: crypto.randomUUID(),
      confirm_permanent: true,
    }}, button);
  }

  function renderConfirmation() {
    return <WorkspaceConfirmation label={label}>
      <h4 className="font-semibold text-gray-900">{label}</h4>
      <p className="text-sm text-gray-700">{confirmationListings.length === 1 && confirmation && 'listing' in confirmation
        ? confirmation.listing.title : `${confirmationListings.length} listings`}</p>
      {confirmation && 'listings' in confirmation && <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
        {confirmationListings.map(row => <li key={row.listing_id}>{row.title} ({row.protected_buyer_count} {row.protected_buyer_count === 1 ? 'buyer' : 'buyers'} with protected access)</li>)}
      </ul>}
      {!pauseOnly && <Effects action={action} listings={confirmationListings} />}
      {failure && <p role="alert" className="text-sm text-red-800">{failure.message}</p>}
      {failure?.recovery && recovery(true)}
      {failure?.checkout && confirmation && 'listing' in confirmation && confirmation.listing.status === 'published' &&
        <div className="space-y-2">
          <button type="button" className={secondaryButtonClass} disabled={busy || refreshing} onClick={() => void submit(true)}>Pause new sales</button>
          <p className="text-sm text-gray-700">Stop new sales. Page stays viewable by link.</p>
          <p className="text-sm text-gray-700">Existing buyers keep their purchased access.</p>
        </div>}
      {notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        {!pauseOnly && (!failure || failure.retry) && <button type="button" disabled={busy || refreshing} onClick={() => void submit(false)}
          className={action === 'withdraw' ? dangerButtonClass : primaryButtonClass}>
          {busy ? 'Saving…' : failure ? 'Try again' : action === 'withdraw' ? 'Confirm permanent withdrawal' : `Confirm ${action}`}
        </button>}
        {failure && (!failure.retry || failure.uncertain) && <button type="button" className={secondaryButtonClass} disabled={busy || refreshing} onClick={() => {
          closeConfirmation();
          refreshListings();
          onChange?.();
        }}>Refresh listings</button>}
        <button ref={cancel} type="button" className={secondaryButtonClass} disabled={busy || failure?.uncertain}
          onClick={closeConfirmation}>Cancel</button>
      </div>
    </WorkspaceConfirmation>;
  }

  function recovery(includeStorage: boolean) {
    return <div className="space-y-2 text-sm text-gray-700">
      <p>{approvalGuidance}{includeStorage && ` ${storageGuidance}`}</p>
      {recoveryPrerequisite && <p>{recoveryPrerequisite}</p>}
      {onRecovery && <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButtonClass} onClick={() => onRecovery('listing')}>Prepare listing</button>
        {includeStorage && <button type="button" className={secondaryButtonClass} onClick={() => onRecovery('storage')}>Check storage</button>}
      </div>}
    </div>;
  }

  if (!enabled) return renderConfirmation();
  if (compact && rows?.length === 0 && !hasOperation) return null;
  return <section aria-label="Listing visibility" className="space-y-4">
    <h2 className="text-lg font-semibold text-gray-900">{compact ? 'Your Workspace listings' : 'Listing visibility'}</h2>
    {!confirmation && notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}
    {showReadError && <p role="alert" className="text-sm text-red-800">We could not check listing visibility. Try refreshing.</p>}
    {refreshing && <p role="status" className="text-sm text-gray-600">Checking your listings…</p>}
    {outcomes.length > 0 && <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="font-semibold">Withdrawal results</h3>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        {outcomes.map(({listing, code}) => <li key={listing.listing_id}>
          <strong>{listing.title}</strong>
          <p>{code ? explainFailure(undefined, code).message : 'Permanently withdrawn.'}</p>
          {!bulkGateClosed && code === 'listing_has_open_checkouts' && listing.status === 'published' && !confirmation &&
            <button type="button" className={secondaryButtonClass} onClick={event => {
              openConfirmation({...singleRequest(listing, 'withdraw'), pauseOnly: true}, event.currentTarget);
              setFailure(explainFailure(409, code));
            }}>Pause new sales</button>}
        </li>)}
      </ul>
      {!bulkGateClosed && retryIds.size > 0 && !reconfirmed && <button type="button" className={secondaryButtonClass} disabled={refreshing || !!confirmation}
        onClick={() => { setReconfirmed(true); refreshListings(); }}>Refresh remaining listings</button>}
      {retryIds.size > 0 && reconfirmed && rows && !refreshing && remaining.length === 0 && <p className="text-sm">No remaining listings are available to withdraw.</p>}
      {!bulkGateClosed && <button type="button" className={secondaryButtonClass} disabled={busy || !!confirmation}
        onClick={() => {setOutcomes([]); refreshListings();}}>Close results</button>}
    </div>}
    {(showReadError || !outcomes.length && rows) && <button type="button" className={secondaryButtonClass}
      disabled={refreshing || !!confirmation} onClick={refreshListings}>Refresh listing visibility</button>}
    {bulkTargets.length >= (retryIds.size ? 1 : 2) && bulkTargets.length <= 500 && (!retryIds.size || reconfirmed) &&
      <button type="button" className={dangerSecondaryButtonClass} disabled={refreshing || !!confirmation}
        onClick={event => showBulk(event.currentTarget)}>{retryIds.size ? 'Withdraw remaining listings' : 'Withdraw all listings'}</button>}
    {bulkTargets.length > 500 && <p className="text-sm text-gray-700">You can withdraw up to 500 listings at once. Withdraw listings individually to reduce the total.</p>}
    {confirmation && 'listings' in confirmation && renderConfirmation()}
    {rows?.length === 0 && <p className="text-sm text-gray-600">You have no Workspace listings.</p>}
    <ul className="space-y-3">{rows?.map(listing => <li key={listing.listing_id} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900">{listing.title}</h3>
        <span className="text-sm text-gray-600">{displayStatus(listing)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {listing.allowed_actions.map(action => <button key={action} type="button" disabled={refreshing || !!confirmation}
          className={action === 'withdraw' ? dangerSecondaryButtonClass : secondaryButtonClass}
          onClick={event => openConfirmation(singleRequest(listing, action), event.currentTarget)}>{actionLabel[action]}</button>)}
      </div>
      {listing.seller_status === 'hidden' && listing.staff_restriction === 'none' && !listing.allowed_actions.includes('unhide') && recovery(false)}
      {confirmation && 'listing' in confirmation && confirmation.listing.listing_id === listing.listing_id && renderConfirmation()}
    </li>)}</ul>
    {!rows?.some(listing => confirmation && 'listing' in confirmation && confirmation.listing.listing_id === listing.listing_id) &&
      confirmation && 'listing' in confirmation && renderConfirmation()}
  </section>;
}

function singleRequest(listing: OwnerListing, action: RemovalAction): Single {
  return {listing, body: {
    request_id: crypto.randomUUID(),
    action,
    expected_status: listing.status,
    expected_seller_status: listing.seller_status,
    expected_staff_restriction: listing.staff_restriction,
    ...(action === 'withdraw' ? {confirm_permanent: true} : {}),
  }};
}
