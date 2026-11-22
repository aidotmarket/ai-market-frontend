// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import fixture from '@/tests/fixtures/buyer-request-anonymization-chunk1.json';
import NewDataRequestPage from './page';
import type { User } from '@/types';

const mocks = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn(), createDataRequest: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/api/data-requests', () => ({ createDataRequest: mocks.createDataRequest }));
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, hydrated: true });
});
afterEach(cleanup);

it('renders the signed-out invitation with the existing sign-in redirect', () => {
  render(<NewDataRequestPage />);
  expect(screen.getByRole('heading', { name: 'Post a data request' })).toBeTruthy();
  expect(screen.getByText("Tell sellers what data you need. It's free, and sellers who have it come to you.")).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Sign in to post your request' }).getAttribute('href')).toBe('/login?redirect=%2Frequests%2Fnew');
  expect(screen.getByRole('link', { name: 'Create a free account' }).getAttribute('href')).toBe('/register');
  expect(mocks.push).toHaveBeenCalledWith('/login?redirect=%2Frequests%2Fnew');
  expect(mocks.createDataRequest).not.toHaveBeenCalled();
});

it('explains draft review and confirms a saved draft with the existing detail destination', async () => {
  useAuthStore.setState({ user: { id: 'buyer-1' } as User, isAuthenticated: true });
  mocks.createDataRequest.mockResolvedValue({ slug: 'retail-data' });
  render(<NewDataRequestPage />);
  expect(screen.getByRole('heading', { name: 'Post a data request' })).toBeTruthy();
  expect(screen.getByText('Describe the data you need. We save it as a draft so you can review it before it goes live.')).toBeTruthy();
  expect(screen.getByLabelText('Where the data must come from (optional)')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Licensed retail sales data' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Data Request' }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("Saved as a draft. Review it and publish when you're ready.", 'success'));
  expect(mocks.push).toHaveBeenCalledWith('/requests/retail-data');
});

it('continues the shared gated draft by ID while its serving slug is null', async () => {
  useAuthStore.setState({ user: { id: 'buyer-1' } as User, isAuthenticated: true });
  const id = '00000000-0000-4000-8000-000000000001';
  mocks.createDataRequest.mockResolvedValue({ id, ...fixture.draft });
  render(<NewDataRequestPage />);
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: fixture.create.description } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Data Request' }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/requests/${id}`));
});
