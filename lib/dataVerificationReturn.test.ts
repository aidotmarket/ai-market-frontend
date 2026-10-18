// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVerificationReturn, saveVerificationReturn } from './dataVerificationReturn';

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('optional listing-return storage availability', () => {
  it('tolerates an unavailable sessionStorage getter for both save and clear', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });
    expect(() => saveVerificationReturn({ sellerId: 'seller', listingId: 'listing' })).not.toThrow();
    expect(() => saveVerificationReturn()).not.toThrow();
    expect(getVerificationReturn('seller')).toBeNull();
  });

  it('tolerates a missing browser environment', () => {
    vi.stubGlobal('window', undefined);
    expect(() => saveVerificationReturn({ sellerId: 'seller', listingId: 'listing' })).not.toThrow();
    expect(() => saveVerificationReturn()).not.toThrow();
    expect(getVerificationReturn('seller')).toBeNull();
  });

  it.each(['{', 'null', '{"sellerId":"seller","listingId":42}', '{"sellerId":"seller","listingId":""}'])(
    'ignores malformed or unusable stored destinations: %s', saved => {
      window.sessionStorage.setItem('data-verification:listing-return', saved);
      expect(getVerificationReturn('seller')).toBeNull();
    }
  );

  it('requires a current matching seller and encodes the listing as one path segment', () => {
    saveVerificationReturn({ sellerId: 'seller', listingId: '../listing/?#%' });
    expect(getVerificationReturn()).toBeNull();
    expect(getVerificationReturn('other')).toBeNull();
    expect(getVerificationReturn('seller')).toBe('/dashboard/listings/..%2Flisting%2F%3F%23%25');
  });
});
