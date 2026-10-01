import { LISTING_STEPS } from './listingSteps';
import { partitionConnections } from './connectionList';
import type { SellerWorkspaceConnection } from '@/api/sellerWorkspace';

export type WorkspaceView = 'storage' | 'data' | 'listing' | 'review' | 'license' | 'publish' | 'manage';

export function WorkspaceOverview({ connections, view, onViewChange }: {
  connections: SellerWorkspaceConnection[];
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
}) {
  const { current } = partitionConnections(connections);
  const verified = current.filter((connection) => connection.status === 'verified').length;
  const attention = current.filter((connection) =>
    ['pending_authorization', 'error'].includes(connection.status)
    || connection.rotation_substate === 'pending_verification'
  ).length;

  return (
    <>
      <header className="relative overflow-hidden rounded-2xl bg-[#18234B] px-5 py-6 text-white sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full border-[40px] border-white/5" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">Your data business</p>
        <div className="relative mt-3 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Seller Workspace</h1>
            <p className="mt-3 text-sm leading-6 text-indigo-100">Choose what to sell. Allai helps describe it and add the right tags. Your data stays in your cloud account; you approve what becomes public.</p>
          </div>
          <button type="button" onClick={() => onViewChange('manage')} className="rounded-lg border border-white/30 px-4 py-2.5 text-sm font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Manage listings</button>
        </div>
        <dl className="relative mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 sm:mt-8 sm:flex sm:flex-wrap sm:gap-x-10 sm:gap-y-4 sm:pt-5">
          <div><dt className="text-xs text-indigo-200">Connected storage</dt><dd className="mt-1 text-2xl font-semibold">{verified}</dd></div>
          <div><dt className="text-xs text-indigo-200">Needs attention</dt><dd className="mt-1 text-2xl font-semibold">{attention}</dd></div>
          <div><dt className="text-xs text-indigo-200">Data control</dt><dd className="mt-2 text-sm font-medium">Your cloud account</dd></div>
        </dl>
      </header>
      <nav aria-label="Workspace sections" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {([...LISTING_STEPS, ['manage', 'Your listings']] as const).map(([key, label]) => (
          <button key={key} type="button" aria-current={view === key ? 'page' : undefined} onClick={() => onViewChange(key)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[#3F51B5] ${view === key ? 'border-[#3F51B5] text-[#3F51B5]' : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'}`}>{label}</button>
        ))}
      </nav>
    </>
  );
}
