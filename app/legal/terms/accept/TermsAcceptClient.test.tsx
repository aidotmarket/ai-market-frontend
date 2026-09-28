// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TermsAcceptClient from './TermsAcceptClient';

const capabilities = vi.hoisted(() => ({ getCapabilities: vi.fn() }));
const legal = vi.hoisted(() => ({ getCurrentTerms: vi.fn(), acceptTerms: vi.fn() }));
const navigation = vi.hoisted(() => ({ push: vi.fn(), search: 'context=seller&redirect=%2Fdashboard%2Flistings' }));

vi.mock('@/api/capabilities', () => capabilities);
vi.mock('@/api/legal', () => legal);
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock('@/store/auth', () => {
  const user = {
    id: 'user-1', first_name: 'Ada', last_name: 'Seller', company_name: null,
  };
  const state = { user, isAuthenticated: true, isLoading: false, hydrated: true };
  return { useAuthStore: (select?: (value: typeof state) => unknown) => select ? select(state) : state };
});

beforeEach(() => {
  navigation.search = 'context=seller&redirect=%2Fdashboard%2Flistings';
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.1' });
  legal.acceptTerms.mockResolvedValue({ terms_version: '1.1' });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

async function submit() {
  await screen.findByLabelText(/Country/);
  for (const id of ['ack-box-1', 'ack-box-2', 'ack-box-3']) fireEvent.click(document.getElementById(id)!);
  fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Director' } });
  fireEvent.change(screen.getByLabelText(/Business legal name/), { target: { value: 'Seller Ltd' } });
  fireEvent.change(screen.getByLabelText(/Country/), { target: { value: 'US' } });
  fireEvent.click(screen.getByLabelText('I am authorized to bind this business'));
  fireEvent.click(screen.getByRole('button', { name: 'Accept and sign' }));
}

it('submits buyer context on a direct seller URL for a non-seller', async () => {
  capabilities.getCapabilities.mockResolvedValue({ seller: { effective_status: 'not_requested' } });
  render(<TermsAcceptClient />);
  await submit();
  await waitFor(() => expect(legal.acceptTerms).toHaveBeenCalledWith(expect.objectContaining({ context: 'buyer' })));
});

it.each(['provisioning', 'active'])('submits seller context for a %s seller-capable user', async (status) => {
  capabilities.getCapabilities.mockResolvedValue({ seller: { effective_status: status } });
  render(<TermsAcceptClient />);
  await submit();
  await waitFor(() => expect(legal.acceptTerms).toHaveBeenCalledWith(expect.objectContaining({ context: 'seller' })));
});

it('waits for seller capabilities before showing the form', async () => {
  let resolveCapabilities!: (value: { seller: { effective_status: string } }) => void;
  capabilities.getCapabilities.mockReturnValue(new Promise((resolve) => { resolveCapabilities = resolve; }));
  render(<TermsAcceptClient />);
  expect(screen.getByRole('status').textContent).toContain('Loading seller capability');
  expect(screen.queryByRole('button', { name: 'Accept and sign' })).toBeNull();
  resolveCapabilities({ seller: { effective_status: 'active' } });
  expect(await screen.findByRole('button', { name: 'Accept and sign' })).toBeTruthy();
});

it('shows a retry error without the form when seller capability lookup fails', async () => {
  capabilities.getCapabilities.mockRejectedValue(new Error('Temporary failure'));
  render(<TermsAcceptClient />);
  expect((await screen.findByRole('alert')).textContent).toContain("We couldn't confirm your seller account. Try again.");
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Accept and sign' })).toBeNull();
  expect(legal.acceptTerms).not.toHaveBeenCalled();
});

it('retries a failed seller lookup and submits seller context after success', async () => {
  capabilities.getCapabilities
    .mockRejectedValueOnce(new Error('Temporary failure'))
    .mockResolvedValueOnce({ seller: { effective_status: 'active' } });
  render(<TermsAcceptClient />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(capabilities.getCapabilities).toHaveBeenCalledTimes(2));
  await submit();
  await waitFor(() => expect(legal.acceptTerms).toHaveBeenCalledWith(expect.objectContaining({ context: 'seller' })));
});

it('submits buyer context without a seller capability lookup on a direct visit', async () => {
  navigation.search = '';
  render(<TermsAcceptClient />);
  await submit();
  expect(capabilities.getCapabilities).not.toHaveBeenCalled();
  await waitFor(() => expect(legal.acceptTerms).toHaveBeenCalledWith(expect.objectContaining({ context: 'buyer' })));
});
