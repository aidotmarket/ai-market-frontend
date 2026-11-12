'use client';

import {useId} from 'react';
import type {ConnectionScope, WholeBucketConfirmation} from '@/api/sellerWorkspace';

export default function ConnectionScopeChoice({value, onChange, confirmation, confirmed, onConfirm}: {
  value: ConnectionScope; onChange: (scope: ConnectionScope) => void;
  confirmation?: WholeBucketConfirmation | null; confirmed: boolean; onConfirm: (checked: boolean) => void;
}) {
  const name = useId();
  if (!confirmation) return null;
  return <fieldset className="space-y-3">
    <legend className="mb-2 text-sm font-medium text-gray-700">Connect a folder or the whole bucket</legend>
    <div className="flex flex-wrap gap-3">
      {([['prefix', 'A folder in the bucket'], ['whole_bucket', 'The whole bucket']] as const).map(([scope, label]) =>
        <label key={scope} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-600 ${value === scope ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
          <input type="radio" name={name} value={scope} checked={value === scope} onChange={() => onChange(scope)} className="h-4 w-4 accent-indigo-700" />{label}
        </label>)}
    </div>
    {value === 'whole_bucket' && <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-gray-900">
      <input type="checkbox" required checked={confirmed} onChange={event => onConfirm(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-indigo-700" />
      <span className="whitespace-pre-wrap">{confirmation.text}</span>
    </label>}
  </fieldset>;
}
