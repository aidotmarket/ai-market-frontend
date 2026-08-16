import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ListingPurchaseAdvisory from './ListingPurchaseAdvisory';

describe('ListingPurchaseAdvisory', () => {
  it('does not warn on a free listing even when its signals are weak', () => {
    const html = renderToStaticMarkup(
      <ListingPurchaseAdvisory
        price={0}
        complianceStatus="not_checked"
        qualityScore={null}
        verificationStatus="unverified"
        trustLevel="L0"
      />,
    );

    expect(html).toBe('');
  });

  it('names a missing quality score distinctly from a zero score', () => {
    const html = renderToStaticMarkup(
      <ListingPurchaseAdvisory
        price={10}
        complianceStatus="low_risk"
        qualityScore={null}
        verificationStatus="verified"
        trustLevel="L1"
      />,
    );

    expect(html).toContain('Quality not scored');
    expect(html).not.toContain('Quality score: 0/100');
  });

  it('describes the listing verification metric without claiming seller identity status', () => {
    const html = renderToStaticMarkup(
      <ListingPurchaseAdvisory
        price={10}
        complianceStatus="low_risk"
        qualityScore={90}
        verificationStatus="unverified"
        trustLevel="L1"
      />,
    );

    expect(html).toContain('Verification status: Unverified');
    expect(html).not.toContain('Seller unverified');
  });
});
