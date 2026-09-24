// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const failure = (code: string) => ({ response: { status: 404, data: { error: { code, message: code, details: {} } } } });

beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue(success()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('buyer gateway delivery', () => {
  it.each(['gateway_disabled', 'not_a_gateway_order', 'order_not_found', 'unknown'])('hides the entire section on %s', async (code) => {
    api.get.mockRejectedValue(failure(code));
    const { container } = render(<Section orderId="order-1" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
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
    api.post.mockRejectedValueOnce(failure('restart_unavailable')).mockResolvedValueOnce({ data: { token: 't', browser_url: 'https://door.example/v1/files/ab12?t=t', download_url: 'https://door.example/v1/files/ab12', jti: 'j', start_deadline: '', transfer_deadline: '', resume_offset: 8 } });
    render(<Section orderId="order-1" />);
    fireEvent.click(await screen.findByText('Restart download'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/order-1/gateway-delivery/files/ab12/permissions', { mode: 'restart' }));
    fireEvent.click(await screen.findByText('Resume download'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/order-1/gateway-delivery/files/ab12/permissions', { mode: 'resume' }));
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
