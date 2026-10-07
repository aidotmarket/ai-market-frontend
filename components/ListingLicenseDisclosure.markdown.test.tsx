// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
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
 const licence:ListingLicenseDetails={code:'custom',version:'1',params,sha256:hash,covenant_sha256:covenantHash,rider_sha256:null,summary:[],full_text_url:'/api/v1/listings/id/license-document',download_url:'/api/v1/listings/id/license-document?download=1'};
 get.mockResolvedValue({data:tampered?new TextEncoder().encode(source+'altered').buffer:bytes.buffer,headers:{'content-type':'text/plain; charset=utf-8','x-content-type-options':'nosniff','cache-control':'private, no-store','content-disposition':'attachment; filename="listing-id-licence.txt"','x-license-source-sha256':source_sha256,'x-license-sha256':hash}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(covenant,{headers:{'content-type':'text/plain'}})));
 const verified=vi.fn();
 render(<ListingLicenseDisclosure license={licence} onVerificationChange={verified}/>);
 await screen.findByRole('button',{name:'Read Marketplace Listing Covenant'});
 if(tampered){
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
