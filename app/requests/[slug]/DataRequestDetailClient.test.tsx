// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import type { DataRequestDetail, User } from '@/types';
import DataRequestDetailClient from './DataRequestDetailClient';

const mocks = vi.hoisted(() => ({
  auth: {
    user: null as User | null,
    isAuthenticated: false,
  },
  routerPush: vi.fn(),
  toast: vi.fn(),
  getDataRequest: vi.fn(),
  updateDataRequest: vi.fn(),
  publishDataRequest: vi.fn(),
  deleteDataRequest: vi.fn(),
  submitDataRequestResponse: vi.fn(),
  getDataRequestResponses: vi.fn(),
  confirmDataRequestPublication: vi.fn(),
  withdrawDataRequestPublication: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => mocks.auth,
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

vi.mock('@/api/data-requests', () => ({
  getDataRequest: mocks.getDataRequest,
  updateDataRequest: mocks.updateDataRequest,
  publishDataRequest: mocks.publishDataRequest,
  deleteDataRequest: mocks.deleteDataRequest,
  submitDataRequestResponse: mocks.submitDataRequestResponse,
  getDataRequestResponses: mocks.getDataRequestResponses,
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

describe('DataRequestDetailClient authenticated fallback loading', () => {
  beforeEach(() => {
    mocks.auth.user = owner;
    mocks.auth.isAuthenticated = true;
    mocks.getDataRequestResponses.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
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

  it('renders an explicit not-found state with a requests link when the authenticated fetch fails', async () => {
    mocks.getDataRequest.mockRejectedValue(new Error('not found'));

    render(<DataRequestDetailClient slug="missing-request" initialRequest={null} />);

    expect(await screen.findByRole('heading', { name: 'Request not found' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Browse Requests' }).getAttribute('href')).toBe('/requests');
    await waitFor(() => {
      expect(mocks.getDataRequest).toHaveBeenCalledWith('missing-request');
    });
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
    fireEvent.click(screen.getByRole('button', { name: 'Make this request public' }));
    await waitFor(() => {
      expect(mocks.confirmDataRequestPublication).toHaveBeenCalledWith(
        old.id, 'b'.repeat(64), 'request-publication-v1'
      );
    });
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
    expect(mocks.getDataRequestResponses).not.toHaveBeenCalled();
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
      publication_next_action: 'The safety check needs a bounded exception review.',
    });
    mocks.getDataRequest.mockResolvedValue(request);

    render(<DataRequestDetailClient slug={request.slug} initialRequest={request} />);

    expect(await screen.findByText('The safety check needs a bounded exception review.')).not.toBeNull();
    expect(screen.queryByText('Automatic check pending')).toBeNull();
  });
});
