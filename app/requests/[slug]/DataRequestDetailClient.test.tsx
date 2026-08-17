// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  publishDataRequest: vi.fn(),
  deleteDataRequest: vi.fn(),
  submitDataRequestResponse: vi.fn(),
  getDataRequestResponses: vi.fn(),
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
  publishDataRequest: mocks.publishDataRequest,
  deleteDataRequest: mocks.deleteDataRequest,
  submitDataRequestResponse: mocks.submitDataRequestResponse,
  getDataRequestResponses: mocks.getDataRequestResponses,
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

  it('renders an owner draft and its Publish button after the authenticated fetch succeeds', async () => {
    const draft = makeDraft();
    mocks.getDataRequest.mockResolvedValue(draft);

    render(<DataRequestDetailClient slug={draft.slug} initialRequest={null} />);

    expect(await screen.findByRole('heading', { name: draft.title })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Publish' })).not.toBeNull();
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
});
