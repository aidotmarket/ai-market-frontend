// @vitest-environment jsdom
// Hosted CI only: all terms transports and the form are synthetic.
import React, { StrictMode, useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTermsGate } from './TermsGate';
import type { User } from '@/types';

const mocks = vi.hoisted(() => ({
  user: { id: 'buyer-a' } as User | null,
  terms: vi.fn(), toast: vi.fn(), action: vi.fn(),
  callbacks: [] as (() => Promise<void>)[],
}));
vi.mock('@/store/auth', () => ({ useAuthStore: (select: (state: { user: User | null }) => unknown) => select({ user: mocks.user }) }));
vi.mock('@/api/legal', () => ({ getTermsAcceptanceStatus: mocks.terms }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/legal/TermsAcceptanceForm', () => ({ default: ({ onAccepted }: { onAccepted: () => Promise<void> }) => {
  mocks.callbacks.push(onAccepted);
  return <button onClick={onAccepted}>Synthetic acceptance</button>;
} }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function Gate({ requireAcceptance = false, auto = false, preloadAcceptance = false, actionContextKey = 'a' }) {
  const { ensureTermsAccepted, TermsGatePrompt, checkingTerms, termsAccepted } = useTermsGate('buyer', { requireAcceptance, preloadAcceptance, actionContextKey });
  useEffect(() => { if (auto) void ensureTermsAccepted(mocks.action); }, [auto]);
  return <><button disabled={checkingTerms} onClick={() => ensureTermsAccepted(mocks.action)}>Run</button><span>{termsAccepted ? 'Accepted' : 'Unverified'}</span><TermsGatePrompt /></>;
}
beforeEach(() => {
  mocks.user = { id: 'buyer-a' } as User;
  mocks.callbacks.length = 0;
  vi.stubEnv('NEXT_PUBLIC_TERMS_GATE_ENFORCE', 'true');
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllEnvs(); });

it.each(['accepted', 'failure'] as const)('never revives the first StrictMode setup after delayed %s', async outcome => {
  const first = deferred<{ accepted: boolean }>();
  const current = deferred<{ accepted: boolean }>();
  mocks.terms.mockReturnValueOnce(first.promise).mockReturnValue(current.promise);
  await act(async () => { render(<StrictMode><Gate auto /></StrictMode>); });
  expect(mocks.terms).toHaveBeenCalledTimes(2);
  await act(async () => { if (outcome === 'accepted') first.resolve({ accepted: true }); else first.reject(new Error('synthetic')); });
  expect(mocks.action).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect((screen.getByText('Run') as HTMLButtonElement).disabled).toBe(true);
  await act(async () => current.resolve({ accepted: true }));
  expect(mocks.action).toHaveBeenCalledOnce();
});

it.each(['account', 'party', 'action'] as const)('retires a modal on %s change and preserves a newer modal callback', async kind => {
  mocks.terms.mockResolvedValue({ accepted: false });
  const view = render(<StrictMode><Gate /></StrictMode>);
  await act(async () => fireEvent.click(screen.getByText('Run')));
  const old = mocks.callbacks.at(-1)!;
  if (kind === 'account') mocks.user = { id: 'buyer-b' } as User;
  if (kind === 'party') mocks.user = { id: 'buyer-a', company_name: 'Organization' } as User;
  view.rerender(<StrictMode><Gate actionContextKey={kind === 'action' ? 'b' : 'a'} /></StrictMode>);
  expect(screen.queryByText('Synthetic acceptance')).toBeNull();
  await act(async () => fireEvent.click(screen.getByText('Run')));
  const current = mocks.callbacks.at(-1)!;
  await act(async () => old());
  expect(mocks.action).not.toHaveBeenCalled();
  expect(screen.getByText('Synthetic acceptance')).toBeTruthy();
  await act(async () => current());
  expect(mocks.action).toHaveBeenCalledOnce();
  expect(screen.getByText('Accepted')).toBeTruthy();
});

it.each([false, true])('preserves no-context policy, requireAcceptance=%s', async requireAcceptance => {
  mocks.user = null;
  render(<StrictMode><Gate requireAcceptance={requireAcceptance} /></StrictMode>);
  await act(async () => fireEvent.click(screen.getByText('Run')));
  expect(mocks.terms).not.toHaveBeenCalled();
  expect(mocks.action).toHaveBeenCalledTimes(requireAcceptance ? 0 : 1);
});

it.each(['unaccepted', 'failure'] as const)('preserves current advisory %s behavior', async kind => {
  vi.stubEnv('NEXT_PUBLIC_TERMS_GATE_ENFORCE', 'false');
  if (kind === 'failure') mocks.terms.mockRejectedValue(new Error('synthetic'));
  else mocks.terms.mockResolvedValue({ accepted: false });
  render(<StrictMode><Gate /></StrictMode>);
  await act(async () => fireEvent.click(screen.getByText('Run')));
  expect(mocks.action).toHaveBeenCalledOnce();
  expect(mocks.toast).toHaveBeenCalledWith('Please review and accept the ai.market Terms and Conditions.', 'info');
});

it('keeps preload acceptance across same-account refresh', async () => {
  mocks.terms.mockResolvedValue({ accepted: true });
  const view = render(<StrictMode><Gate preloadAcceptance /></StrictMode>);
  await act(async () => {});
  expect(screen.getByText('Accepted')).toBeTruthy();
  const count = mocks.terms.mock.calls.length;
  mocks.user = { ...mocks.user, first_name: 'Refreshed' } as User;
  view.rerender(<StrictMode><Gate preloadAcceptance /></StrictMode>);
  await act(async () => fireEvent.click(screen.getByText('Run')));
  expect(mocks.terms).toHaveBeenCalledTimes(count);
  expect(mocks.action).toHaveBeenCalledOnce();
});
