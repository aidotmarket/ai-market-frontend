import { expect, it } from 'vitest';
import { checkoutDestination, checkoutOutcome, paymentUrl } from './checkout-domain';

it.each(['checkout.stripe.com', 'pay.ai.market'])('accepts an exact HTTPS Checkout URL on %s without changing it', host => {
  const url = `https://${host}/c/pay/cs_test?prefilled_email=buyer%40example.com#payment`;
  expect(paymentUrl(url)).toBe(true);
  expect(checkoutDestination({ checkout_url: url })).toBe(url);
});

it.each([
  'http://pay.ai.market',
  'https://evil.pay.ai.market',
  'https://pay.ai.market.evil.com',
  'https://user@pay.ai.market',
  'https://pay.ai.market:8443',
  'https://checkout.stripe.com.evil.com',
  ...['checkout.stripe.com', 'pay.ai.market'].flatMap(host => [
    `http://${host}/c/pay/test`,
    `https://evil.${host}/c/pay/test`,
    `https://${host}.evil.com/c/pay/test`,
    `https://user:password@${host}/c/pay/test`,
    `https://@${host}/c/pay/test`,
    `https://${host}:8443/c/pay/test`,
    // Preserve the existing requirement for a canonical origin followed by '/'.
    `https://${host}:443/c/pay/test`,
    `https://${host}/\\evil.com`,
    `https://${host}/ c/pay/test`,
    `https://${host}/c/pay/test\n`,
  ]),
  '//pay.ai.market/c/pay/test',
  'javascript:alert(1)',
  null,
  undefined,
  123,
])('rejects unsafe Checkout URL %s', url => {
  expect(paymentUrl(url)).toBe(false);
});

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
