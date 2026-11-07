// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {AxiosError} from 'axios';
import {primaryButtonClass} from './ui/button-styles';
import ListingLicenseDisclosure from './ListingLicenseDisclosure';
import {hashLicenseComponentBytes,sha256} from '@/lib/customLicenseVerification';
import type {ListingLicenseDetails} from '@/types';
const get=vi.hoisted(()=>vi.fn());
vi.mock('@/api/client',()=>({api:{get}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
it.each([[false,false],[true,false],[false,true],[true,true]])('buyer renders verified source and reads only on opening (tampered: %s, plain: %s)',async(tampered,plain)=>{
 vi.stubGlobal('crypto',webcrypto);
 const createObjectURL=vi.fn((_blob:Blob)=> 'blob:verified');
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL,revokeObjectURL:vi.fn()}));
 const entities='&copy; &#x1F600; &#x1D504; &#x4E2D; &#x202E; &#8238; &rlm;';
 const source=plain?'Plain   terms\n\\*literal\\* '+entities+'\n\tCafé 🦊 é\n':'# Terms\n\n**Café** and *rights '+entities+'*\n\n![image](https://evil.test/a) [link](javascript:alert(1))\n\n[ref]: https://evil.test/a\n\n<script>alert(1)</script>\n';
 const bytes=new TextEncoder().encode(source);
 const source_sha256=await sha256(bytes);
 const params={ai_training:true,source_sha256};
 const hash=await hashLicenseComponentBytes(bytes,{kind:'license',code:'custom',version:'1',params});
 const covenant=new TextEncoder().encode('Plain **stock** covenant\n');
 const covenantHash=await hashLicenseComponentBytes(covenant,{kind:'covenant',code:'marketplace-listing',version:'1.0',params:{}});
 const licence:ListingLicenseDetails={code:'custom',version:'1',params,sha256:hash,covenant_version:'1.0',covenant_sha256:covenantHash,rider_sha256:null,summary:[],full_text_url:'/api/v1/listings/id/license-document',download_url:'/api/v1/listings/id/license-document?download=1'};
 get.mockResolvedValue({data:tampered?new TextEncoder().encode(source+'altered').buffer:bytes.buffer,headers:{'content-type':'text/plain; charset=utf-8','x-content-type-options':'nosniff','cache-control':'private, no-store','content-disposition':'attachment; filename="listing-id-licence.txt"','x-license-source-sha256':source_sha256,'x-license-sha256':hash}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(covenant,{headers:{'content-type':'text/plain'}})));
 const verified=vi.fn();
 render(<ListingLicenseDisclosure license={licence} onVerificationChange={verified}/>);
 await screen.findByRole('button',{name:'Read Marketplace Listing Covenant'});
 if(tampered){
  expect(screen.getByText('Hash mismatch — do not accept')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Read full licence'})).toBeNull();
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(verified).not.toHaveBeenCalledWith(true);
 }else{
  await waitFor(()=>expect(verified).toHaveBeenLastCalledWith(true));
  fireEvent.click(screen.getByRole('button',{name:'Read full licence'}));
  const dialog=screen.getByRole('dialog');
  if(plain){
   expect(dialog.querySelector('.whitespace-pre-wrap')?.textContent).toBe(source);
   expect(dialog.querySelector('h1,strong,em')).toBeNull();
  }else{
   expect(dialog.querySelector('h1')?.textContent).toBe('Terms');
   expect(dialog.querySelector('strong')?.textContent).toBe('Café');
   expect(dialog.querySelector('em')?.textContent).toBe('rights '+entities);
   expect(dialog.textContent).toContain('[ref]: https://evil.test/a');
  }
  expect(dialog.querySelector('img,script')).toBeNull();
  expect(get).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  const blob=createObjectURL.mock.calls[0]?.[0] as Blob;
  expect(blob.size).toBe(bytes.length);
  expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(bytes));
  expect(dialog.querySelectorAll('a')).toHaveLength(1); // existing exact-document link only
  fireEvent.keyDown(document,{key:'Escape'});
 }
 fireEvent.click(screen.getByRole('button',{name:'Read Marketplace Listing Covenant'}));
 expect(screen.getByRole('dialog').querySelector('strong')).toBeNull();
 expect(screen.getByText('Plain **stock** covenant')).toBeTruthy();
 expect(licence.sha256).toBe(hash);
});


