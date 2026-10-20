import { expect, it, vi } from 'vitest';

const next = vi.hoisted(() => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }) }));
vi.mock('next/navigation', () => next);
import WalletTopupEntry from './page';

it('uses page-level literal redirect with no source query forwarding', () => {
  // Next passes route props at runtime; the page deliberately accepts none.
  const invoke = WalletTopupEntry as (props: unknown) => void;
  expect(() => invoke({ searchParams: Promise.resolve({ amount: '100', next: 'https://evil.test',
    checkout_url: 'https://evil.test', session_id: 'forged', topup: 'success' }) })).toThrow('NEXT_REDIRECT');
  expect(next.redirect).toHaveBeenCalledExactlyOnceWith('/dashboard/settings/wallet');
});
