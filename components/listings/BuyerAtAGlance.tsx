"use client";
import {useEffect, useState} from 'react';
import {fetchBuyerSummary, type ListingSummary} from '@/lib/api';
import type {LicenseDisplay} from '@/lib/publicPresentation';
import type {Manifest} from '@/lib/listing-preview/types';
import AtAGlance, {hasSupportedSummaryFields, summaryLicenseDisplay} from './AtAGlance';
import ListingSamplePreview from './ListingSamplePreview';

export function BuyerPreviewContent({summary, licenseDisplay, slug, listingId, onManifest}: {
  summary?: ListingSummary | null; licenseDisplay?: LicenseDisplay | null; slug?: string; listingId?: string; onManifest?: (manifest: Manifest | null) => void;
}) {
  const currentDisplay = summaryLicenseDisplay(licenseDisplay);
  return <>{!currentDisplay && hasSupportedSummaryFields(summary) && <p className="text-sm text-gray-600">Original approved summary evidence; current public licence display is shown separately.</p>}<AtAGlance summary={summary} licenseDisplay={currentDisplay} />{listingId && <ListingSamplePreview slug={slug} listingId={listingId} onManifest={onManifest} />}</>;
}

export function BuyerSamplePreview({slug, listingId}: {slug: string; listingId: string}) {
  return <ListingSamplePreview slug={slug} listingId={listingId} />;
}

// Fresh loads use force-dynamic/no-store. An untouched tab retains its summary
// until visibility resumes or bfcache restores it; there is no polling.
export default function BuyerAtAGlance({slug, listingId, initialSummary, licenseDisplay, includeSample = true, hideSampleAvailability = false}: {
  slug: string; listingId?: string; initialSummary?: ListingSummary | null; licenseDisplay?: LicenseDisplay | null; includeSample?: boolean; hideSampleAvailability?: boolean;
}) {
  const [display, setDisplay] = useState({at_a_glance: initialSummary ?? null, license_display: licenseDisplay});
  useEffect(() => {
    let disposed = false;
    let current: AbortController | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setDisplay({at_a_glance: initialSummary ?? null, license_display: licenseDisplay});
    async function refresh() {
      if (document.visibilityState === 'hidden' || current) return;
      setDisplay({at_a_glance: null, license_display: null});
      const controller = new AbortController(); current = controller;
      // Clear even if the transport fails to settle when aborted.
      const requestTimeout = setTimeout(() => {
        controller.abort();
        if (!disposed) setDisplay({at_a_glance: null, license_display: null});
        if (current === controller) current = null;
      }, 5_000);
      timeout = requestTimeout;
      try {
        const value = await fetchBuyerSummary(slug, controller.signal);
        if (!disposed && !controller.signal.aborted) setDisplay(value);
      } catch {
        if (!disposed && !controller.signal.aborted) setDisplay({at_a_glance: null, license_display: null});
      } finally {
        clearTimeout(requestTimeout);
        if (current === controller) current = null;
      }
    }
    function visibility() {
      if (document.visibilityState === 'hidden') {current?.abort(); current = null; clearTimeout(timeout); setDisplay({at_a_glance: null, license_display: null});}
      if (document.visibilityState === 'visible') void refresh();
    }
    function restore(event: PageTransitionEvent) {
      if (event.persisted) void refresh();
    }
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pageshow', restore);
    return () => {
      disposed = true; current?.abort(); clearTimeout(timeout);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pageshow', restore);
    };
  }, [slug, initialSummary, licenseDisplay]);
  const summary = display.at_a_glance;
  const visibleSummary = summary && hideSampleAvailability
    ? {...summary, sample_availability: undefined}
    : summary;
  return <BuyerPreviewContent licenseDisplay={display.license_display} summary={visibleSummary} slug={slug} listingId={includeSample ? listingId : undefined} />;
}
