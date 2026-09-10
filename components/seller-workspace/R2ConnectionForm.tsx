'use client';
import {useRef,useState,type FormEvent} from 'react';
import {createIdempotencyKey,saveR2Connection,type R2ConnectionInput,type SellerWorkspaceConnection} from '@/api/sellerWorkspace';

export default function R2ConnectionForm({connection,onSaved,onClose}: {
  connection?:SellerWorkspaceConnection|null; onSaved:(connection:SellerWorkspaceConnection)=>void; onClose:()=>void;
}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const requestId=useRef<string|null>(null);
  const submitting=useRef(false);
  const [values,setValues]=useState({account_id:connection?.provider_account_id ?? '',
    jurisdiction:(connection?.region ?? 'default') as R2ConnectionInput['jurisdiction'],
    bucket:connection?.bucket ?? '',prefix:connection?.prefix ?? '',access_key_id:'',secret_access_key:''});
  const change=(name:keyof typeof values,value:string) => {
    requestId.current=null;setValues(current=>({...current,[name]:value}));setError('');
  };
  const submit=async (event:FormEvent) => {
    event.preventDefault();if(submitting.current || !confirmed)return;
    submitting.current=true;setBusy(true);setError('');
    try {
      requestId.current ??= createIdempotencyKey(connection?'r2-replace':'r2-create');
      const result=await saveR2Connection({...values,dedicated_bucket_readonly:true,expected_version:connection?.version ?? 0},requestId.current,connection?.id);
      setValues(current=>({...current,access_key_id:'',secret_access_key:''}));
      onSaved(result.connection);
    } catch {
      setError('Connection could not be confirmed. Check the account, bucket, folder and read-only keys. The folder must contain at least one file. You can retry with the same values.');
    } finally {submitting.current=false;setBusy(false);}
  };
  const inputClass='mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100';
  return <section aria-labelledby="r2-form-title" className="rounded-xl border-2 border-orange-300 bg-white p-6">
    <h2 id="r2-form-title" className="text-xl font-semibold">{connection?'Replace Cloudflare access keys':'Connect Cloudflare R2'}</h2>
    <div className="my-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <strong>Use a dedicated bucket containing only files intended for sale.</strong>
      <p className="mt-2">In Cloudflare R2, open Manage API Tokens. Create a token with <strong>Object Read only</strong> permission and restrict it to this one bucket.</p>
      <p className="mt-2">The key can read every file in that bucket. ai.market limits file selection to the folder you enter below and stores your keys encrypted.</p>
    </div>
    <form onSubmit={submit} autoComplete="off" className="space-y-4">
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Cloudflare account ID<input className={inputClass} required pattern="[0-9a-f]{32}" value={values.account_id} disabled={!!connection} onChange={event=>change('account_id',event.target.value)} spellCheck={false}/></label>
        <label className="text-sm font-medium">Bucket location<select className={inputClass} value={values.jurisdiction} disabled={!!connection} onChange={event=>change('jurisdiction',event.target.value)}><option value="default">Default (no jurisdiction)</option><option value="eu">European Union</option><option value="us">United States</option><option value="fedramp">FedRAMP</option></select></label>
        <label className="text-sm font-medium">Bucket name<input className={inputClass} required value={values.bucket} disabled={!!connection} onChange={event=>change('bucket',event.target.value)} spellCheck={false}/></label>
        <label className="text-sm font-medium">Folder inside the bucket<input className={inputClass} required value={values.prefix} disabled={!!connection} onChange={event=>change('prefix',event.target.value)} placeholder="files-for-sale" spellCheck={false}/></label>
        <label className="text-sm font-medium">Access Key ID<input className={inputClass} required type="password" autoComplete="new-password" pattern="[0-9a-f]{32}" value={values.access_key_id} onChange={event=>change('access_key_id',event.target.value)} spellCheck={false}/></label>
        <label className="text-sm font-medium">Secret Access Key<input className={inputClass} required type="password" autoComplete="new-password" pattern="[0-9a-f]{64}" value={values.secret_access_key} onChange={event=>change('secret_access_key',event.target.value)} spellCheck={false}/></label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input required type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} className="mt-1"/><span>These keys have Object Read only permission for this dedicated bucket.</span></label>
      </fieldset>
      <p className="text-sm text-gray-600">Disconnecting stops new downloads. Links already issued can remain usable for up to five minutes. Revoke old keys in Cloudflare after a successful replacement.</p>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex gap-3"><button disabled={busy || !confirmed} className="rounded-lg bg-indigo-700 px-4 py-2 font-medium text-white disabled:opacity-50">{busy?'Checking connection…':connection?'Verify and replace keys':'Verify and connect R2'}</button><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2">Cancel</button></div>
    </form>
  </section>;
}
