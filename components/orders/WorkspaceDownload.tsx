'use client';

import {useEffect,useRef,useState} from 'react';
import axios from 'axios';
import {requestWorkspaceDownload,requestWorkspaceFile,validateWorkspaceDownload, type WorkspaceDownload as DownloadBundle} from '@/api/sellerWorkspaceDownload';
import {streamWorkspaceDownload,WorkspaceDownloadError,type DownloadDirectory} from './workspaceDownloadStream';

type PickerWindow = Window & {showDirectoryPicker?: (options:{mode:'readwrite'}) => Promise<DownloadDirectory>};
export default function WorkspaceDownload({orderId,requestGrant=requestWorkspaceDownload}: {
  orderId:string;requestGrant?: (orderId:string,signal:AbortSignal,requestId?:string) => Promise<DownloadBundle>;
}) {
  const [supported,setSupported]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const mounted=useRef(true);
  const controller=useRef<AbortController|null>(null);
  const working=useRef(false);
  const pendingStart=useRef<string|null>(null);
  useEffect(() => {
    mounted.current=true;setSupported(typeof (window as PickerWindow).showDirectoryPicker === 'function');
    return () => {mounted.current=false;controller.current?.abort();};
  },[]);
  const download=async () => {
    if (working.current) return;
    const picker=(window as PickerWindow).showDirectoryPicker;
    if (!picker) return;
    working.current=true;setBusy(true);setError('');setMessage('Choose where to save your files.');
    const operation=new AbortController();controller.current=operation;
    let choosingFolder=true;
    try {
      // The picker runs directly in the click gesture, before any network await.
      const directory=await picker.call(window,{mode:'readwrite'});
      choosingFolder=false;
      operation.signal.throwIfAborted();
      setMessage('Checking access to your purchase…');
      pendingStart.current ??= crypto.randomUUID();
      const bundle=validateWorkspaceDownload(await requestGrant(orderId,operation.signal,pendingStart.current));
      pendingStart.current=null;
      operation.signal.throwIfAborted();
      const folder=await streamWorkspaceDownload(bundle,directory,operation.signal,(file,bytes,size) => {
        if (mounted.current) setMessage(`Downloading ${file}: ${bytes.toLocaleString()} of ${size.toLocaleString()} bytes`);
      },entry => requestWorkspaceFile(orderId,bundle.session_id,entry.index,operation.signal));
      if (mounted.current) setMessage(`Saved ${bundle.files.length} file${bundle.files.length === 1 ? '' : 's'} in ${folder}. ${bundle.downloads_remaining} download${bundle.downloads_remaining === 1 ? '' : 's'} remaining.`);
    } catch (failure) {
      if (mounted.current) {
        setMessage('');
        if (operation.signal.aborted || (choosingFolder && failure instanceof DOMException && failure.name === 'AbortError')) setMessage('Download cancelled. Any completed files remain in your selected folder.');
        else if (failure instanceof WorkspaceDownloadError && failure.code === 'file_changed') setError('The seller’s file has changed since approval. Contact the seller before downloading it again.');
        else if (axios.isAxiosError(failure) && [403,404].includes(failure.response?.status ?? 0)) setError('Download access is not available for this purchase. Check the order or contact support.');
        else setError('The download could not be completed. Any completed files remain in your selected folder. Check your purchase before trying again.');
      }
    } finally { working.current=false;if (mounted.current) setBusy(false); }
  };
  return <section aria-label="Download purchased files" className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
    <h2 className="text-lg font-semibold text-gray-900">Download your files</h2>
    <p className="text-sm text-gray-600">Your files download directly from the seller’s storage into a new folder. One download allowance covers all files in this purchase.</p>
    {supported === false && <p role="status" className="text-sm text-amber-800">Use desktop Chrome or Edge to save these files directly to a folder.</p>}
    <div className="flex gap-3"><button type="button" onClick={download} disabled={busy || supported !== true} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Downloading…' : 'Choose folder and download'}</button>
    {busy && <button type="button" onClick={() => controller.current?.abort()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel download</button>}</div>
    {message && <p role="status" className="break-all text-sm text-gray-700">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </section>;
}
