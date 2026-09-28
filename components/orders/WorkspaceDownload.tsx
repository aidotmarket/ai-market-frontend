'use client';

import {useEffect,useRef,useState} from 'react';
import axios from 'axios';
import {requestWorkspaceDownload,requestWorkspaceFile,validateWorkspaceDownload, type WorkspaceDownload as DownloadBundle} from '@/api/sellerWorkspaceDownload';
import {saveWorkspaceFile,streamWorkspaceDownload,WorkspaceDownloadError,type DownloadDirectory} from './workspaceDownloadStream';

type PickerWindow = Window & {showDirectoryPicker?: (options:{mode:'readwrite'}) => Promise<DownloadDirectory>};
const FALLBACK_MAX_BYTES=1_000_000_000;
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
  const pendingUrls=useRef(new Map<number,string>());
  const revokePendingUrls=() => {
    for (const [timer,url] of pendingUrls.current) {
      window.clearTimeout(timer);URL.revokeObjectURL(url);
    }
    pendingUrls.current.clear();
  };
  useEffect(() => {
    mounted.current=true;setSupported(typeof (window as PickerWindow).showDirectoryPicker === 'function');
    return () => {mounted.current=false;controller.current?.abort();revokePendingUrls();};
  },[]);
  const download=async () => {
    if (working.current) return;
    const picker=(window as PickerWindow).showDirectoryPicker;
    working.current=true;setBusy(true);setError('');
    setMessage(picker ? 'Choose a folder inside Downloads, or create one in the folder picker.' : 'Checking access to your purchase…');
    const operation=new AbortController();controller.current=operation;
    operation.signal.addEventListener('abort',revokePendingUrls,{once:true});
    let choosingFolder=Boolean(picker);
    try {
      // The picker runs directly in the click gesture, before any network await.
      const directory=picker ? await picker.call(window,{mode:'readwrite'}) : null;
      choosingFolder=false;
      operation.signal.throwIfAborted();
      setMessage('Checking access to your purchase…');
      pendingStart.current ??= crypto.randomUUID();
      const bundle=validateWorkspaceDownload(await requestGrant(orderId,operation.signal,pendingStart.current));
      pendingStart.current=null;
      operation.signal.throwIfAborted();
      const progress=(file:string,bytes:number,size:number,fileNumber:number) => {
        if (mounted.current) setMessage(`File ${fileNumber.toLocaleString()} of ${bundle.files.length.toLocaleString()} — downloading ${file}: ${bytes.toLocaleString()} of ${size.toLocaleString()} bytes`);
      };
      const loadGrant=(entry:DownloadBundle['files'][number]) => requestWorkspaceFile(orderId,bundle.session_id,entry.index,operation.signal,seconds => {
        if (mounted.current) setMessage(seconds === null
          ? `Resuming file ${(entry.index+1).toLocaleString()} of ${bundle.files.length.toLocaleString()}…`
          : `File ${(entry.index+1).toLocaleString()} of ${bundle.files.length.toLocaleString()}: delivery is busy. Retrying in ${seconds} seconds. Your completed files are saved.`);
      });
      if (directory) {
        const folder=await streamWorkspaceDownload(bundle,directory,operation.signal,progress,loadGrant);
        if (mounted.current) setMessage(`Saved ${bundle.files.length} file${bundle.files.length === 1 ? '' : 's'} in ${folder}. ${bundle.downloads_remaining} download${bundle.downloads_remaining === 1 ? '' : 's'} remaining.`);
      } else {
        // Refuse before any file is fetched, so a later oversized file cannot leave a partial set.
        if (bundle.files.some(entry => entry.size>FALLBACK_MAX_BYTES)) throw new WorkspaceDownloadError('memory');
        for (const [index,entry] of bundle.files.entries()) {
          const chunks:Uint8Array[]=[];
          const filename=await saveWorkspaceFile(entry,index,operation.signal,progress,loadGrant,async () => ({
            async write(data) { chunks.push(data); },async close() {},async abort() { chunks.length=0; },
          }));
          operation.signal.throwIfAborted();
          let blob:Blob;
          try { blob=new Blob(chunks as BlobPart[],{type:'application/octet-stream'}); }
          catch (failure) {
            if (failure instanceof RangeError || (failure instanceof DOMException && failure.name === 'QuotaExceededError')) throw new WorkspaceDownloadError('memory');
            throw failure;
          }
          chunks.length=0;
          operation.signal.throwIfAborted();
          // The previous file's click started its save a whole fetch ago; keep at most one live Blob URL.
          revokePendingUrls();
          const url=URL.createObjectURL(blob);
          try {
            const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
            anchor.style.display='none';document.body.append(anchor);
            try {anchor.click();} finally {anchor.remove();}
          } finally {
            if (mounted.current && !operation.signal.aborted) {
              const timer=window.setTimeout(() => {pendingUrls.current.delete(timer);URL.revokeObjectURL(url);},30000);
              pendingUrls.current.set(timer,url);
            } else URL.revokeObjectURL(url);
          }
        }
        if (mounted.current) setMessage(`Saved ${bundle.files.length} file${bundle.files.length === 1 ? '' : 's'} to your browser’s Downloads location. ${bundle.downloads_remaining} download${bundle.downloads_remaining === 1 ? '' : 's'} remaining.`);
      }
    } catch (failure) {
      if (mounted.current) {
        setMessage('');
        if (operation.signal.aborted || (choosingFolder && failure instanceof DOMException && failure.name === 'AbortError')) setMessage(`Download cancelled. Any completed files remain in ${picker ? 'your selected folder' : 'your Downloads location'}.`);
        else if (failure instanceof WorkspaceDownloadError && failure.code === 'file_changed') setError('The seller’s file has changed since approval. Contact the seller before downloading it again.');
        else if (failure instanceof WorkspaceDownloadError && failure.code === 'memory') setError('This file is too large for your browser to hold in memory. Use Chrome, Edge, or another browser that can save to a folder to download large files.');
        else if (axios.isAxiosError(failure) && [403,404].includes(failure.response?.status ?? 0)) setError('Download access is not available for this purchase. Check the order or contact support.');
        else setError(`The download could not be completed. Any completed files remain in ${picker ? 'your selected folder' : 'your Downloads location'}. Check your purchase before trying again.`);
      }
    } finally { working.current=false;if (mounted.current) setBusy(false); }
  };
  return <section aria-label="Download purchased files" className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
    <h2 className="text-lg font-semibold text-gray-900">Download your files</h2>
    <p className="text-sm text-gray-600">Your files download directly from the seller’s storage to your browser. One download allowance covers all files in this purchase.</p>
    {supported === true && <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4 text-amber-950">
      <h3 className="text-base font-bold">Create a folder inside Downloads. Do not select Downloads itself.</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
        <li>Click <strong>Choose folder and download</strong> below.</li>
        <li>Inside Downloads, create a folder named <strong>ai-market</strong>, or open an existing subfolder.</li>
        <li>Select that subfolder and allow your browser to save your files.</li>
      </ol>
      <p className="mt-3 text-sm">If your browser says “Can’t open this folder”, click <strong>Choose a different folder</strong> and select the subfolder.</p>
    </div>}
    {supported === false && <p className="text-sm text-gray-700">Your browser will save each file to its usual Downloads location. Some browsers ask you to allow multiple downloads.</p>}
    <div className="flex gap-3"><button type="button" onClick={download} disabled={busy || supported === null} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Downloading…' : supported === false ? 'Download files' : 'Choose folder and download'}</button>
    {busy && <button type="button" onClick={() => controller.current?.abort()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel download</button>}</div>
    {message && <p role="status" className="break-all text-sm text-gray-700">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </section>;
}
