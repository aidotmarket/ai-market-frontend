// @vitest-environment jsdom
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Blob as NodeBlob} from 'node:buffer';
import {DecompressionStream as NodeDecompressionStream} from 'node:stream/web';
import {deflateRawSync} from 'node:zlib';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {captureHandoff,clearHandoff,consumeHandoff} from '@/lib/vectoraizHandoff';
import {useAuthStore} from '@/store/auth';
vi.mock('next/font/local',()=>({default:()=>({className:'font'})}));
vi.mock('@/components/SupportPrivateBoundary',()=>({SupportPrivateBoundary:({children}:{children:React.ReactNode})=>children}));
import RootLayout from '@/app/layout';
const id='00000000-0000-4000-8000-000000000001';
const payload={version:1,pack_id:id,draft:{title:'Pack',brief:'',description:'',category:'',tags:''},files:[{size:1,sha256:'a'.repeat(64)}]};
const encoded=deflateRawSync(JSON.stringify(payload)).toString('base64url');
beforeEach(()=>{
 sessionStorage.clear();clearHandoff();useAuthStore.setState({user:null});
 vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('DecompressionStream',NodeDecompressionStream);
});
afterEach(()=>{delete window.__vectoraizEntry;vi.unstubAllGlobals();});
async function entryScript(){
 const html=renderToStaticMarkup(RootLayout({children:<p>Page</p>}));
 const script=new DOMParser().parseFromString(html,'text/html').querySelector('head script')!;
 return script;
}
it.each(['/login','/does-not-exist','/dashboard/error','/dashboard/gateways'])('CI entry coverage: pre-bootstrap strips valid and malformed fragments on %s, without replay on remount',async path=>{
 const script=await entryScript();
 for(const fragment of [encoded,'malformed']){
  window.history.replaceState({__NA:true},'',path+'?keep=yes#vz='+fragment);
  // Execute exactly the script emitted by the root document, before the hook.
  new Function('window','location','history',script.textContent!)(window,window.location,window.history);
  expect(window.location.hash).toBe('');expect(window.location.search).toBe('?keep=yes');
  expect(window.history.state.__NA).toBe(true);
  await captureHandoff();
  const pending=await consumeHandoff(id,path);
  expect(pending?.handoff??null).toEqual(path==='/dashboard/gateways'&&fragment===encoded?payload:null);
  await captureHandoff();expect(await consumeHandoff(id,path)).toBeNull();
 }
});
