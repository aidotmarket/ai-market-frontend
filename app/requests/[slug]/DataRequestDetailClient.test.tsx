// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import type React from 'react';
import http from 'node:http';
import https from 'node:https';
import type { DataRequestDetail, User } from '@/types';
import { AxiosError, AxiosHeaders } from 'axios';
import DataRequestDetailClient from './DataRequestDetailClient';
import { currentPublicContent, parsePublicationPreview } from '@/lib/request-publication-preview';

const mocks = vi.hoisted(() => ({
  auth: {
    user: null as User | null,
    isAuthenticated: false,
    token: null as string | null,
  },
  routerPush: vi.fn(),
  toast: vi.fn(),
  getDataRequest: vi.fn(),
  getRequestThreadSelector: vi.fn(),
  updateDataRequest: vi.fn(),
  publishDataRequest: vi.fn(),
  deleteDataRequest: vi.fn(),
  submitDataRequestResponse: vi.fn(),
  getDataRequestResponses: vi.fn(),
  previewDataRequestPublication: vi.fn(),
  confirmDataRequestPublication: vi.fn(),
  withdrawDataRequestPublication: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: Object.assign(() => mocks.auth, { getState: () => mocks.auth }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/Toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/api/data-requests', async () => ({
  ...await vi.importActual<typeof import('@/api/data-requests')>('@/api/data-requests'),
  getDataRequest: mocks.getDataRequest,
  getRequestThreadSelector: mocks.getRequestThreadSelector,
  updateDataRequest: mocks.updateDataRequest,
  publishDataRequest: mocks.publishDataRequest,
  deleteDataRequest: mocks.deleteDataRequest,
  submitDataRequestResponse: mocks.submitDataRequestResponse,
  getDataRequestResponses: mocks.getDataRequestResponses,
  previewDataRequestPublication: mocks.previewDataRequestPublication,
  confirmDataRequestPublication: mocks.confirmDataRequestPublication,
  withdrawDataRequestPublication: mocks.withdrawDataRequestPublication,
}));

const owner: User = {
  id: 'buyer-1',
  email: 'buyer@example.com',
  first_name: 'Buyer',
  last_name: null,
  company_name: null,
  role: 'buyer',
  status: 'active',
  created_at: '2026-07-31T00:00:00Z',
  email_verified_at: '2026-07-31T00:00:00Z',
  totp_enabled: false,
  auth_methods: ['password'],
  primary_auth: 'password',
};

function makeDraft(): DataRequestDetail {
  return {
    id: 'request-1',
    slug: 'draft-request',
    title: 'Private Draft Request',
    description: 'A request that is visible only to its owner.',
    categories: ['healthcare'],
    urgency: 'normal',
    price_range_min: null,
    price_range_max: null,
    currency: 'USD',
    status: 'draft',
    response_count: 0,
    buyer_display_name: 'Buyer',
    created_at: '2026-07-31T00:00:00Z',
    updated_at: null,
    format_preferences: ['csv'],
    provenance_requirements: null,
    published_at: null,
    buyer_id: owner.id,
  };
}

function makeOwnerRequest(overrides: Partial<DataRequestDetail> = {}): DataRequestDetail {
  return {
    ...makeDraft(),
    slug: 'buyer-request',
    title: 'Buyer Request',
    status: 'open',
    public_consent_status: 'required',
    public_content_hash: 'a'.repeat(64),
    required_public_consent_policy_version: 'request-publication-v1',
    publication_decision: 'action_required',
    publication_reason: 'public_consent_required',
    publication_decision_version: 1,
    publication_next_action: 'Confirm the current public text for publication.',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function preparePublicPreview(request: DataRequestDetail) {
  mocks.previewDataRequestPublication.mockResolvedValue({ source_content_hash: request.public_content_hash,
    public_content_hash: request.public_content_hash, public_content: currentPublicContent(request) });
  mocks.getDataRequest.mockResolvedValue(request);
  fireEvent.click(await screen.findByRole('button', { name: 'Review public preview' }));
  await screen.findByRole('button', { name: 'Make this request public' });
}

describe('DataRequestDetailClient authenticated fallback loading', () => {
  beforeEach(() => {
    const refuseNetwork = () => { throw new Error('Unmocked network refused'); };
    vi.stubGlobal('fetch', vi.fn(refuseNetwork));
    vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(refuseNetwork);
    vi.spyOn(http, 'request').mockImplementation(refuseNetwork);
    vi.spyOn(https, 'request').mockImplementation(refuseNetwork);
    mocks.auth.user = owner;
    mocks.auth.isAuthenticated = true;
    mocks.getDataRequestResponses.mockResolvedValue([]);
    mocks.getRequestThreadSelector.mockResolvedValue({ contract: 'request-thread-v1', request_id: 'request-1', side: 'buyer', availability: 'off', threads: [] });
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
    mocks.auth.token = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([true, false, undefined, 'true', 1, null])('tags only an explicit sample flag (%s) in the detail title/status row', async is_sample => {
    mocks.auth.user = null;
    mocks.auth.isAuthenticated = false;
    const extra = is_sample === undefined ? {} : { is_sample };
    const request = { ...makeOwnerRequest(), title: 'Synthetic data request', ...extra } as DataRequestDetail;
    mocks.getDataRequest.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    await waitFor(() => expect(mocks.getDataRequest).toHaveBeenCalled());
    const heading = screen.getByRole('heading', { name: 'Synthetic data request' });
    const header = within(heading.parentElement!);
    expect(header.queryByText('(SAMPLE)') !== null).toBe(is_sample === true);
    expect(header.getByText('open')).toBeTruthy();
    expect(screen.queryAllByText('(SAMPLE)')).toHaveLength(is_sample === true ? 1 : 0);
    expect(screen.getByRole('link', { name: /Back to requests/ }).getAttribute('href')).toBe('/requests');
  });

  it.each([
    ['**Title: Licensed retail data**', '**Title: Licensed retail data**. Buyer description.', 'Licensed retail data'],
    ['**Title: Licensed retail transaction data for regional demand forecasting...', '**Title: Licensed retail transaction data for regional demand forecasting and inventory planning**. Buyer description.', 'Licensed retail transaction data for regional demand forecasting...'],
    ['**Title: Explicit title**', '**Title: Different title**. Buyer description.', '**Title: Explicit title**'],
    ['Ordinary explicit title', '**Title: Different title**. Buyer description.', 'Ordinary explicit title'],
  ])('displays the guarded detail title without changing owner values: %s', async (title, description, display) => {
    const request = makeOwnerRequest({ title, description });
    mocks.getDataRequest.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    expect(await screen.findByRole('heading', { name: display })).toBeTruthy();
    expect(screen.getByText(description)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit request' }));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveProperty('value', title);
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveProperty('value', description);
    expect(request.title).toBe(title);
    expect(request.slug).toBe('buyer-request');
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
  });

  const savedQuote = {
    id: 'response-1', request_id: 'request-1', proposal: 'Available dataset',
    proposed_price: 125, proposed_timeline: '2 weeks', status: 'submitted',
    created_at: '2026-10-06T00:00:00Z', updated_at: null,
  };

  async function renderSupplier(overrides: Partial<DataRequestDetail> = {}) {
    mocks.auth.user = { ...owner, id: 'supplier-1', role: 'seller' };
    const request = makeOwnerRequest(overrides);
    mocks.getDataRequest.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    await waitFor(() => expect(mocks.getDataRequestResponses).toHaveBeenCalledWith(request.id));
    await act(async () => { await mocks.getDataRequestResponses.mock.results.at(-1)?.value; });
  }

  function fillQuote() {
    fireEvent.change(screen.getByRole('textbox', { name: 'Proposal' }), { target: { value: 'Available dataset' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Proposed Price (USD)' }), { target: { value: '125' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Timeline' }), { target: { value: '2 weeks' } });
  }

  const responseRefusal = 'Cannot respond: this is a sample request for demonstration; nobody will review proposals';

  it.each(['open', 'responses_received'] as const)('shows the refusal and blocks seller submissions for %s requests', async status => {
    await renderSupplier({ status, response_refusal: responseRefusal });
    expect(screen.getByRole('status').textContent).toBe(responseRefusal);
    const submit = screen.getByRole('button', { name: 'Submit Response' });
    expect(submit).toHaveProperty('disabled', true);
    fillQuote();
    expect(submit).toHaveProperty('disabled', true);
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);
    expect(mocks.submitDataRequestResponse).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ''])('preserves seller submission when response_refusal is %s', async response_refusal => {
    mocks.submitDataRequestResponse.mockResolvedValue(savedQuote);
    await renderSupplier(response_refusal === undefined ? {} : { response_refusal });
    expect(screen.queryByRole('status')).toBeNull();
    const submit = screen.getByRole('button', { name: 'Submit Response' });
    expect(submit).toHaveProperty('disabled', true);
    fillQuote();
    expect(submit).toHaveProperty('disabled', false);
    fireEvent.click(submit);
    await screen.findByText('Your nonbinding quote is saved. No further submission is needed.');
    expect(mocks.submitDataRequestResponse).toHaveBeenCalledExactlyOnceWith('request-1', {
      proposal: 'Available dataset', proposed_price: 125, proposed_timeline: '2 weeks',
    });
  });

  it('shows the refusal and disables the anonymous respond entry button', async () => {
    mocks.auth.user = null;
    mocks.auth.isAuthenticated = false;
    const request = makeOwnerRequest({ response_refusal: responseRefusal });
    mocks.getDataRequest.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    await waitFor(() => expect(mocks.getDataRequest).toHaveBeenCalled());
    expect(screen.getByRole('status').textContent).toBe(responseRefusal);
    expect(screen.getByRole('button', { name: 'Log in to Respond' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('link', { name: 'Log in to Respond' })).toBeNull();
  });

  function responseFailure(status: number, detail: unknown) {
    return new AxiosError('Request failed', undefined, undefined, undefined, {
      data: { detail }, status, statusText: 'Failed', headers: {}, config: { headers: new AxiosHeaders() },
    });
  }

  it('shows structured 403 inline and preserves all quote fields without requiring Stripe for quotes', async () => {
    mocks.submitDataRequestResponse.mockRejectedValue(responseFailure(403, {
      error: 'capability_required', missing_steps: ['company_name', 'stripe_payouts_live'],
    }));
    await renderSupplier();
    fillQuote();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Quote not recorded.');
    expect(alert.textContent).toContain('company name');
    expect(alert.textContent).toContain('Nonbinding quotes do not require Stripe');
    expect(screen.getByRole('textbox', { name: 'Proposal' })).toHaveProperty('value', 'Available dataset');
    expect(screen.getByRole('spinbutton', { name: 'Proposed Price (USD)' })).toHaveProperty('value', '125');
    expect(screen.getByRole('textbox', { name: 'Timeline' })).toHaveProperty('value', '2 weeks');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit Response' })).toHaveProperty('disabled', false));
    expect(mocks.submitDataRequestResponse).toHaveBeenCalledTimes(1);
  });

  it('retains the returned ID and status receipt and prevents repeated submit', async () => {
    const post = deferred<typeof savedQuote>();
    mocks.submitDataRequestResponse.mockReturnValue(post.promise);
    await renderSupplier();
    fillQuote();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Submitting...' }).closest('form')!);
    expect(mocks.submitDataRequestResponse).toHaveBeenCalledTimes(1);
    expect(mocks.submitDataRequestResponse).toHaveBeenCalledWith('request-1', {
      proposal: 'Available dataset', proposed_price: 125, proposed_timeline: '2 weeks',
    });
    await act(async () => { post.resolve(savedQuote); });
    expect(screen.getByRole('status').textContent).toContain('Response ID: response-1 · Status: submitted');
    expect(screen.getByRole('status').textContent).toContain('Timeline: 2 weeks');
    expect(screen.getByRole('button', { name: 'Submit Response' })).toHaveProperty('disabled', true);
    fireEvent.submit(screen.getByRole('button', { name: 'Submit Response' }).closest('form')!);
    expect(mocks.submitDataRequestResponse).toHaveBeenCalledTimes(1);
  });

  it('loads a supplier existing response as a receipt on reload, including legacy timeline', async () => {
    mocks.getDataRequestResponses.mockResolvedValue([{ ...savedQuote, proposed_timeline: undefined, timeline: 'legacy timeline' }]);
    await renderSupplier();
    expect(screen.getByRole('status').textContent).toContain('response-1');
    expect(screen.getByRole('status').textContent).toContain('legacy timeline');
    fillQuote();
    expect(screen.getByRole('button', { name: 'Submit Response' })).toHaveProperty('disabled', true);
    expect(mocks.submitDataRequestResponse).not.toHaveBeenCalled();
  });

  it.each(['network', '409'])('recovers a recorded quote after %s without a second POST', async (outcome) => {
    mocks.submitDataRequestResponse.mockRejectedValue(outcome === '409' ? responseFailure(409, 'Already responded') : new Error('Lost result'));
    await renderSupplier();
    mocks.getDataRequestResponses.mockResolvedValue([savedQuote]);
    fillQuote();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }));
    expect((await screen.findByRole('status')).textContent).toContain('response-1');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.submitDataRequestResponse).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Submit Response' })).toHaveProperty('disabled', true);
  });

  it('keeps an uncertain failure retryable and lets the supplier check saved quotes', async () => {
    mocks.submitDataRequestResponse.mockRejectedValue(new Error('Lost result'));
    await renderSupplier();
    mocks.getDataRequestResponses.mockRejectedValue(new Error('Offline'));
    fillQuote();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not confirm whether your quote was recorded');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit Response' })).toHaveProperty('disabled', false));
    expect(screen.getByRole('textbox', { name: 'Proposal' })).toHaveProperty('value', 'Available dataset');
    mocks.getDataRequestResponses.mockResolvedValue([savedQuote]);
    fireEvent.click(screen.getByRole('button', { name: 'Check saved quotes' }));
    expect((await screen.findByRole('status')).textContent).toContain('response-1');
    expect(mocks.submitDataRequestResponse).toHaveBeenCalledTimes(1);
  });

  it('shows validation details as a definite rejection', async () => {
    mocks.submitDataRequestResponse.mockRejectedValue(responseFailure(422, [{ loc: ['body', 'proposed_timeline'], msg: 'Timeline is too long' }]));
    await renderSupplier();
    fillQuote();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Quote not recorded. Timeline is too long');
  });

  it('renders an owner draft and its open action after the authenticated fetch succeeds', async () => {
    const draft = makeDraft();
    mocks.getDataRequest.mockResolvedValue(draft);
    mocks.publishDataRequest.mockResolvedValue(makeOwnerRequest());

    render(<DataRequestDetailClient slug={draft.slug} initialRequest={null} />);

    expect(await screen.findByRole('heading', { name: draft.title })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open request' }));
    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        'Your request is open. Review the public visibility step below.',
        'success'
      );
    });
    expect(mocks.getDataRequest).toHaveBeenCalledWith(draft.slug);
  });

  it('renders an explicit not-found state with a requests link for an authoritative 404', async () => {
    mocks.getDataRequest.mockRejectedValue(responseFailure(404, 'Not found'));

    render(<DataRequestDetailClient slug="missing-request" initialRequest={null} />);

    expect(await screen.findByRole('heading', { name: 'Request not found' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Browse Requests' }).getAttribute('href')).toBe('/requests');
    await waitFor(() => {
      expect(mocks.getDataRequest).toHaveBeenCalledWith('missing-request');
    });
  });

  it.each([
    ['network', new AxiosError('Network Error')],
    ['500', responseFailure(500, 'Internal error')],
    ['429', responseFailure(429, 'Rate limited')],
    ['unknown not-found text', new Error('not found')],
    ['malformed error', { response: { status: 404 }, message: 'not found' }],
    ['empty error', null],
    ['malformed gone', { response: { status: 410 } }],
    ['unknown gone text', new Error('410 Gone')],
  ])('shows unavailable for %s without inferring absence or retrying automatically', async (_, error) => {
    mocks.getDataRequest.mockRejectedValue(error);
    render(<DataRequestDetailClient slug="existing-request" initialRequest={makeOwnerRequest()} />);
    expect(await screen.findByRole('heading', { name: 'Request could not be loaded' })).not.toBeNull();
    expect(screen.queryByText(/removed or does not exist/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Buyer Request' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit request' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make this request public' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Browse Requests' }).getAttribute('href')).toBe('/requests');
    expect(mocks.getDataRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps forbidden reads generic without revealing private reasons', async () => {
    mocks.getDataRequest.mockRejectedValue(responseFailure(403, 'Private owner-only draft'));
    render(<DataRequestDetailClient slug="private-request" initialRequest={null} />);
    expect(await screen.findByRole('heading', { name: 'Request not found' })).not.toBeNull();
    expect(screen.queryByText(/Private owner-only/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('explicitly retries the same request with normal scoped reads, handles repeated failure, then clears the error on success', async () => {
    const pending = deferred<DataRequestDetail>();
    const draft = makeDraft();
    mocks.getDataRequest.mockRejectedValueOnce(new Error('Offline')).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(draft);
    render(<DataRequestDetailClient slug={draft.slug} initialRequest={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('heading', { name: draft.title })).toBeNull();
    expect(mocks.getDataRequest).toHaveBeenCalledTimes(2);
    await act(async () => { pending.reject(responseFailure(500, 'Unavailable')); });
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: draft.title })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByText(/temporarily unavailable/)).toBeNull();
    expect(mocks.getDataRequest.mock.calls).toEqual([[draft.slug], [draft.slug], [draft.slug]]);
    expect(mocks.getDataRequestResponses.mock.calls).toEqual([[draft.id]]);
    for (const api of [mocks.updateDataRequest, mocks.publishDataRequest,
      mocks.confirmDataRequestPublication, mocks.withdrawDataRequestPublication,
      mocks.deleteDataRequest, mocks.submitDataRequestResponse]) expect(api).not.toHaveBeenCalled();
  });

  it.each(['slug', 'user'] as const)('clears unavailable on %s change and ignores stale initial rejection', async (transition) => {
    const pending = deferred<DataRequestDetail>();
    mocks.getDataRequest.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(makeOwnerRequest());
    const view = render(<DataRequestDetailClient slug="old-request" initialRequest={null} />);
    if (transition === 'user') mocks.auth.user = { ...owner, id: 'other-buyer' };
    view.rerender(<DataRequestDetailClient slug={transition === 'slug' ? 'buyer-request' : 'old-request'} initialRequest={null} />);
    expect(await screen.findByRole('heading', { name: 'Buyer Request' })).not.toBeNull();
    await act(async () => { pending.reject(new Error('Old read failed')); });
    expect(screen.getByRole('heading', { name: 'Buyer Request' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it.each([['slug', 'success'], ['slug', 'failure'], ['user', 'success'], ['user', 'failure'], ['slug', 'gone'], ['user', 'gone']] as const)('ignores stale retry %s/%s after context change', async (transition, outcome) => {
    const pending = deferred<DataRequestDetail>();
    mocks.getDataRequest.mockRejectedValueOnce(new Error('Offline')).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(makeOwnerRequest());
    const view = render(<DataRequestDetailClient slug="old-request" initialRequest={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    if (transition === 'user') mocks.auth.user = { ...owner, id: 'other-buyer' };
    view.rerender(<DataRequestDetailClient slug={transition === 'slug' ? 'buyer-request' : 'old-request'} initialRequest={null} />);
    expect(await screen.findByRole('heading', { name: 'Buyer Request' })).not.toBeNull();
    await act(async () => {
      if (outcome === 'success') pending.resolve(makeDraft());
      else pending.reject(outcome === 'gone' ? responseFailure(410, 'Old private reason') : new Error('Old retry failed'));
    });
    expect(screen.queryByRole('heading', { name: 'Request no longer available' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Private Draft Request' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Buyer Request' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  function expectNoWrites() {
    for (const api of [mocks.updateDataRequest, mocks.publishDataRequest,
      mocks.confirmDataRequestPublication, mocks.withdrawDataRequestPublication,
      mocks.deleteDataRequest, mocks.submitDataRequestResponse]) expect(api).not.toHaveBeenCalled();
  }

  it.each(['initial', 'retry'] as const)('shows definitive generic unavailability for Axios 410 on %s read', async (phase) => {
    const gone = responseFailure(410, 'Private owner-only publication reason');
    if (phase === 'retry') mocks.getDataRequest.mockRejectedValueOnce(new Error('Offline'));
    mocks.getDataRequest.mockRejectedValue(gone);
    render(<DataRequestDetailClient slug="gone-request" initialRequest={makeOwnerRequest()} />);
    if (phase === 'retry') fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Request no longer available' })).not.toBeNull();
    expect(screen.queryByText(/temporarily unavailable|Private owner-only|removed or does not exist/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Browse Requests' }).getAttribute('href')).toBe('/requests');
    expect(mocks.getDataRequest.mock.calls).toEqual(Array.from({ length: phase === 'retry' ? 2 : 1 }, () => ['gone-request']));
    expect(mocks.getDataRequestResponses).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(['slug', 'user'] as const)('clears gone and saved responses on %s change', async (transition) => {
    const request = makeOwnerRequest();
    mocks.auth.user = { ...owner, id: 'supplier-1', role: 'seller' };
    mocks.getDataRequest.mockResolvedValueOnce(request).mockRejectedValueOnce(responseFailure(410, 'Private reason'))
      .mockResolvedValueOnce(request);
    mocks.getDataRequestResponses.mockResolvedValueOnce([savedQuote]).mockResolvedValueOnce([]);
    const view = render(<DataRequestDetailClient slug="old-request" initialRequest={null} />);
    expect((await screen.findByRole('status')).textContent).toContain(savedQuote.id);
    // A real account/slug transition starts the gone read, then another restores normal reads.
    if (transition === 'user') mocks.auth.user = { ...owner, id: 'supplier-2', role: 'seller' };
    view.rerender(<DataRequestDetailClient slug={transition === 'slug' ? 'gone-request' : 'old-request'} initialRequest={null} />);
    expect(await screen.findByRole('heading', { name: 'Request no longer available' })).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    if (transition === 'user') mocks.auth.user = { ...owner, id: 'supplier-3', role: 'seller' };
    view.rerender(<DataRequestDetailClient slug={transition === 'slug' ? 'new-request' : 'old-request'} initialRequest={null} />);
    expect(await screen.findByRole('heading', { name: request.title })).not.toBeNull();
    expect(screen.queryByText(/Request no longer available|Private reason/)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expectNoWrites();
  });

  it.each(['supplier', 'owner'] as const)('restores saved %s responses after explicit detail retry without writes', async (role) => {
    const request = makeOwnerRequest();
    if (role === 'supplier') mocks.auth.user = { ...owner, id: 'supplier-1', role: 'seller' };
    const responsesRead = deferred<typeof savedQuote[]>();
    mocks.getDataRequest.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(request);
    mocks.getDataRequestResponses.mockReturnValueOnce(responsesRead.promise);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mocks.getDataRequestResponses.mock.calls).toEqual([[request.id]]));
    expect(screen.queryByRole('button', { name: 'Submit Response' })).toBeNull();
    await act(async () => { responsesRead.resolve([savedQuote]); });
    if (role === 'supplier') {
      expect((await screen.findByRole('status')).textContent).toContain('Response ID: response-1 · Status: submitted');
      fillQuote();
      expect(screen.getByRole('button', { name: 'Submit Response' })).toHaveProperty('disabled', true);
      fireEvent.submit(screen.getByRole('button', { name: 'Submit Response' }).closest('form')!);
    } else {
      expect(await screen.findByRole('heading', { name: 'Responses (1)' })).not.toBeNull();
      expect(screen.getByText(savedQuote.proposal)).not.toBeNull();
      expect(screen.getByText('submitted')).not.toBeNull();
    }
    expect(mocks.getDataRequest.mock.calls).toEqual([[request.slug], [request.slug]]);
    expectNoWrites();
  });

  it('preserves existing response-read failure behavior after detail recovery without replaying a write', async () => {
    mocks.auth.user = { ...owner, id: 'supplier-1', role: 'seller' };
    const request = makeOwnerRequest();
    mocks.getDataRequest.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(request);
    mocks.getDataRequestResponses.mockRejectedValueOnce(new Error('Response read offline'));
    render(<DataRequestDetailClient slug={request.slug} initialRequest={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: request.title })).not.toBeNull();
    expect(mocks.getDataRequestResponses.mock.calls).toEqual([[request.id]]);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/No saved quotes|Quote not recorded|Quote recorded/)).toBeNull();
    expectNoWrites();
  });

  it('keeps the raw draft until the buyer copies the proposal into the editor, saves, and accepts a fresh preview', async () => {
    const request = makeOwnerRequest({ title: 'Raw private buyer title', description: 'Contact buyer@example.com for 500 healthcare records.' });
    const saved = makeOwnerRequest({ title: 'Healthcare records request', description: 'Seeking 500 healthcare records.', public_content_hash: 'b'.repeat(64) });
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.previewDataRequestPublication.mockResolvedValue({ source_content_hash: request.public_content_hash,
      public_content_hash: saved.public_content_hash, public_content: currentPublicContent(saved) });
    mocks.updateDataRequest.mockResolvedValue(saved);
    mocks.confirmDataRequestPublication.mockResolvedValue({ ...saved, publication_decision: 'eligible' });
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review public preview' }));
    await screen.findByText('Proposed public content');
    expect(screen.getByText(request.description)).toBeTruthy();
    expect(screen.getByText(saved.description)).toBeTruthy();
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use proposed text in editor' }));
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveProperty('value', saved.description);
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('heading', { name: saved.title });
    expect(screen.queryByRole('button', { name: 'Make this request public' })).toBeNull();
    await preparePublicPreview(saved);
    fireEvent.click(screen.getByRole('button', { name: 'Make this request public' }));
    await waitFor(() => expect(mocks.confirmDataRequestPublication).toHaveBeenCalledExactlyOnceWith(saved.id, saved.public_content_hash, saved.required_public_consent_policy_version));
    expect(mocks.publishDataRequest).not.toHaveBeenCalled();
    expect(mocks.withdrawDataRequestPublication).not.toHaveBeenCalled();
  });

  it('retains the raw saved draft when proposed editing is cancelled', async () => {
    const request = makeOwnerRequest();
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.previewDataRequestPublication.mockResolvedValue({ source_content_hash: request.public_content_hash,
      public_content_hash: 'b'.repeat(64), public_content: { ...currentPublicContent(request), description: 'A sanitized proposed request description.' } });
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review public preview' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use proposed text in editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(request.description)).toBeTruthy();
    expect(screen.queryByText('Proposed public content')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit request' }));
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveProperty('value', request.description);
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
  });

  it('preserves proposed editor text and refuses Save when a newer saved draft is found', async () => {
    const request = makeOwnerRequest();
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.previewDataRequestPublication.mockResolvedValue({ source_content_hash: request.public_content_hash,
      public_content_hash: 'b'.repeat(64), public_content: { ...currentPublicContent(request), description: 'A sanitized proposed request description.' } });
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review public preview' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use proposed text in editor' }));
    mocks.getDataRequest.mockResolvedValue({ ...request, public_content_hash: 'c'.repeat(64), description: 'The newer saved description for this request.' });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The saved request changed');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveProperty('value', 'A sanitized proposed request description.');
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
  });

  it('admits only one consent callback while the fresh persisted read is pending', async () => {
    const request = makeOwnerRequest();
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.confirmDataRequestPublication.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    await preparePublicPreview(request);
    const current = deferred<DataRequestDetail>();
    mocks.getDataRequest.mockReturnValue(current.promise);
    const accept = screen.getByRole('button', { name: 'Make this request public' });
    act(() => { accept.click(); accept.click(); });
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
    await act(async () => current.resolve(request));
    expect(mocks.confirmDataRequestPublication).toHaveBeenCalledExactlyOnceWith(request.id, request.public_content_hash, request.required_public_consent_policy_version);
    expect(screen.queryByRole('button', { name: 'Make this request public' })).toBeNull();
  });

  it.each(['hash', 'policy', 'version', 'text'] as const)('requires another preview when the persisted %s changes before consent', async change => {
    const request = makeOwnerRequest();
    mocks.getDataRequest.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    await preparePublicPreview(request);
    const changed = { ...request, ...(change === 'hash' ? { public_content_hash: 'c'.repeat(64) }
      : change === 'policy' ? { required_public_consent_policy_version: 'request-publication-v2' }
      : change === 'version' ? { publication_decision_version: 9 }
      : { description: 'A changed persisted request description.' }) };
    mocks.getDataRequest.mockResolvedValue(changed);
    fireEvent.click(screen.getByRole('button', { name: 'Make this request public' }));
    await screen.findByText('The request or publication version changed. Review a fresh public preview before confirming.');
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
  });

  it.each(['proposal', 'null guidance'])('coalesces repeated preview clicks and ignores a departed %s preview', async kind => {
    const request = makeOwnerRequest();
    const pending = deferred<ReturnType<typeof parsePublicationPreview>>();
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.previewDataRequestPublication.mockReturnValue(pending.promise);
    const view = render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    const review = await screen.findByRole('button', { name: 'Review public preview' });
    act(() => { review.click(); review.click(); });
    expect(mocks.previewDataRequestPublication).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => pending.resolve(kind === 'null guidance'
      ? parsePublicationPreview({ preview: null, acceptance_required: true, next_action: 'Retain your original text and ask support for independent review.' })
      : { public_content: currentPublicContent(request), public_content_hash: request.public_content_hash!, source_content_hash: request.public_content_hash! }));
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it.each(['uncertain', 'unavailable', 'changed source', 'changed budget'])('leaves the saved request alone for a %s preview', async kind => {
    const request = makeOwnerRequest();
    mocks.getDataRequest.mockResolvedValue(request);
    if (kind === 'uncertain') mocks.previewDataRequestPublication.mockResolvedValue(parsePublicationPreview({ preview: null, acceptance_required: true }));
    else if (kind === 'unavailable') mocks.previewDataRequestPublication.mockRejectedValue(new Error('private provider detail'));
    else mocks.previewDataRequestPublication.mockResolvedValue({ source_content_hash: kind === 'changed source' ? 'b'.repeat(64) : request.public_content_hash,
      public_content_hash: 'c'.repeat(64), public_content: { ...currentPublicContent(request), ...(kind === 'changed budget' ? { price_range_max: '9000.00' } : {}) } });
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review public preview' }));
    await screen.findByRole(kind === 'uncertain' ? 'status' : 'alert');
    expect(screen.queryByText('private provider detail')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make this request public' })).toBeNull();
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
    expect(mocks.withdrawDataRequestPublication).not.toHaveBeenCalled();
  });

  it.each([
    ['Keep your original text and ask support for independent review.', 'Keep your original text and ask support for independent review.'],
    ['<a href="/support">Ask support</a> and retain your original text.', '<a href="/support">Ask support</a> and retain your original text.'],
    ...[undefined, null, '', '  ', 42, {}, ['edit'], 'a'.repeat(2001), 'Bad\u0000guidance'].map(value =>
      [value, 'No public preview is available. Your saved request is unchanged.']),
  ])('shows safe null-preview guidance or a neutral fallback (%j)', async (next_action, expected) => {
    const request = makeOwnerRequest();
    const result = parsePublicationPreview({ preview: null, acceptance_required: true, next_action });
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.previewDataRequestPublication.mockResolvedValue(result);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    // A previous valid preview must not leave consent available after a null result.
    await preparePublicPreview(request);
    mocks.previewDataRequestPublication.mockResolvedValue(result);
    fireEvent.click(screen.getByRole('button', { name: 'Review public preview' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe(expected);
    expect(status.querySelector('a')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(request.description)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Make this request public' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use proposed text in editor' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull();
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
    expect(mocks.publishDataRequest).not.toHaveBeenCalled();
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
    expect(mocks.withdrawDataRequestPublication).not.toHaveBeenCalled();
  });

  it.each(['slug', 'auth'] as const)('ignores stale null guidance after a %s change', async change => {
    const old = makeOwnerRequest();
    const next = makeOwnerRequest({ id: 'request-2', title: 'Next owner request',
      slug: change === 'slug' ? 'next-request' : old.slug,
      buyer_id: change === 'auth' ? 'buyer-2' : owner.id, public_content_hash: 'c'.repeat(64) });
    const pending = deferred<ReturnType<typeof parsePublicationPreview>>();
    mocks.getDataRequest.mockResolvedValueOnce(old).mockResolvedValueOnce(next);
    mocks.previewDataRequestPublication.mockReturnValueOnce(pending.promise);
    const view = render(<DataRequestDetailClient slug={old.slug} initialRequest={old} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review public preview' }));
    if (change === 'auth') mocks.auth.user = { ...owner, id: 'buyer-2' };
    view.rerender(<DataRequestDetailClient slug={next.slug} initialRequest={next} />);
    await screen.findByRole('heading', { name: next.title });
    await preparePublicPreview(next);
    await act(async () => pending.resolve(parsePublicationPreview({ preview: null, acceptance_required: true,
      next_action: 'Stale owner guidance: keep your original text and ask support.' })));
    expect(screen.queryByText(/Stale owner guidance/)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Make this request public' })).not.toBeNull();
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
    expect(mocks.publishDataRequest).not.toHaveBeenCalled();
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
  });

  it('shows the authoritative reason and confirms the exact current request text', async () => {
    const request = makeOwnerRequest({
      currency: 'EUR',
      regulatory_requirements: ['GDPR'],
    });
    const updated = makeOwnerRequest({
      currency: 'EUR',
      regulatory_requirements: ['GDPR'],
      public_consent_status: 'consented',
      publication_decision: 'eligible',
      publication_reason: 'eligible',
      publication_decision_version: 2,
      publication_next_action: 'Published automatically.',
    });
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.confirmDataRequestPublication.mockResolvedValue(updated);

    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);

    expect(await screen.findByText('Public visibility: Private')).not.toBeNull();
    expect(screen.getByText('GDPR')).not.toBeNull();
    expect(screen.getByText('Currency: EUR')).not.toBeNull();
    expect(screen.getByText('Confirm the current public text for publication.')).not.toBeNull();
    expect(screen.getByText('Reason: public consent required')).not.toBeNull();
    await preparePublicPreview(request);
    fireEvent.click(screen.getByRole('button', { name: 'Make this request public' }));

    await waitFor(() => {
      expect(mocks.confirmDataRequestPublication).toHaveBeenCalledWith(
        request.id,
        'a'.repeat(64),
        'request-publication-v1'
      );
    });
    expect(await screen.findByText('Public visibility: Public')).not.toBeNull();
  });

  it('lets a contact-blocked owner correct every public text field, then explicitly confirms the returned hash', async () => {
    const request = makeOwnerRequest({
      title: 'Email buyer@example.com',
      description: 'Please email buyer@example.com for the dataset.',
      categories: ['buyer@example.com'],
      format_preferences: ['buyer@example.com'],
      regulatory_requirements: ['buyer@example.com'],
      provenance_requirements: 'Contact buyer@example.com',
      publication_reason: 'contact_or_personal_data_detected',
      publication_next_action: 'Remove contact details and confirm the public text.',
    });
    const corrected = makeOwnerRequest({
      title: 'Healthcare dataset request',
      description: 'Seeking an anonymized healthcare dataset for research.',
      categories: ['healthcare'],
      format_preferences: ['csv'],
      regulatory_requirements: ['GDPR'],
      provenance_requirements: 'Documented sources',
      public_content_hash: 'b'.repeat(64),
      publication_reason: 'public_content_changed',
      publication_next_action: 'Confirm the newly saved public text.',
    });
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.updateDataRequest.mockResolvedValue(corrected);
    mocks.confirmDataRequestPublication.mockResolvedValue({
      ...corrected,
      public_consent_status: 'consented',
      publication_decision: 'eligible',
      publication_reason: 'eligible',
    });

    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit request' }));
    expect(screen.queryByRole('button', { name: 'Make this request public' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: corrected.title } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: corrected.description } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Categories' }), { target: { value: 'healthcare' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Preferred Formats' }), { target: { value: 'csv' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Regulatory Requirements' }), { target: { value: 'GDPR' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Provenance Requirements' }), { target: { value: 'Documented sources' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mocks.updateDataRequest).toHaveBeenCalledWith(request.id, {
        title: 'Healthcare dataset request',
        description: 'Seeking an anonymized healthcare dataset for research.',
        categories: ['healthcare'],
        format_preferences: ['csv'],
        regulatory_requirements: ['GDPR'],
        provenance_requirements: 'Documented sources',
      });
    });
    expect(await screen.findByRole('heading', { name: corrected.title })).not.toBeNull();
    expect(screen.getByText('Confirm the newly saved public text.')).not.toBeNull();
    expect(screen.getByText('Reason: public content changed')).not.toBeNull();
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
    expect(mocks.publishDataRequest).not.toHaveBeenCalled();
    await preparePublicPreview(corrected);
    fireEvent.click(screen.getByRole('button', { name: 'Make this request public' }));
    await waitFor(() => {
      expect(mocks.confirmDataRequestPublication).toHaveBeenCalledWith(
        request.id, 'b'.repeat(64), 'request-publication-v1'
      );
    });
  });

  it('keeps the saved text and fresh consent hash when a pre-edit GET finishes after PATCH', async () => {
    const old = makeOwnerRequest({
      title: 'Old public request',
      public_consent_status: 'consented',
      publication_decision: 'eligible',
      publication_reason: 'eligible',
    });
    const saved = makeOwnerRequest({
      title: 'Corrected request',
      description: 'Corrected public description for this request.',
      public_content_hash: 'b'.repeat(64),
      publication_reason: 'public_content_changed',
      publication_next_action: 'Confirm the newly saved public text.',
    });
    let finishGet!: (value: DataRequestDetail) => void;
    let finishPatch!: (value: DataRequestDetail) => void;
    mocks.getDataRequest.mockReturnValue(new Promise<DataRequestDetail>((resolve) => { finishGet = resolve; }));
    mocks.updateDataRequest.mockReturnValue(new Promise<DataRequestDetail>((resolve) => { finishPatch = resolve; }));
    mocks.confirmDataRequestPublication.mockResolvedValue(saved);

    render(<DataRequestDetailClient slug={old.slug} initialRequest={old} />);
    await waitFor(() => expect(mocks.getDataRequest).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Edit request' }));
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make this request private' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: saved.title } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: saved.description } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('button', { name: 'Saving...' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make this request private' })).toBeNull();
    await act(async () => { finishPatch(saved); });
    expect(await screen.findByRole('heading', { name: saved.title })).not.toBeNull();
    await act(async () => { finishGet(old); });

    expect(screen.getByRole('heading', { name: saved.title })).not.toBeNull();
    expect(screen.getByText(saved.description)).not.toBeNull();
    expect(screen.getByText('Public visibility: Private')).not.toBeNull();
    expect(screen.getByText('Reason: public content changed')).not.toBeNull();
    expect(screen.queryByText('Public visibility: Public')).toBeNull();
    await preparePublicPreview(saved);
    fireEvent.click(screen.getByRole('button', { name: 'Make this request public' }));
    await waitFor(() => {
      expect(mocks.confirmDataRequestPublication).toHaveBeenCalledWith(
        old.id, 'b'.repeat(64), 'request-publication-v1'
      );
    });
  });

  for (const change of ['slug', 'auth'] as const) {
    for (const order of ['load first', 'mutation first'] as const) {
      it(`keeps the new ${change} context when an old Save finishes ${order}`, async () => {
        const old = makeOwnerRequest({ title: 'Old request', public_content_hash: 'a'.repeat(64) });
        const next = makeOwnerRequest({
          id: 'request-2',
          slug: change === 'slug' ? 'other-request' : old.slug,
          buyer_id: change === 'auth' ? 'buyer-2' : owner.id,
          title: 'New request',
          public_content_hash: 'c'.repeat(64),
        });
        const savedOld = { ...old, title: 'Stale saved request', public_content_hash: 'b'.repeat(64) };
        const patch = deferred<DataRequestDetail>();
        const nextGet = deferred<DataRequestDetail>();
        mocks.getDataRequest.mockResolvedValueOnce(old).mockReturnValueOnce(nextGet.promise);
        mocks.updateDataRequest.mockReturnValue(patch.promise);
        mocks.confirmDataRequestPublication.mockResolvedValue(next);
        const view = render(<DataRequestDetailClient slug={old.slug} initialRequest={old} />);
        await screen.findByRole('button', { name: 'Edit request' });
        fireEvent.click(screen.getByRole('button', { name: 'Edit request' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: savedOld.title } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(mocks.updateDataRequest).toHaveBeenCalledWith(old.id, expect.anything());

        if (change === 'auth') mocks.auth.user = { ...owner, id: 'buyer-2' };
        view.rerender(<DataRequestDetailClient slug={next.slug} initialRequest={next} />);
        expect(screen.queryByRole('heading', { name: old.title })).toBeNull();
        expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull();
        await waitFor(() => expect(mocks.getDataRequest).toHaveBeenCalledTimes(2));
        if (order === 'load first') {
          await act(async () => { nextGet.resolve(next); });
          await act(async () => { patch.resolve(savedOld); });
        } else {
          await act(async () => { patch.resolve(savedOld); });
          await act(async () => { nextGet.resolve(next); });
        }
        expect(screen.getByRole('heading', { name: next.title })).not.toBeNull();
        expect(screen.queryByRole('heading', { name: savedOld.title })).toBeNull();
        expect(mocks.toast).not.toHaveBeenCalled();
        await preparePublicPreview(next);
    fireEvent.click(screen.getByRole('button', { name: 'Make this request public' }));
        await waitFor(() => expect(mocks.confirmDataRequestPublication).toHaveBeenCalledWith(
          next.id, 'c'.repeat(64), 'request-publication-v1'
        ));
      });
    }
  }

  for (const action of ['Open request', 'Make this request public', 'Make this request private', 'Delete'] as const) {
    it(`ignores an old ${action} completion after navigating to another request`, async () => {
      const old = makeOwnerRequest({
        status: action === 'Open request' ? 'draft' : 'open',
        public_consent_status: action === 'Make this request private' ? 'consented' : 'required',
        publication_decision: action === 'Make this request private' ? 'eligible' : 'action_required',
      });
      const next = makeOwnerRequest({ id: 'request-2', slug: 'next-request', title: 'Next request', public_content_hash: 'c'.repeat(64) });
      const mutation = deferred<DataRequestDetail>();
      const nextGet = deferred<DataRequestDetail>();
      mocks.getDataRequest.mockResolvedValue(old);
      if (action === 'Open request') mocks.publishDataRequest.mockReturnValue(mutation.promise);
      if (action === 'Make this request public') mocks.confirmDataRequestPublication.mockReturnValue(mutation.promise);
      if (action === 'Make this request private') mocks.withdrawDataRequestPublication.mockReturnValue(mutation.promise);
      if (action === 'Delete') mocks.deleteDataRequest.mockReturnValue(mutation.promise);
      const view = render(<DataRequestDetailClient slug={old.slug} initialRequest={old} />);
      if (action === 'Make this request public') {
        await preparePublicPreview(old);
      }
      fireEvent.click(screen.getByRole('button', { name: action }));
      if (action === 'Make this request public') await waitFor(() => expect(mocks.confirmDataRequestPublication).toHaveBeenCalledTimes(1));
      mocks.getDataRequest.mockReturnValueOnce(nextGet.promise);
      view.rerender(<DataRequestDetailClient slug={next.slug} initialRequest={next} />);
      await waitFor(() => expect(mocks.getDataRequest).toHaveBeenCalledTimes(action === 'Make this request public' ? 3 : 2));
      await act(async () => { nextGet.resolve(next); });
      await act(async () => { mutation.resolve(old); });
      expect(screen.getByRole('heading', { name: next.title })).not.toBeNull();
      expect(mocks.toast).not.toHaveBeenCalled();
      expect(mocks.routerPush).not.toHaveBeenCalled();
    });
  }

  it('does not show an old Save error after an auth change', async () => {
    const old = makeOwnerRequest();
    const next = makeOwnerRequest({ id: 'request-2', buyer_id: 'buyer-2', title: 'New owner request' });
    const patch = deferred<DataRequestDetail>();
    mocks.getDataRequest.mockResolvedValueOnce(old).mockResolvedValueOnce(next);
    mocks.updateDataRequest.mockReturnValue(patch.promise);
    const view = render(<DataRequestDetailClient slug={old.slug} initialRequest={old} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit request' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    mocks.auth.user = { ...owner, id: 'buyer-2' };
    view.rerender(<DataRequestDetailClient slug={old.slug} initialRequest={next} />);
    await screen.findByRole('heading', { name: next.title });
    await act(async () => { patch.reject(new Error('old failure')); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('keeps a successful Save when a same-context reload starts during PATCH and finishes later', async () => {
    const old = makeOwnerRequest({ title: 'Before save' });
    const saved = makeOwnerRequest({
      title: 'After save',
      public_content_hash: 'b'.repeat(64),
      publication_reason: 'public_content_changed',
    });
    const patch = deferred<DataRequestDetail>();
    const reload = deferred<DataRequestDetail>();
    mocks.getDataRequest.mockResolvedValueOnce(old).mockReturnValueOnce(reload.promise);
    mocks.updateDataRequest.mockReturnValue(patch.promise);
    const view = render(<DataRequestDetailClient slug={old.slug} initialRequest={old} />);
    await screen.findByRole('button', { name: 'Edit request' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit request' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: saved.title } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    mocks.auth.user = { ...owner };
    view.rerender(<DataRequestDetailClient slug={old.slug} initialRequest={old} />);
    await waitFor(() => expect(mocks.getDataRequest).toHaveBeenCalledTimes(2));
    await act(async () => { patch.resolve(saved); });
    await act(async () => { reload.resolve(old); });
    expect(screen.getByRole('heading', { name: saved.title })).not.toBeNull();
    expect(screen.getByText('Reason: public content changed')).not.toBeNull();
    expect(mocks.toast).toHaveBeenCalledWith(
      'Request changes saved. Review the public visibility status before confirming.', 'success'
    );
  });



  const ownerActions = [
    ['save', mocks.updateDataRequest],
    ['open', mocks.publishDataRequest],
    ['delete', mocks.deleteDataRequest],
    ['confirm', mocks.confirmDataRequestPublication],
    ['withdraw', mocks.withdrawDataRequestPublication],
  ] as const;

  function lifetimeRequest(action: string) {
    return makeOwnerRequest({
      status: action === 'open' ? 'draft' : 'open',
      public_consent_status: action === 'withdraw' ? 'consented' : 'required',
    });
  }

  async function startOwnerAction(action: string) {
    if (action === 'confirm') {
      const request = await mocks.getDataRequest.mock.results.at(-1)!.value;
      await preparePublicPreview(request);
    }
    const labels: Record<string, string> = {
      open: 'Open request', delete: 'Delete', confirm: 'Make this request public',
      withdraw: 'Make this request private', save: 'Save changes',
    };
    if (action === 'save') fireEvent.click(screen.getByRole('button', { name: 'Edit request' }));
    fireEvent.click(screen.getByRole('button', { name: labels[action] }));
    if (action === 'confirm') await act(async () => {});
  }

  for (const [action, api] of ownerActions) {
    for (const outcome of ['success', 'error'] as const) {
      for (const timing of ['delayed', 'settled before departure commit'] as const) {
        it(`retires ${action} ${outcome} after unmount (${timing})`, async () => {
          const request = lifetimeRequest(action);
          const pending = deferred<DataRequestDetail>();
          mocks.getDataRequest.mockResolvedValue(request);
          api.mockReturnValue(pending.promise);
          const view = render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
          await act(async () => {});
          await startOwnerAction(action);
          expect(api).toHaveBeenCalledTimes(1);
          const settle = () => outcome === 'success' ? pending.resolve(request) : pending.reject(new Error('Retired failure'));
          if (timing === 'delayed') view.unmount();
          await act(async () => {
            settle();
            // Commit synchronously before the queued await continuation runs.
            if (timing !== 'delayed') view.unmount();
          });
          expect(mocks.toast).not.toHaveBeenCalled();
          expect(mocks.routerPush).not.toHaveBeenCalled();
          expect(mocks.getDataRequestResponses).toHaveBeenCalledTimes(1);
        });
      }

      it(`completes ordinary ${action} ${outcome} under StrictMode`, async () => {
        const request = lifetimeRequest(action);
        const pending = deferred<DataRequestDetail>();
        mocks.getDataRequest.mockResolvedValue(request);
        api.mockReturnValue(pending.promise);
        render(<StrictMode><DataRequestDetailClient slug={request.slug} initialRequest={request} /></StrictMode>);
        await act(async () => {});
        await startOwnerAction(action);
        await act(async () => {
          if (outcome === 'success') pending.resolve({ ...request, title: 'Saved current visit' });
          else pending.reject(new Error('Current failure'));
        });
        expect(api).toHaveBeenCalledTimes(1);
        if (action === 'save' && outcome === 'error') {
          expect(screen.getByRole('alert').textContent).toContain('Could not save request.');
          expect(screen.getByRole('textbox', { name: 'Title' })).toHaveProperty('value', request.title);
          expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty('disabled', false);
        } else if (action === 'confirm' && outcome === 'error') {
          expect(screen.getByRole('status').textContent).toContain('Public visibility could not be confirmed');
        } else {
          expect(mocks.toast).toHaveBeenCalledTimes(1);
          expect(mocks.toast.mock.calls[0][1]).toBe(outcome);
        }
        expect(mocks.routerPush.mock.calls).toEqual(action === 'delete' && outcome === 'success' ? [['/dashboard/requests']] : []);
      });
    }
  }

  it.each(['success', 'error'])('retires a supplier quote %s on departure without a follow-on GET', async (outcome) => {
    const post = deferred<typeof savedQuote>();
    mocks.submitDataRequestResponse.mockReturnValue(post.promise);
    await renderSupplier();
    fillQuote();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }));
    cleanup();
    await act(async () => {
      if (outcome === 'success') post.resolve(savedQuote);
      else post.reject(new Error('Lost result after departure'));
    });
    expect(mocks.getDataRequestResponses).toHaveBeenCalledTimes(1);
    expect(mocks.submitDataRequestResponse).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it.each(['slug', 'user'] as const)('an obsolete finally cannot release a later mutation after %s changes', async (change) => {
    const old = makeOwnerRequest();
    const next = makeOwnerRequest({ id: 'request-2', slug: change === 'slug' ? 'next-request' : old.slug,
      buyer_id: change === 'user' ? 'buyer-2' : owner.id });
    const first = deferred<DataRequestDetail>();
    const second = deferred<DataRequestDetail>();
    mocks.getDataRequest.mockResolvedValueOnce(old).mockResolvedValue(next);
    mocks.confirmDataRequestPublication.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<DataRequestDetailClient slug={old.slug} initialRequest={old} />);
    await act(async () => {});
    await startOwnerAction('confirm');
    mocks.getDataRequest.mockResolvedValue(next);
    if (change === 'user') mocks.auth.user = { ...owner, id: 'buyer-2' };
    view.rerender(<DataRequestDetailClient slug={next.slug} initialRequest={next} />);
    await screen.findByRole('button', { name: 'Review public preview' });
    await act(async () => {});
    await startOwnerAction('confirm');
    await act(async () => { first.reject(new Error('Retired failure')); });
    expect(screen.getByRole('button', { name: 'Updating...' })).toHaveProperty('disabled', true);
    expect(mocks.toast).not.toHaveBeenCalled();
    await act(async () => { second.resolve(next); });
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.confirmDataRequestPublication.mock.calls).toEqual([
      [old.id, old.public_content_hash, old.required_public_consent_policy_version],
      [next.id, next.public_content_hash, next.required_public_consent_policy_version],
    ]);
  });

  it.each(['success', 'error'])('preserves a pending Open %s through same-account token and user refresh', async (outcome) => {
    const request = makeDraft();
    const pending = deferred<DataRequestDetail>();
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.publishDataRequest.mockReturnValue(pending.promise);
    const view = render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    await act(async () => {});
    await startOwnerAction('open');
    mocks.auth.token = 'synthetic-refreshed-token';
    mocks.auth.user = { ...owner, first_name: 'Refreshed name' };
    view.rerender(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    await act(async () => {
      if (outcome === 'success') pending.resolve({ ...request, status: 'open' });
      else pending.reject(new Error('Current failure'));
    });
    expect(mocks.publishDataRequest.mock.calls).toEqual([[request.id]]);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast.mock.calls[0][1]).toBe(outcome);
  });

  it.each(['initial', 'retry'])('retires a pending %s read before a later visit to the same route', async (phase) => {
    const pending = deferred<DataRequestDetail>();
    if (phase === 'retry') mocks.getDataRequest.mockRejectedValueOnce(new Error('Offline'));
    mocks.getDataRequest.mockReturnValueOnce(pending.promise);
    const request = makeOwnerRequest({ title: 'New visit' });
    const view = render(<DataRequestDetailClient slug={request.slug} initialRequest={null} />);
    if (phase === 'retry') fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    view.unmount();
    mocks.getDataRequest.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={null} />);
    await screen.findByRole('heading', { name: request.title });
    await act(async () => { pending.resolve(makeDraft()); });
    expect(screen.getByRole('heading', { name: request.title })).not.toBeNull();
    expect(mocks.getDataRequestResponses.mock.calls).toEqual([[request.id]]);
  });

  it('does not let a retired StrictMode read overwrite the live setup read', async () => {
    const retired = deferred<DataRequestDetail>();
    const live = makeOwnerRequest({ title: 'Live setup' });
    mocks.getDataRequest.mockReturnValueOnce(retired.promise).mockResolvedValueOnce(live);
    render(<StrictMode><DataRequestDetailClient slug={live.slug} initialRequest={null} /></StrictMode>);
    await screen.findByRole('heading', { name: live.title });
    await act(async () => { retired.resolve(makeDraft()); });
    expect(screen.getByRole('heading', { name: live.title })).not.toBeNull();
    expect(mocks.getDataRequestResponses.mock.calls).toEqual([[live.id]]);
  });

  it('retires a quote reconciliation read when the supplier context changes', async () => {
    const saved = deferred<typeof savedQuote[]>();
    mocks.submitDataRequestResponse.mockRejectedValue(new Error('Lost result'));
    await renderSupplier();
    mocks.getDataRequestResponses.mockReturnValueOnce(saved.promise).mockResolvedValue([]);
    fillQuote();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }));
    await screen.findByRole('alert');
    mocks.auth.user = { ...owner, id: 'supplier-2', role: 'seller' };
    // A fresh root also covers departure followed by the same route being visited again.
    cleanup();
    const request = makeOwnerRequest();
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    await act(async () => {});
    await act(async () => { saved.resolve([savedQuote]); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Proposal' })).toHaveProperty('value', '');
    expect(mocks.submitDataRequestResponse).toHaveBeenCalledTimes(1);
  });

  it('hides Open and Delete while a draft edit is open', async () => {
    const draft = makeDraft();
    mocks.getDataRequest.mockResolvedValue(draft);
    render(<DataRequestDetailClient slug={draft.slug} initialRequest={draft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit request' }));
    expect(screen.queryByRole('button', { name: 'Open request' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await waitFor(() => expect(mocks.getDataRequestResponses).toHaveBeenCalledWith(draft.id));
  });

  it('cancels an owner edit without sending a mutation', async () => {
    const request = makeDraft();
    mocks.getDataRequest.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit request' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'A changed description that has not been saved.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
    expect(screen.getByText(request.description)).not.toBeNull();
  });

  it('keeps edited inputs and private status when save fails', async () => {
    const request = makeOwnerRequest({ publication_reason: 'contact_or_personal_data_detected' });
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.updateDataRequest.mockRejectedValue(new Error('network unavailable'));
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit request' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'A corrected description with no contact details.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not save request. Please try again.');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveProperty('value', 'A corrected description with no contact details.');
    expect(screen.getByText('Public visibility: Private')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Make this request public' })).toBeNull();
    expect(mocks.confirmDataRequestPublication).not.toHaveBeenCalled();
  });

  it('does not offer edit controls to a nonowner or for a noneditable status', async () => {
    const request = makeOwnerRequest();
    mocks.auth.user = { ...owner, id: 'other-buyer' };
    mocks.getDataRequest.mockResolvedValue(request);
    const view = render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    expect(screen.queryByRole('button', { name: 'Edit request' })).toBeNull();
    await act(async () => { await mocks.getDataRequest.mock.results[0].value; });
    expect(mocks.getDataRequestResponses).toHaveBeenCalledWith(request.id);
    view.unmount();

    mocks.auth.user = owner;
    const closed = makeOwnerRequest({ status: 'responses_received' });
    mocks.getDataRequest.mockResolvedValue(closed);
    render(<DataRequestDetailClient slug={closed.slug} initialRequest={closed} />);
    expect(screen.queryByRole('button', { name: 'Edit request' })).toBeNull();
    await act(async () => { await mocks.getDataRequest.mock.results[1].value; });
    await act(async () => { await mocks.getDataRequestResponses.mock.results[0].value; });
    expect(mocks.getDataRequestResponses).toHaveBeenCalledWith(closed.id);
    expect(mocks.updateDataRequest).not.toHaveBeenCalled();
  });

  it('does not claim the request is public when a later automatic check is still pending', async () => {
    const request = makeOwnerRequest();
    const updated = makeOwnerRequest({
      public_consent_status: 'consented',
      publication_decision: 'needs_review',
      publication_reason: 'automated_check_unavailable',
      publication_decision_version: 2,
      publication_next_action: 'No action is needed; the safety check will retry automatically.',
    });
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.confirmDataRequestPublication.mockResolvedValue(updated);

    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    await preparePublicPreview(request);
    fireEvent.click(await screen.findByRole('button', { name: 'Make this request public' }));

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        'Your publication choice was saved. The status below explains what happens next.',
        'success'
      );
    });
    expect(await screen.findByText('Automatic check pending')).not.toBeNull();
    expect(screen.queryByText('Public visibility: Public')).toBeNull();
  });

  it('withdraws public consent without deleting the request', async () => {
    const request = makeOwnerRequest({
      public_consent_status: 'consented',
      publication_decision: 'eligible',
      publication_reason: 'eligible',
      publication_next_action: 'Published automatically.',
    });
    const updated = makeOwnerRequest({
      status: 'responses_received',
      public_consent_status: 'withdrawn',
      publication_decision: 'ineligible',
      publication_reason: 'consent_withdrawn',
      publication_decision_version: 2,
      publication_next_action: 'Consent again if you want to republish this request.',
    });
    const republished = makeOwnerRequest({
      status: 'responses_received',
      public_consent_status: 'consented',
      publication_decision: 'eligible',
      publication_reason: 'eligible',
      publication_decision_version: 3,
      publication_next_action: 'Published automatically.',
    });
    mocks.getDataRequest.mockResolvedValue(request);
    mocks.withdrawDataRequestPublication.mockResolvedValue(updated);
    mocks.confirmDataRequestPublication.mockResolvedValue(republished);

    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Make this request private' }));

    await waitFor(() => {
      expect(mocks.withdrawDataRequestPublication).toHaveBeenCalledWith(request.id);
    });
    expect(mocks.deleteDataRequest).not.toHaveBeenCalled();
    expect(await screen.findByText('Consent again if you want to republish this request.')).not.toBeNull();
    await preparePublicPreview(updated);
    fireEvent.click(screen.getByRole('button', { name: 'Make this request public' }));
    await waitFor(() => {
      expect(mocks.confirmDataRequestPublication).toHaveBeenCalledWith(
        request.id,
        'a'.repeat(64),
        'request-publication-v1'
      );
    });
  });

  it('does not ask the buyer to act while an automatic safety retry is pending', async () => {
    const request = makeOwnerRequest({
      publication_decision: 'needs_review',
      publication_reason: 'automated_check_unavailable',
      publication_next_action: 'No action is needed; the safety check will retry automatically.',
    });
    mocks.getDataRequest.mockResolvedValue(request);

    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);

    expect(await screen.findByText('Automatic check pending')).not.toBeNull();
    expect(screen.getByText('No action is needed; the safety check will retry automatically.')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Make this request public' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make this request private' })).toBeNull();
  });

  it('does not describe a genuine safety exception as an automatic retry', async () => {
    const request = makeOwnerRequest({
      publication_decision: 'needs_review',
      publication_reason: 'safety_uncertain',
      publication_check_outcome: 'uncertain',
      publication_next_action: 'The safety check needs a bounded exception review.',
    });
    mocks.getDataRequest.mockResolvedValue(request);

    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);

    expect(await screen.findByText('The safety check needs a bounded exception review.')).not.toBeNull();
    expect(screen.getByText(/could not make a clear safety decision/)).not.toBeNull();
    expect(screen.queryByText('Automatic check pending')).toBeNull();
  });

  it('shows an unavailable check and a bounded recovery schedule to the owner', async () => {
    const request = makeOwnerRequest({
      publication_decision: 'needs_review',
      publication_reason: 'automated_check_unavailable',
      publication_check_outcome: 'unavailable',
      publication_checked_at: '2026-09-28T02:08:00Z',
      publication_retry_count: 6,
      publication_retry_stage: 'recovery_probe',
      publication_retry_at: '2026-09-28T03:08:00Z',
    });
    mocks.getDataRequest.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);

    expect(await screen.findByText(/The automated check was unavailable/)).not.toBeNull();
    expect(screen.getByText(/A recovery check is scheduled/)).not.toBeNull();
    expect(screen.getByText(/This schedule does not confirm a check ran/)).not.toBeNull();
    const checkTimes = Array.from(document.querySelectorAll('time'));
    expect(checkTimes.map((time) => time.getAttribute('datetime'))).toEqual([
      '2026-09-28T02:08:00.000Z',
      '2026-09-28T03:08:00.000Z',
    ]);
    for (const time of checkTimes) {
      expect(time.textContent?.trim()).toMatch(/^[A-Z][a-z]{2} \d{1,2}, 2026, \d{1,2}:\d{2} (?:AM|PM) \S+$/);
    }
    expect(screen.queryByText(/safe to publish/i)).toBeNull();
    expect(screen.getByText('Public visibility: Private')).not.toBeNull();
  });

  it.each([
    [{ publication_check_outcome: null, publication_checked_at: null, publication_retry_at: null, publication_retry_stage: 'none' }, 'Not checked yet.', 'No next check is scheduled.'],
    [{ publication_check_outcome: 'bogus', publication_checked_at: '2026-02-30T10:00:00Z', publication_retry_at: 'bad date', publication_retry_stage: 'fast_retry', publication_retry_count: 2 }, 'Unknown.', 'Next check time unknown.'],
    [{ publication_check_outcome: 'unavailable', publication_checked_at: '2026-09-28T02:08:00Z', publication_retry_at: '2026-09-28T03:08:00Z', publication_retry_stage: 'fast_retry', publication_retry_count: 5 }, 'A fast retry is scheduled.', 'A fast retry is scheduled.'],
    [{ publication_check_outcome: 'unavailable', publication_checked_at: null, publication_retry_at: '2026-09-28T03:08:00Z', publication_retry_stage: 'fast_retry', publication_retry_count: 6 }, 'Retry stage unknown.', 'Retry stage unknown.'],
  ] as const)('handles absent or malformed check state without inventing a completed check %#', async (fields, expected, retry) => {
    const request = makeOwnerRequest(fields as Partial<DataRequestDetail>);
    mocks.getDataRequest.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);
    expect(await screen.findAllByText((content) => content.includes(expected))).not.toHaveLength(0);
    expect(screen.getByText((content) => content.includes(retry))).not.toBeNull();
    expect(screen.queryByText('Invalid Date')).toBeNull();
  });

  it.each(['anonymous', 'another buyer'])('keeps check and retry details out of the %s view', async (viewer) => {
    const request = makeOwnerRequest({
      publication_check_outcome: 'unavailable',
      publication_checked_at: '2026-09-28T02:08:00Z',
      publication_retry_count: 6,
      publication_retry_stage: 'recovery_probe',
      publication_retry_at: '2026-09-28T03:08:00Z',
    });
    mocks.auth.user = viewer === 'anonymous' ? null : { ...owner, id: 'other-buyer' };
    mocks.auth.isAuthenticated = viewer !== 'anonymous';
    mocks.getDataRequest.mockResolvedValue(request);
    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);

    await waitFor(() => expect(mocks.getDataRequest).toHaveBeenCalled());
    expect(screen.queryByText(/Last check outcome:/)).toBeNull();
    expect(screen.queryByText(/Next check:/)).toBeNull();
    expect(screen.queryByText(/A recovery check is scheduled/)).toBeNull();
  });
});
