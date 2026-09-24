// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayDelivery } from '@/types/gatewayDelivery';
import { BLOCKED_MESSAGES } from './GatewayDeliverySection';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/api/client', () => ({ api }));
const { default: Section } = await import('./GatewayDeliverySection');

const file = {
  file_id: 'ab12', display_name: 'file-ab12.csv', size_bytes: 16, sha256: 'a'.repeat(64),
  state: 'not_started' as const, transmitted_bytes: 0,
  permission: null,
  reissue: { allowed: true, remaining_24h: 5, blocked_code: null },
};
const delivery: GatewayDelivery = {
  door_url: 'https://door.example',
  hold: { state: 'held_until', until: '2026-09-25T12:00:00Z', disputable: true },
  problem: null,
  files: [file],
};
const success = (value: GatewayDelivery = delivery, retry = '60') => ({ data: value, headers: { 'retry-after': retry } });
const failure = (code: string, status = 404, retryAfter?: string) => ({ response: { status, headers: retryAfter ? { 'retry-after': retryAfter } : {}, data: { error: { code, message: code, details: {} } } } });

beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue(success()); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('buyer gateway delivery', () => {
  it.each([['gateway_disabled', 404], ['not_a_gateway_order', 404], ['order_not_found', 404], ['unauthorized', 401], ['forbidden', 403]] as const)('hides and stops polling on %s', async (code, status) => {
    vi.useFakeTimers();
    api.get.mockResolvedValueOnce(success({ ...delivery, files: [{ ...file, state: 'in_progress' }] }, '5')).mockRejectedValueOnce(failure(code, status));
    const { container } = render(<Section orderId="order-1" />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('region', { name: 'Gateway delivery' })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(container.innerHTML).toBe('');
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['502 fallback', 502, undefined, 5000], ['409 fallback', 409, undefined, 5000],
    ['429 fallback', 429, undefined, 5000], ['network fallback', undefined, undefined, 5000],
    ['error Retry-After', 502, '9', 9000],
  ] as const)('keeps the last section and retries after %s', async (_, status, retryAfter, delay) => {
    vi.useFakeTimers();
    const progress = { ...delivery, files: [{ ...file, state: 'in_progress' as const }] };
    api.get.mockResolvedValueOnce(success(progress, '5')).mockRejectedValueOnce(status ? failure('gateway_unavailable', status, retryAfter) : new Error('network')).mockResolvedValue(success(progress, '5'));
    render(<Section orderId="order-1" />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('region', { name: 'Gateway delivery' })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region', { name: 'Gateway delivery' })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(delay - 1); });
    expect(api.get).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it.each(Object.entries(BLOCKED_MESSAGES))('shows %s blocker message', async (code, message) => {
    api.get.mockResolvedValue(success({ ...delivery, files: [{ ...file, reissue: { allowed: false, remaining_24h: 0, blocked_code: code as keyof typeof BLOCKED_MESSAGES } }] }));
    render(<Section orderId="order-1" />);
    expect(await screen.findByText(message)).not.toBeNull();
    if (code === 'coverage_exhausted') {
      expect(screen.queryByText('Restart download')).toBeNull();
      expect(screen.getAllByText('Report a problem').length).toBeGreaterThan(0);
    }
  });

  it('shows delivered state without a download action or a path or buyer id', async () => {
    api.get.mockResolvedValue(success({ ...delivery, files: [{ ...file, state: 'delivered', transmitted_bytes: 16, reissue: { allowed: false, remaining_24h: 5, blocked_code: 'complete' } }] }));
    const { container } = render(<Section orderId="order-1" />);
    expect(await screen.findByText('All files delivered.')).not.toBeNull();
    expect(screen.queryByText('Download file')).toBeNull();
    expect(container.textContent).not.toContain('/private/source');
    expect(container.textContent).not.toContain('buyer-123');
  });

  it('sends restart explicitly and offers resume when restart is refused', async () => {
    const resumed = { token: 't', browser_url: 'https://door.example/v1/files/ab12?t=t', download_url: 'https://door.example/v1/files/ab12', jti: 'j', start_deadline: '', transfer_deadline: '', resume_offset: 8 };
    let current = null as typeof resumed | null;
    api.get.mockImplementation(() => Promise.resolve(success({ ...delivery, files: [{ ...file, permission: current }] })));
    api.post.mockRejectedValueOnce(failure('restart_unavailable')).mockImplementationOnce(() => { current = resumed; return Promise.resolve({ data: resumed }); });
    render(<Section orderId="order-1" />);
    fireEvent.click(await screen.findByText('Restart download'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/order-1/gateway-delivery/files/ab12/permissions', { mode: 'restart' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Restart download')).toBeNull();
    expect(screen.getByText(/Choose Resume download for a new download link/)).toBeTruthy();
    expect(screen.getAllByText('Report a problem').length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByText('Resume download'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/order-1/gateway-delivery/files/ab12/permissions', { mode: 'resume' }));
    expect(await screen.findByText('Download file')).toBeTruthy();
    expect(screen.getByText('Copy resume command')).toBeTruthy();
  });

  it('removes C0 characters before quoting the copied command', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    api.get.mockResolvedValue(success({ ...delivery, files: [{ ...file, display_name: "bad\r\n\x00'name.csv", permission: { token: 'safe', browser_url: 'https://door.example/?t=safe', download_url: 'https://door.example/\nfile', jti: 'j', start_deadline: '', transfer_deadline: '', resume_offset: 0 } }] }));
    render(<Section orderId="order-1" />);
    fireEvent.click(await screen.findByText('Copy resume command'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toBe("curl -C - -H 'Authorization: Bearer safe' -o 'bad'\\''name.csv' 'https://door.example/file'");
  });

  it('handles an unavailable clipboard and a worker construction failure', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    vi.stubGlobal('Worker', class { constructor() { throw new Error('blocked'); } });
    api.get.mockResolvedValue(success({ ...delivery, files: [{ ...file, permission: { token: 't', browser_url: 'https://door.example/?t=t', download_url: 'https://door.example/file', jti: 'j', start_deadline: '', transfer_deadline: '', resume_offset: 0 } }] }));
    render(<Section orderId="order-1" />);
    fireEvent.click(await screen.findByText('Copy resume command'));
    expect(screen.getByRole('alert').textContent).toBe('Could not copy command.');
    fireEvent.change(screen.getByLabelText('Verify file'), { target: { files: [new File(['x'], 'x.bin')] } });
    expect(screen.getByRole('status').textContent).toBe('Could not check this file.');
  });

  it('hides per-file report when the hold is not disputable', async () => {
    api.get.mockResolvedValue(success({ ...delivery, hold: { ...delivery.hold, disputable: false }, files: [{ ...file, reissue: { allowed: false, remaining_24h: 0, blocked_code: 'coverage_exhausted' } }] }));
    render(<Section orderId="order-1" />);
    expect(await screen.findByText(BLOCKED_MESSAGES.coverage_exhausted)).toBeTruthy();
    expect(screen.queryByText('Report a problem')).toBeNull();
  });

  it('reports several files in one problem and accepts the existing open problem', async () => {
    api.get.mockResolvedValue(success({ ...delivery, files: [file, { ...file, file_id: 'cd34', display_name: 'file-cd34.csv' }], problem: { problem_id: 'p', category: 'missing_data', file_ids: ['ab12'], opened_at: '', opened_by: 'customer', state: 'open', resolution: null, support_case_id: 'case' } }));
    api.post.mockResolvedValue({ data: { problem_id: 'p', file_ids: ['ab12', 'cd34'] } });
    render(<Section orderId="order-1" />);
    fireEvent.click(await screen.findByText('Report a problem'));
    fireEvent.click(screen.getByLabelText('file-ab12.csv'));
    fireEvent.click(screen.getByLabelText('file-cd34.csv'));
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Two files fail' } });
    fireEvent.click(screen.getByText('Send report'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/order-1/gateway-delivery/problems', { category: 'missing_data', file_ids: ['ab12', 'cd34'], note: 'Two files fail' }));
  });

  it('polls using Retry-After and stops on unmount', async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue(success({ ...delivery, files: [{ ...file, state: 'in_progress' }] }, '7'));
    const view = render(<Section orderId="order-1" />);
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(6999);
    expect(api.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.get).toHaveBeenCalledTimes(2);
    view.unmount();
    await vi.advanceTimersByTimeAsync(7000);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
