import { describe, expect, it } from 'vitest';
import { validateListingRedirect } from './redirect';

describe('validateListingRedirect', () => {
  it('accepts a single listing detail with a query and fragment', () => {
    const redirect = '/listings/signed-out-dataset?offer=annual#section';

    expect(validateListingRedirect(redirect)).toBe(redirect);
  });

  it.each([
    ['TAB', '/listings/safe?value=%09'],
    ['NUL', '/listings/safe?value=%00'],
    ['C0 control', '/listings/safe?value=%01'],
    ['DEL', '/listings/safe?value=%7f'],
    ['C1 control', '/listings/safe?value=%C2%85'],
    ['CRLF', '/listings/safe?value=%0d%0a'],
    ['Unicode line separator', '/listings/safe?value=%E2%80%A8'],
    ['Unicode paragraph separator', '/listings/safe#value=%E2%80%A9'],
  ])('rejects a decoded %s anywhere in the redirect', (_label, redirect) => {
    expect(validateListingRedirect(redirect)).toBe('');
  });

  it.each([
    ['malformed encoding', '/listings/safe?value=%E0%A4%A'],
    ['protocol-relative URL', '//evil.example/listings/safe'],
    ['external URL', 'https://evil.example/listings/safe'],
    ['backslash', '/listings/safe\\extra'],
    ['nested listing route', '/listings/safe/extra'],
  ])('rejects %s', (_label, redirect) => {
    expect(validateListingRedirect(redirect)).toBe('');
  });
});
