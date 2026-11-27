import type {
  ScanFindings,
} from '@/types';

interface ListingPurchaseAdvisoryProps {
  price: number;
  scanFindings: ScanFindings | null;
}

export default function ListingPurchaseAdvisory({
  price,
  scanFindings,
}: ListingPurchaseAdvisoryProps) {
  if (price <= 0) return null;

  const hasPublishedFindings = scanFindings?.publication_state === 'PUBLISHED';

  return (
    <aside
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
      aria-labelledby="purchase-advisory-heading"
    >
      <p id="purchase-advisory-heading" className="text-sm font-semibold text-amber-900">
        Review before buying
      </p>
      <p className="mt-2 text-xs text-amber-800">
        {hasPublishedFindings
          ? 'Seller-published, point-in-time scan findings are available. They are not a warranty or guarantee; review the full report and its limitations before you buy.'
          : 'No active scan findings are published for this listing. Their absence does not establish the data’s condition or suitability. Review the listing before you buy.'}
      </p>
      <a href="#ask-a-question" className="mt-2 inline-block text-sm font-medium text-amber-900 underline">
        Ask a question about this listing
      </a>
      <p className="mt-1 text-xs text-amber-800">
        If you’re signed out, your question goes to allAI, which uses public listing information to answer.
        You must be signed in to contact the seller. If you’re signed in, you may get an AI answer or have
        your question forwarded to the seller.
      </p>
    </aside>
  );
}
