import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { validateRedirect } from '@/lib/redirect';
import { SignedOutPurchase } from './BuyButton';

describe('SignedOutPurchase', () => {
  it('keeps Buy Now available and explains that sign-in does not charge the buyer', () => {
    const html = renderToStaticMarkup(
      <SignedOutPurchase
        slug="signed-out-dataset"
        price={49}
        pricingType="one_time"
        versionLabel="v2"
        accessWindowDays={30}
      />,
    );

    expect(html).toContain('href="/login?redirect=/listings/signed-out-dataset"');
    expect(html).toContain('href="/register?redirect=%2Flistings%2Fsigned-out-dataset"');
    expect(validateRedirect('/listings/signed-out-dataset')).toBe('/listings/signed-out-dataset');
    expect(validateRedirect('%2Flistings%2Fsigned-out-dataset')).toBe('/listings/signed-out-dataset');
    expect(html).toContain('Buy Now - $49.00');
    expect(html).not.toContain('disabled');
    expect(html).toContain('Following the sign-in link does not charge you.');
    expect(html).toContain('review the checkout details and choose whether to confirm');
  });

  it('previews known purchase facts and omits unavailable facts', () => {
    const knownFacts = renderToStaticMarkup(
      <SignedOutPurchase
        slug="versioned-dataset"
        price={125.5}
        pricingType="subscription"
        versionLabel="2026-Q3"
        accessWindowDays={14}
        license="CC-BY-4.0"
        dataFormat="json_lines"
        fulfillmentType="file_download"
      />,
    );
    const unavailableFacts = renderToStaticMarkup(
      <SignedOutPurchase
        slug="legacy-dataset"
        price={10}
        pricingType="one_time"
        license={null}
        dataFormat={null}
        fulfillmentType={null}
      />,
    );

    expect(knownFacts).toContain('Listing price</dt><dd class="font-medium text-gray-900">$125.50');
    expect(knownFacts).toContain('Purchase type</dt><dd class="font-medium text-gray-900">Subscription');
    expect(knownFacts).toContain('Selected version</dt><dd class="font-medium text-gray-900">2026-Q3');
    expect(knownFacts).toContain('Download window</dt><dd class="font-medium text-gray-900">14 days after purchase');
    expect(knownFacts).toContain('License</dt><dd class="font-medium text-gray-900">CC-BY-4.0');
    expect(knownFacts).toContain('Data format</dt><dd class="font-medium text-gray-900">Json lines');
    expect(knownFacts).toContain('Fulfillment type</dt><dd class="font-medium text-gray-900">File download');
    expect(unavailableFacts).not.toContain('Selected version');
    expect(unavailableFacts).not.toContain('Download window');
    expect(unavailableFacts).not.toContain('License');
    expect(unavailableFacts).not.toContain('Data format');
    expect(unavailableFacts).not.toContain('Fulfillment type');
  });
});