it.each(['api', 'fetch'] as const)('handles custom licence refusals through %s without verifying or exposing bytes', async (transport) => {
 vi.stubGlobal('crypto', webcrypto);
 const covenant = new TextEncoder().encode('Public covenant\n');
 const covenantHash = await hashLicenseComponentBytes(covenant, {kind: 'covenant', code: 'marketplace-listing', version: '1.0', params: {}});
 const licence: ListingLicenseDetails = {
  code: 'custom', version: '1', params: {ai_training: true, source_sha256: 'a'.repeat(64)},
  sha256: 'b'.repeat(64), covenant_version: '1.0', covenant_sha256: covenantHash, rider_sha256: null, summary: [],
  full_text_url: '/licenses/custom/' + 'b'.repeat(64),
  download_url: transport === 'api' ? '/api/v1/listings/id/license-document?download=1' : 'https://api.ai.market/api/v1/listings/id/license-document?download=1',
 };
 const originalPath = window.location.pathname + window.location.search + window.location.hash;
 const listingPath = '/listings/seller-example?from=search#licence';
 window.history.replaceState(null, '', listingPath);
 try {
  for (const failure of [401, 403, 500, 'network'] as const) {
   const verified = vi.fn();
   const error = failure === 'network' ? new TypeError('Failed to fetch') : new AxiosError('Document refused', undefined, undefined, undefined, {
    status: failure, statusText: 'Refused', data: {}, headers: {}, config: {} as never,
   });
   get.mockRejectedValue(error);
   const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('marketplace-listing')) return new Response(covenant, {headers: {'content-type': 'text/plain'}});
    if (failure === 'network') throw error;
    return new Response(null, {status: failure});
   });
   vi.stubGlobal('fetch', fetchMock);
   const view = render(<ListingLicenseDisclosure license={licence} onVerificationChange={verified} />);
   const signIn = failure === 401 || failure === 403;
   const status = await screen.findByText(signIn ? "Sign in to read and verify the seller's licence" : 'Could not verify — do not accept');
   expect(status.className.includes('text-red-800')).toBe(!signIn);
   expect(verified).toHaveBeenLastCalledWith(false);
   expect(verified).not.toHaveBeenCalledWith(true);
   expect(screen.getByText('Fetched bytes match the server hash')).toBeTruthy();
   expect(screen.queryByRole('button', {name: 'Read full licence'})).toBeNull();
   expect(screen.queryByRole('link', {name: licence.full_text_url})).toBeNull();
   if (signIn) {
    const link = screen.getByRole('link', {name: 'Sign in'});
    expect(link.getAttribute('href')).toBe(`/login?redirect=${encodeURIComponent(listingPath)}`);
    expect(link.className).toBe(primaryButtonClass);
   } else {
    expect(screen.queryByRole('link', {name: 'Sign in'})).toBeNull();
   }
   expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/licenses/custom/'))).toBe(false);
   view.unmount();
  }
 } finally {
  window.history.replaceState(null, '', originalPath);
 }
});

it.each(['1.0','1.1'])('verifies and links the backend standard/covenant version %s',async version=>{
 vi.stubGlobal('crypto',webcrypto);
 const text='Full versioned standard text';
 const covenant='Full versioned covenant text';
 const params={ai_training:false};
 const hash=await hashLicenseComponentBytes(new TextEncoder().encode(text),{kind:'license',code:'standard',version,params});
 const covenantHash=await hashLicenseComponentBytes(new TextEncoder().encode(covenant),{kind:'covenant',code:'marketplace-listing',version,params:{}});
 const fetched=vi.fn(async(input:RequestInfo|URL)=>new Response(String(input).includes('marketplace-listing')?covenant:text,{headers:{'content-type':'text/plain'}}));
 vi.stubGlobal('fetch',fetched);
 const verified=vi.fn();
 render(<ListingLicenseDisclosure license={{code:'standard',version,params,sha256:hash,covenant_version:version,covenant_sha256:covenantHash,rider_sha256:null,summary:[],full_text_url:`/licenses/standard/${version}/no-ai-training`,download_url:`/licenses/standard/${version}/no-ai-training?download=1`}} onVerificationChange={verified}/>);
 await waitFor(()=>expect(verified).toHaveBeenLastCalledWith(true));
 expect(screen.getByText(`ai.market Standard Data Licence v${version}`)).toBeTruthy();
 expect(screen.getByText(`ai.market Marketplace Listing Covenant v${version}`)).toBeTruthy();
 expect(fetched).toHaveBeenCalledWith(`/licenses/marketplace-listing/${version}?download=1`,expect.anything());
});
