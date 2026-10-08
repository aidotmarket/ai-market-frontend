import { expect, it } from 'vitest';
import { checkoutContinuation, checkoutDestination, checkoutWebPath } from './checkout-domain';

const path = `/checkout/h/${'a'.repeat(43)}`;
it('continues only to an exact canonical handoff URL', () => {
  expect(checkoutContinuation(`https://ai.market${path}`)).toBe(path);
});
it.each([path, `https://evil.test${path}`, `https://ai.market.evil.test${path}`, `https://ai.market@evil.test${path}`,
  `https://ai.market:443${path}`, `https://ai.market${path}?next=evil`, `https://ai.market${path}#fragment`,
  `https://ai.market${path}\n`, `https://ai.market/checkout/h/../elsewhere`, null])('rejects unsafe continuation %s', value => {
  expect(checkoutContinuation(value)).toBeNull();
});
it('accepts only Stripe payment or a free purchase order after success', () => {
  expect(checkoutDestination({ checkout_url: 'https://checkout.stripe.com/c/pay/test' })).toBe('https://checkout.stripe.com/c/pay/test');
  expect(checkoutDestination({ checkout_url: null, order_id: 'order' })).toBe('/dashboard/orders/order');
  expect(checkoutDestination({ checkout_url: 'https://evil.test', order_id: 'order' })).toBeNull();
  expect(checkoutDestination({ checkout_url: 'https://checkout.stripe.com.evil.test/' })).toBeNull();
  expect(checkoutDestination({ checkout_url: 'https://checkout.stripe.com/\\evil.test' })).toBeNull();
  expect(checkoutDestination({})).toBeNull();
});
it.each(['//evil.test', '/listings/../checkout', '/listings/x?next=evil', '/listings/x\n', 'https://ai.market/listings/x'])('rejects unsafe block path %s', value => {
  expect(checkoutWebPath(value)).toBeUndefined();
});
it('keeps a first-party listing web path for blocks', () => {
  expect(checkoutWebPath('/listings/listing-id')).toBe('/listings/listing-id');
});
