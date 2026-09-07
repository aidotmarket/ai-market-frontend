'use client';

import { useRef, useState } from 'react';
import { StorageSetupGuide, type StorageProvider } from './StorageSetupGuide';
import type { SellerWorkspaceCapabilities } from '@/api/sellerWorkspace';
import { isAWSConnectionAvailable } from '@/api/sellerWorkspace';

export function StorageProviders({ capabilities, busy, onConnectAWS }: {
  capabilities: SellerWorkspaceCapabilities | null;
  busy: string | null;
  onConnectAWS: () => void;
}) {
  const [guide, setGuide] = useState<StorageProvider | null>(null);
  const guideButtons = useRef<Partial<Record<StorageProvider, HTMLButtonElement | null>>>({});
  const awsAvailable = capabilities !== null && isAWSConnectionAvailable(capabilities);
  const r2Disabled = capabilities?.master?.enabled === false
    || capabilities?.providers?.r2?.connect?.status === 'disabled';

  return (
    <section aria-labelledby="storage-providers-title">
      <h2 id="storage-providers-title" className="text-xl font-semibold text-gray-900">Connect your storage</h2>
      <p className="mt-2 text-sm text-gray-600">Choose where your data lives. You control which files ai.market can access.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <article className="flex flex-col rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-xs font-bold text-amber-800">S3</span>
            <h3 className="text-lg font-semibold text-gray-900">AWS S3</h3>
          </div>
          <p className="mt-4 flex-1 text-sm leading-6 text-gray-600">Connect a bucket and a specific folder in your Amazon Web Services account.</p>
          <button type="button" onClick={onConnectAWS} disabled={!awsAvailable || busy !== null}
            className="mt-5 self-start rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#303F9F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3F51B5] disabled:cursor-not-allowed disabled:opacity-50">
            {!awsAvailable ? 'AWS setup unavailable' : busy === 'create-connection' ? 'Creating...' : 'Add AWS connection'}
          </button>
          <button ref={(node) => { guideButtons.current.aws = node; }} type="button" onClick={() => setGuide('aws')} aria-expanded={guide === 'aws'} className="mt-3 self-start text-sm font-medium text-indigo-700 underline">Help me set up AWS storage</button>
        </article>
        <article className="flex flex-col rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-bold text-orange-800">R2</span>
            <h3 className="text-lg font-semibold text-gray-900">Cloudflare R2</h3>
          </div>
          <p className="mt-4 flex-1 text-sm leading-6 text-gray-600">Connect data stored in your Cloudflare R2 account.</p>
          <p id="r2-setup-status" className="mt-3 text-xs leading-5 text-gray-500">
            {r2Disabled ? 'Cloudflare connection setup is currently unavailable in this Workspace.' : 'Cloudflare is part of Seller Workspace. Its connection setup is still being built.'}
          </p>
          <button type="button" disabled aria-describedby="r2-setup-status"
            className="mt-5 self-start cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-500">
            Cloudflare setup unavailable
          </button>
          <button ref={(node) => { guideButtons.current.r2 = node; }} type="button" onClick={() => setGuide('r2')} aria-expanded={guide === 'r2'} className="mt-3 self-start text-sm font-medium text-indigo-700 underline">Help me set up Cloudflare storage</button>
        </article>
      </div>
      {guide && <StorageSetupGuide key={guide} provider={guide} canConnectAWS={awsAvailable && busy === null} onConnectAWS={onConnectAWS} onClose={() => { setGuide(null); guideButtons.current[guide]?.focus(); }} />}
    </section>
  );
}
