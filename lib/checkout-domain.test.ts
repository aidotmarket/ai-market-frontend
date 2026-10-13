import { expect, it } from 'vitest';
import { checkoutOutcome } from './checkout-domain';

it('rejects missing platform terms before reservation on 403', () => {
  expect(checkoutOutcome({ response: { status: 403, data: { detail: { code: 'TERMS_ACCEPTANCE_REQUIRED' } } } })).toBe('rejected');
});

it.each([
  [403, 'FIRST_PARTY_SESSION_REQUIRED'],
  [403, 'SELLER_TERMS_ACCEPTANCE_PENDING'],
  [403, 'UNKNOWN_CODE'],
  [403, undefined],
  [401, 'TERMS_ACCEPTANCE_REQUIRED'],
  [401, 'FIRST_PARTY_SESSION_REQUIRED'],
  [401, undefined],
])('preserves auth for status %s and code %s', (status, code) => {
  expect(checkoutOutcome({ response: { status, data: { detail: { code } } } })).toBe('auth');
});
