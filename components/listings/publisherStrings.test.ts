import { describe, expect, it } from 'vitest';
import { VERIFIED_DOMAIN_EXPLANATION, verifiedDomainAriaLabel, sellerRatingText } from './publisherStrings';

describe('publisher strings', () => {
  it('preserves the approved explanation verbatim and includes it in the accessible label', () => {
    const explanation = "This seller has a verified email address at a web domain whose control ai.market checked by DNS. It does not verify the seller's name, legal identity or data quality.";
    expect(VERIFIED_DOMAIN_EXPLANATION).toBe(explanation);
    expect(verifiedDomainAriaLabel()).toBe(`Verified domain. ${explanation}`);
  });
  it.each([[5, 1, '5/5 from 1 rating'], [4.5, 2, '4.5/5 from 2 ratings'], [4, 3, '4/5 from 3 ratings']])('formats %s from %s', (average, count, expected) => {
    expect(sellerRatingText(average as number, count as number)).toBe(expected);
  });
});
