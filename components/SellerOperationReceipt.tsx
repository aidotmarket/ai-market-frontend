import type { PendingAction } from '@/api/pending-actions';

export default function SellerOperationReceipt({ result }: { result: PendingAction['result'] }) {
  if (!result || typeof result.operation_id !== 'string') return null;
  return <section aria-label="Live seller operation receipt" className="space-y-3 rounded-lg border p-4">
    <h2 className="font-semibold">Seller operation receipt</h2>
    <p className="break-all">Operation {result.operation_id}</p>
    <p role="status">Execution: {String(result.execution_status ?? 'unavailable')}</p>
    <dl className="grid grid-cols-2 gap-2">{['requested_count', 'eligible_count', 'blocked_count', 'succeeded_count', 'no_change_count', 'failed_count', 'cancelled_count'].map(key => <div key={key}>
      <dt>{key.replaceAll('_', ' ')}</dt><dd>{Number.isSafeInteger(result[key]) ? String(result[key]) : 'Unavailable'}</dd>
    </div>)}</dl>
    <p>Confirmation authorizes queued work. These receipts report execution separately.</p>
  </section>;
}
