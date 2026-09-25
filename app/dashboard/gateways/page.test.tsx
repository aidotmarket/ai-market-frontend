// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import GatewaysPage from './page';
import { gateway } from './fixtures';

const mocks = vi.hoisted(() => ({ capabilities: vi.fn(), list: vi.fn(), pair: vi.fn() }));
vi.mock('@/api/capabilities', () => ({ getCapabilities: mocks.capabilities }));
vi.mock('@/api/sellerGateways', () => ({ listSellerGateways: mocks.list, createPairingCode: mocks.pair }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.capabilities.mockResolvedValue({ seller: { effective_status: 'active' } });
  mocks.list.mockResolvedValue([gateway]);
  useAuthStore.setState({ hydrated: true, isAuthenticated: true, isLoading: false });
});
afterEach(cleanup);

it('lists gateway status, versions and counts', async () => {
  render(<GatewaysPage />);
  await screen.findByRole('link', { name: 'Test gateway' });
  expect(screen.getByText('1.0.0 / 1.0.0')).toBeTruthy();
  expect(screen.getByText('1', { selector: 'dd' })).toBeTruthy();
});
it('shows the pairing response and handles the rate limit', async () => {
  mocks.pair.mockResolvedValueOnce({ code: 'ABCD-EFGH-JKLM', expires_at: '2026-01-01T00:15:00Z', image: `ghcr.io/aidotmarket/aim-gateway@sha256:${'a'.repeat(64)}`, version: '1.0.0', minimum_version: '1.0.0', compose_snippet: 'services:\n  gateway:', install_guide_url: 'https://example.test/install' });
  mocks.pair.mockRejectedValueOnce({ response: { data: { error: { code: 'pairing_rate_limited' } } } });
  render(<GatewaysPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add a gateway' }));
  expect(await screen.findByText('ABCD-EFGH-JKLM')).toBeTruthy();
  expect(screen.getByText(/ghcr.io\/aidotmarket\/aim-gateway@sha256/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Read the install guide' }).getAttribute('href')).toBe('https://example.test/install');
  fireEvent.click(screen.getByRole('button', { name: 'Add a gateway' }));
  expect(await screen.findByText(/Too many pairing codes/)).toBeTruthy();
});
it('handles unavailable and rejected clipboard writes', async () => {
  mocks.pair.mockResolvedValue({ code: 'ABCD-EFGH-JKLM', expires_at: '2026-01-01T00:15:00Z', image: 'image', version: '1.0.0', minimum_version: '1.0.0', compose_snippet: 'services:', install_guide_url: 'https://example.test/install' });
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  try {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    render(<GatewaysPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add a gateway' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy compose snippet' }));
    expect(screen.getByRole('button', { name: 'Copy compose snippet' })).toBeTruthy();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy compose snippet' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy compose snippet' })).toBeTruthy());
  } finally {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});
it('hides gateway content on flag and other errors', async () => {
  mocks.list.mockRejectedValue({ response: { data: { error: { code: 'gateway_disabled' } } } });
  const view = render(<GatewaysPage />);
  await screen.findByText('Gateways are not available.');
  expect(screen.queryByText('Add a gateway')).toBeNull();
  view.unmount();
  mocks.list.mockRejectedValue(new Error('network'));
  render(<GatewaysPage />);
  await waitFor(() => expect(screen.getByText('Gateways are not available.')).toBeTruthy());
});
