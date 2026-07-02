import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiPost = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { post: apiPost },
}));

const { createCheckout } = await import('./checkout');

describe('createCheckout', () => {
  beforeEach(() => {
    apiPost.mockReset();
    vi.stubGlobal('window', { location: { origin: 'https://ai.market' } });
  });

  it('includes version_id when a version is selected', async () => {
    apiPost.mockResolvedValue({ data: { checkout_url: 'https://checkout.stripe.com/test', session_id: 'cs_test' } });

    await createCheckout('listing-1', 'version-2');

    expect(apiPost).toHaveBeenCalledWith('/checkout/create', {
      listing_id: 'listing-1',
      version_id: 'version-2',
      success_url: 'https://ai.market/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://ai.market/checkout/cancel',
    });
  });

  it('omits version_id for legacy/latest checkout', async () => {
    apiPost.mockResolvedValue({ data: { checkout_url: 'https://checkout.stripe.com/test', session_id: 'cs_test' } });

    await createCheckout('listing-1');

    expect(apiPost.mock.calls[0][1]).not.toHaveProperty('version_id');
  });
});
