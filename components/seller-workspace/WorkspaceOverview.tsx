import Link from 'next/link';
import type { SellerWorkspaceCapabilities, SellerWorkspaceConnection } from '@/api/sellerWorkspace';

export type WorkspaceView = 'storage' | 'data' | 'activity';

export function WorkspaceOverview({ connections, view, onViewChange }: {
  connections: SellerWorkspaceConnection[];
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
}) {
  const verified = connections.filter((connection) => connection.status === 'verified').length;
  const attention = connections.filter((connection) =>
    ['pending_authorization', 'error', 'expired'].includes(connection.status)
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
            <p className="mt-3 text-sm leading-6 text-indigo-100">Connect your storage, understand your data, and prepare it for buyers. You decide what becomes public.</p>
          </div>
          <Link href="/dashboard/listings" className="rounded-lg border border-white/30 px-4 py-2.5 text-sm font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Manage listings <span aria-hidden="true">↗</span></Link>
        </div>
        <dl className="relative mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 sm:mt-8 sm:flex sm:flex-wrap sm:gap-x-10 sm:gap-y-4 sm:pt-5">
          <div><dt className="text-xs text-indigo-200">Connected storage</dt><dd className="mt-1 text-2xl font-semibold">{verified}</dd></div>
          <div><dt className="text-xs text-indigo-200">Needs attention</dt><dd className="mt-1 text-2xl font-semibold">{attention}</dd></div>
          <div><dt className="text-xs text-indigo-200">Data control</dt><dd className="mt-2 text-sm font-medium">Your cloud account</dd></div>
        </dl>
      </header>
      <nav aria-label="Workspace sections" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {([['storage', 'Storage connections'], ['data', 'Your data'], ['activity', 'Profiling activity']] as const).map(([key, label]) => (
          <button key={key} type="button" aria-current={view === key ? 'page' : undefined} onClick={() => onViewChange(key)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[#3F51B5] ${view === key ? 'border-[#3F51B5] text-[#3F51B5]' : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'}`}>{label}</button>
        ))}
      </nav>
    </>
  );
}

export function SellerJourney({ capabilities, connected }: { capabilities: SellerWorkspaceCapabilities; connected: boolean }) {
  const profile = capabilities.providers.aws.profile;
  const publish = capabilities.providers.aws.publish;
  const stages = [
    { title: 'Connect storage', description: 'Give access to a specific folder in your cloud storage.', state: connected ? 'Connected' : 'Start here' },
    { title: 'Understand your data', description: 'Select files and review their structure and quality.', state: profile.enabled && profile.status === 'available' ? 'Available' : 'Not available yet' },
    { title: 'Prepare your listing', description: 'Choose your description, price, license, and public sample.', state: 'Not available yet' },
    { title: 'Review and publish', description: 'Approve exactly what buyers will see before publishing.', state: publish.enabled && publish.status === 'available' ? 'Interface not available yet' : 'Not available yet' },
  ];
  return (
    <section aria-labelledby="seller-journey-title" className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <h2 id="seller-journey-title" className="font-semibold text-gray-900">From your storage to a listing</h2>
      <ol className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage, index) => (
          <li key={stage.title} className="flex gap-3">
            <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-500'}`}>{index === 0 && connected ? '✓' : index + 1}</span>
            <div><h3 className="text-sm font-semibold text-gray-900">{stage.title}</h3><p className="mt-1 text-xs leading-5 text-gray-500">{stage.description}</p><p className={`mt-2 text-xs font-medium ${index === 0 ? 'text-indigo-700' : 'text-gray-500'}`}>{stage.state}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}
