// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Content from '../app/checkout/success/CheckoutSuccessContent';
import Cancel from '../app/checkout/cancel/page';
import type { CheckoutVerifyResponse } from '../types';

const fake = vi.hoisted(() => ({ session: 'session-a' as string | null, verify: vi.fn() }));
vi.mock('@/api/checkout', () => ({ verifyCheckout: fake.verify }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(fake.session ? { session_id: fake.session } : {}) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
// Keep this suite isolated from app bootstrap and financial/network code.
vi.mock('@/lib/format', () => ({ formatPrice: (amount: number) => `$${amount.toFixed(2)}` }));

function deferred() {
  let resolve!: (value: CheckoutVerifyResponse) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<CheckoutVerifyResponse>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function visibility(value: 'hidden' | 'visible') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(value);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
}
async function load(data: CheckoutVerifyResponse) {
  fake.verify.mockResolvedValue(data);
  const view = render(<Content />);
  await flush();
  return view;
}
function orderHref() { return screen.getByRole('link', { name: 'View Order' }).getAttribute('href'); }
function navigation() {
  expect(screen.getByRole('link', { name: 'Check My Purchases' }).getAttribute('href')).toBe('/dashboard/orders');
  expect(screen.getByRole('link', { name: /support|help/i }).getAttribute('href')).toBe('mailto:support@ai.market');
}
beforeEach(() => {
  vi.useFakeTimers(); fake.verify.mockReset(); fake.session = 'session-a';
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('control: current completion preserves optional result fields and transaction order link', async () => {
  await load({ status: 'completed', order_id: 'order-abcdefgh', transaction_id: 'tx-a', tx_number: 'TX-123', listing_title: 'Dataset A', amount: 42 });
  expect(screen.getByRole('heading', { name: 'Payment Successful' })).toBeTruthy();
  for (const text of ['Dataset A', '$42.00', 'TX-123', 'Order #order-ab']) expect(screen.getByText(text)).toBeTruthy();
  expect(orderHref()).toBe('/dashboard/orders/order-abcdefgh?tx=tx-a');
  expect(screen.getByRole('link', { name: 'Browse More Datasets' }).getAttribute('href')).toBe('/listings');
});
it('control: completed without optional fields still succeeds', async () => {
  await load({ status: 'completed' });
  expect(screen.getByRole('heading', { name: 'Payment Successful' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'View Order' })).toBeNull();
});
it('pending deadline is truthful at 30 seconds and offers purchases/support', async () => {
  await load({ status: 'pending' }); await advance(29999);
  expect(screen.getByRole('heading', { name: 'Verifying your payment…' })).toBeTruthy();
  await advance(1);
  expect(screen.getByRole('heading', { name: 'Payment status not yet confirmed' })).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/payment was received|no charges|email you/i);
  navigation(); expect(fake.verify).toHaveBeenCalledTimes(15);
});
it('expired response is an explicit terminal outcome', async () => {
  await load({ status: 'expired' });
  expect(screen.getByRole('heading', { name: /expired/i })).toBeTruthy(); navigation();
  expect(document.body.textContent).not.toMatch(/payment was received|no charges|buy again/i);
  await advance(4001); expect(fake.verify).toHaveBeenCalledTimes(1);
});
it.each(['completed', 'expired', 'timeout', 'error'] as const)('%s stays terminal on immediate and post-31s visibility events', async outcome => {
  if (outcome === 'error') {
    fake.verify.mockRejectedValue(new Error('synthetic read failure')); render(<Content />); await flush();
  } else {
    await load({ status: outcome === 'timeout' ? 'pending' : outcome });
    if (outcome === 'timeout') await advance(30000);
  }
  const heading = screen.getByRole('heading').textContent;
  const calls = fake.verify.mock.calls.length;
  await visibility('hidden'); await visibility('visible');
  await advance(31001); await visibility('hidden'); await visibility('visible');
  expect(screen.getByRole('heading').textContent).toBe(heading);
  expect(fake.verify).toHaveBeenCalledTimes(calls); expect(vi.getTimerCount()).toBe(0);
});
it('new query immediately retires the previous successful order and has a fresh deadline', async () => {
  const view = await load({ status: 'completed', order_id: 'order-a' }); await advance(29000);
  const b = deferred(); fake.verify.mockReturnValue(b.promise);
  fake.session = 'session-b'; view.rerender(<Content />);
  expect(screen.getByRole('heading', { name: 'Verifying your payment…' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'View Order' })).toBeNull();
  expect(fake.verify.mock.lastCall?.[0]).toBe('session-b'); await advance(2000);
  expect(screen.getByRole('heading', { name: 'Verifying your payment…' })).toBeTruthy();
  await act(async () => { b.resolve({ status: 'completed', order_id: 'order-b' }); });
  expect(orderHref()).toBe('/dashboard/orders/order-b');
});
it('A to B to A creates a fresh visit and ignores late success and rejection from retired reads', async () => {
  const a = deferred(), b = deferred(), nextA = deferred();
  fake.verify.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(nextA.promise);
  const view = render(<Content />); const firstSignal = fake.verify.mock.calls[0][1] as AbortSignal;
  fake.session = 'session-b'; view.rerender(<Content />); const bSignal = fake.verify.mock.calls[1][1] as AbortSignal;
  fake.session = 'session-a'; view.rerender(<Content />);
  expect(firstSignal.aborted).toBe(true); expect(bSignal.aborted).toBe(true);
  await act(async () => { a.resolve({ status: 'completed', order_id: 'stale-a' }); b.reject(new Error('stale-b')); });
  expect(screen.getByRole('heading', { name: 'Verifying your payment…' })).toBeTruthy();
  await act(async () => { nextA.resolve({ status: 'completed', order_id: 'fresh-a' }); });
  expect(orderHref()).toBe('/dashboard/orders/fresh-a');
});
it('query retirement clears scheduled polls', async () => {
  const view = await load({ status: 'pending' }); const b = deferred(); fake.verify.mockReturnValue(b.promise);
  fake.session = 'session-b'; view.rerender(<Content />); await advance(2000);
  expect(fake.verify.mock.calls.map(call => call[0])).toEqual(['session-a', 'session-b']);
});
it('StrictMode retires its first setup callbacks and unmount cleans reads, timers and listeners', async () => {
  const old = deferred(), current = deferred();
  fake.verify.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const view = render(<StrictMode><Content /></StrictMode>); expect(fake.verify).toHaveBeenCalledTimes(2);
  expect((fake.verify.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  await act(async () => { old.resolve({ status: 'completed', order_id: 'stale' }); });
  expect(screen.queryByRole('link', { name: 'View Order' })).toBeNull(); view.unmount();
  expect((fake.verify.mock.calls[1][1] as AbortSignal).aborted).toBe(true);
  await act(async () => { current.resolve({ status: 'pending' }); });
  await visibility('visible'); await advance(31001);
  expect(fake.verify).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
it('pending polls at two seconds, pauses hidden, and resumes without overlapping reads', async () => {
  await load({ status: 'pending' }); await advance(1999); expect(fake.verify).toHaveBeenCalledTimes(1);
  await advance(1); expect(fake.verify).toHaveBeenCalledTimes(2);
  await visibility('hidden'); await advance(4000); expect(fake.verify).toHaveBeenCalledTimes(2);
  const read = deferred(); fake.verify.mockReturnValue(read.promise);
  await visibility('visible'); await visibility('visible'); expect(fake.verify).toHaveBeenCalledTimes(3);
  await visibility('hidden'); await act(async () => { read.resolve({ status: 'pending' }); });
  await advance(2000); expect(fake.verify).toHaveBeenCalledTimes(3);
  await visibility('visible'); expect(fake.verify).toHaveBeenCalledTimes(4); await advance(22000);
  expect(screen.getByRole('heading', { name: 'Payment status not yet confirmed' })).toBeTruthy();
});
it('a hidden or unresolved read cannot extend the budget or supply late success', async () => {
  const read = deferred(); fake.verify.mockReturnValue(read.promise);
  render(<Content />); await visibility('hidden'); await advance(30000);
  expect(screen.getByRole('heading', { name: 'Payment status not yet confirmed' })).toBeTruthy();
  expect((fake.verify.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  await act(async () => { read.resolve({ status: 'completed', order_id: 'late' }); });
  await visibility('visible'); expect(fake.verify).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('link', { name: 'View Order' })).toBeNull();
});
it('missing session stays bounded with navigation and no verification', async () => {
  fake.session = null; render(<Content />); await flush(); navigation();
  expect(screen.getByText('No session ID provided.')).toBeTruthy();
  await advance(31001); await visibility('visible'); expect(fake.verify).not.toHaveBeenCalled();
});
it('cancel uses neutral copy, preserves navigation, and never verifies', () => {
  render(<Cancel />); navigation();
  expect(screen.getByRole('heading', { name: 'Returned from checkout' })).toBeTruthy();
  expect(document.body.textContent).toContain('Returning here does not confirm whether payment was made.');
  expect(document.body.textContent).not.toContain('No charges were made to your account.');
  expect(screen.getByRole('link', { name: 'Browse Datasets' }).getAttribute('href')).toBe('/listings');
  expect(fake.verify).not.toHaveBeenCalled();
});
