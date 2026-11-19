// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Blob as NodeBlob} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {DecompressionStream as NodeDecompressionStream} from 'node:stream/web';
import {createElement} from 'react';
import {act,cleanup,render} from '@testing-library/react';
import {useAuthStore} from '@/store/auth';
import {authorityMessage,bucketTarget,captureHandoff,clearHandoff,consumeHandoff,decodeHandoff,HANDOFF_TTL,HandoffError,identityMatches,matchGateway,MAX_ENCODED,MAX_EXPANDED,matchingConnections,requireVectorNames,strictJSON,validateHandoff,VECTOR_NAMES,saveAuthorityReceipt,readAuthorityReceipt,useHandoffBoundary,type BucketHandoff,type GatewayHandoff} from './vectoraizHandoff';
import type {SellerWorkspaceConnection,WorkspaceObject} from '@/api/sellerWorkspace';
import type {GatewayFile} from '@/types/sellerGateway';
const id='00000000-0000-4000-8000-000000000001';
const draft={title:'Vector pack',brief:'Private brief',description:'Reviewed chunks',category:'Technology',tags:'vectors'};
const gateway:GatewayHandoff={version:1,pack_id:id,draft,files:Array.from({length:6},(_,i)=>({size:i+10,sha256:String(i).repeat(64)}))};
const bucket:BucketHandoff={version:1,pack_id:id,draft,provider:'aws',region:'eu-west-1',bucket:'neutral',connection_folder:'vz',pack_prefix:'vz/'+id+'/',file_count:6,selection_sha256:'a'.repeat(64)};
const encode=(v:unknown)=>deflateRawSync(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
beforeEach(()=>{
  vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('DecompressionStream',NodeDecompressionStream);vi.stubGlobal('crypto',webcrypto);
  sessionStorage.clear();useAuthStore.setState({user:null});clearHandoff();
  window.history.replaceState(null,'','/dashboard/gateways');
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();sessionStorage.clear();});
describe('T8 handoff_boundary',()=>{
  it.each([gateway,bucket])('accepts the strict native v1 shape',async value=>{expect(await decodeHandoff(encode(value))).toEqual(value);});
  it.each([
    {...gateway,version:2},{...gateway,pack_id:'pack-deadbeef'},{...gateway,pack_id:id.toUpperCase().replace('00000000','ABCDEF00')},
    {...gateway,draft_id:id},{...gateway,url:'https://example.test'},{...gateway,credentials:'secret'},
    {...gateway,identity_terms:['private']},{...gateway,draft:{...draft,title:'x'.repeat(256)}},
    {...gateway,files:[gateway.files[0],gateway.files[0]]},{...gateway,files:Array(65).fill(gateway.files[0])},
    {...bucket,pack_prefix:'../'},{...bucket,region:null},{...bucket,account_id:'account'},{...bucket,file_count:1.5},
    {...gateway,files:[{size:-1,sha256:'bad'}]},
  ])('rejects unknown, malformed or detached fields without reflecting input (%#)',async value=>{
    await expect(decodeHandoff(encode(value))).rejects.toBeInstanceOf(HandoffError);
  });
  it('rejects duplicate and escaped duplicate keys and excessive nesting',()=>{
    expect(()=>strictJSON('{"version":1,"version":1}')).toThrow();
    expect(()=>strictJSON('{"version":1,"\\u0076ersion":1}')).toThrow();
    expect(()=>strictJSON('['.repeat(25)+'0'+']'.repeat(25))).toThrow();
  });
  it('bounds encoded input before decompression',async()=>{
    const stream=vi.fn();vi.stubGlobal('DecompressionStream',stream);
    await expect(decodeHandoff('a'.repeat(MAX_ENCODED+1))).rejects.toBeInstanceOf(HandoffError);
    expect(stream).not.toHaveBeenCalled();
  });
  it('stops expanded bombs, corrupt streams, trailing bytes and non-base64url input',async()=>{
    for(const value of [encode('x'.repeat(MAX_EXPANDED+1)),encode('{}')+'AAAA','abc','bad=',encode('not json')])
      await expect(decodeHandoff(value)).rejects.toBeInstanceOf(HandoffError);
  });
  it('removes fragments synchronously on accepted, invalid, login and error paths',async()=>{
    for(const path of ['/dashboard/gateways','/dashboard/seller-workspace','/login','/dashboard/error']){
      for(const fragment of [encode(gateway),'invalid', 'x'.repeat(MAX_ENCODED+1)]){
        window.history.replaceState(null,'',path+'?keep=yes#vz='+fragment);
        const work=captureHandoff();
        expect(window.location.hash).toBe('');expect(window.location.search).toBe('?keep=yes');
        await work;
      }
    }
  });
  it('is a no-op without a handoff and rejects mixed or repeated parameters',async()=>{
    window.history.replaceState(null,'','/dashboard/gateways#section');
    await captureHandoff();expect(window.location.hash).toBe('#section');
    window.history.replaceState(null,'','/dashboard/gateways#vz='+encode(gateway)+'&vz='+encode(gateway));
    await captureHandoff();expect(await consumeHandoff(id,'/dashboard/gateways')).toBeNull();
  });
  it('survives first sign-in, consumes once, binds route/account and never imports on reload',async()=>{
    window.history.replaceState(null,'','/dashboard/gateways#vz='+encode(gateway));
    await captureHandoff();
    const item=await consumeHandoff(id,'/dashboard/gateways');
    expect(item?.account).toBe(id);expect(item?.handoff).toEqual(gateway);
    expect(await consumeHandoff(id,'/dashboard/gateways')).toBeNull();
    window.history.replaceState(null,'','/dashboard/gateways#vz='+encode(gateway));
    await captureHandoff();expect(await consumeHandoff(id,'/dashboard/seller-workspace')).toBeNull();
  });
  it('expires at thirty minutes and rejects switched accounts and in-flight invalidation',async()=>{
    vi.spyOn(Date,'now').mockReturnValue(1000);
    window.history.replaceState(null,'','/dashboard/gateways#vz='+encode(gateway));
    await captureHandoff();vi.mocked(Date.now).mockReturnValue(1000+HANDOFF_TTL);
    expect(await consumeHandoff(id,'/dashboard/gateways')).toBeNull();
    useAuthStore.setState({user:{id} as never});
    window.history.replaceState(null,'','/dashboard/gateways#vz='+encode(gateway));await captureHandoff();
    expect(await consumeHandoff('another','/dashboard/gateways')).toBeNull();
    window.history.replaceState(null,'','/dashboard/gateways#vz='+encode(gateway));
    const work=captureHandoff();clearHandoff();await work;expect(sessionStorage.length).toBe(0);
  });
  it('never logs, reports or sends the handoff on malformed links',async()=>{
    const log=vi.spyOn(console,'log'),error=vi.spyOn(console,'error'),warn=vi.spyOn(console,'warn'),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    window.history.replaceState(null,'','/dashboard/gateways#vz=private-invalid');
    await captureHandoff();
    expect(log).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(sessionStorage.length).toBe(0);
  });
  it('treats a structurally valid copied/forged link as untrusted, rather than provenance proof',async()=>{
    expect(validateHandoff(gateway)).toEqual(gateway); // Backend import is still required; never generic draft creation.
  });
});
describe('vector-only selection contract',()=>{
  const objects=VECTOR_NAMES.map((name,i)=>({key:bucket.pack_prefix+name,version_id:null,etag:'e'+i+'-2',size:i,last_modified:'',format_candidate:'unknown'} as WorkspaceObject));
  const connection={id,version:2,status:'verified',provider:'aws',bucket:'neutral',prefix:'vz',region:'eu-west-1'} as SellerWorkspaceConnection;
  it('matches exact connection ownership metadata and folder scope',()=>{
    expect(matchingConnections(bucket,[connection,{...connection,id:'wrong',prefix:'vz/other'},{...connection,id:'wrong2',bucket:'another'}])).toEqual([connection]);
  });
  it('matches sorted quoted multipart ETag/key/size tuples and keeps immutable object versions',async()=>{
    const tuples=objects.map(o=>[o.key,'"'+o.etag+'"',o.size]).sort((a,b)=>String(a[0])<String(b[0])?-1:1);
    const digest=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(tuples)));
    const h={...bucket,selection_sha256:Buffer.from(digest).toString('hex')};
    expect((await bucketTarget(h,connection,[...objects].reverse())).objects).toHaveLength(6);
    await expect(bucketTarget(h,connection,objects.map((o,i)=>i===0?{...o,etag:'swapped'}:o))).rejects.toThrow();
  });
  it.each(['originals-0001.zip','source.txt','nested/source.pdf','transport.zip','query.py'])('refuses extra/source/missing names: %s',name=>{
    expect(()=>requireVectorNames([...VECTOR_NAMES,name])).toThrow();
    expect(()=>requireVectorNames([...VECTOR_NAMES.slice(1),name])).toThrow();
  });
  it('rejects missing and duplicate generated members',()=>{
    expect(()=>requireVectorNames(VECTOR_NAMES.slice(1))).toThrow();
    expect(()=>requireVectorNames([...VECTOR_NAMES.slice(1),VECTOR_NAMES[1]])).toThrow();
  });
  it('matches only unique present fresh SHA256 pairs, with gateway basename mapping',()=>{
    const files=gateway.files.map((f,i)=>({file_id:String(i),display_name:VECTOR_NAMES[i].replace('examples/',''),size_bytes:f.size,present:true,changed_at:'2026-01-01',description:{state:'described',sha256:f.sha256,described_at:'2026-01-02'}} as GatewayFile));
    expect(matchGateway(gateway,files)).toHaveLength(6);
    expect(()=>matchGateway(gateway,[...files,files[0]])).toThrow();
    expect(()=>matchGateway(gateway,files.map((f,i)=>i===0?{...f,present:false}:f))).toThrow();
    expect(()=>matchGateway(gateway,files.map((f,i)=>i===0?{...f,changed_at:'2026-01-03'}:f))).toThrow();
  });
  it('normalizes local identity matches without sending terms',()=>{expect(identityMatches(['ＡＣＭＥ'],['acme.example','neutral'])).toEqual(['acme.example']);});
});
describe('customer refusals',()=>{
  it.each(['AUTHORITY_PURCHASER_STALE','AUTHORITY_SOURCE_STALE','AUTHORITY_BINDING_STALE','AUTHORITY_HANDOFF_MALFORMED','AUTHORITY_IMPORT_KEY_CONFLICT','AUTHORITY_DRAFT_IN_PROGRESS','CSRF_REQUIRED','AUTHORITY_REQUEST_TOO_LARGE'])('maps both detail shapes for %s',code=>{
    const a=authorityMessage({response:{data:{detail:code}}}),b=authorityMessage({response:{data:{detail:{code}}}});
    expect(a).toBe(b);expect(a).not.toContain(code);expect(a).not.toContain('AUTHORITY');
  });
});

it('sanitizes before an error render or redirect effect and clears stash/receipt on account change',async()=>{
  useAuthStore.setState({user:{id} as never});
  const receipt={import_id:id,draft_id:id,authority_version_id:id,listing_id:null};
  saveAuthorityReceipt(id,receipt);expect(readAuthorityReceipt(id)).toEqual(receipt);
  expect(readAuthorityReceipt('other')).toBeNull();
  window.history.replaceState(null,'','/dashboard/gateways#vz='+encode(gateway));
  function Boundary(){useHandoffBoundary();expect(window.location.hash).toBe('');return createElement('p',null,'Error view');}
  render(createElement(Boundary));await captureHandoff();
  expect(sessionStorage.length).toBe(2);
  await act(async()=>{useAuthStore.setState({user:{id:'other'} as never});});
  expect(await consumeHandoff(id,'/dashboard/gateways')).toBeNull();
  expect(readAuthorityReceipt(id)).toBeNull();
});

it.each([
 {...gateway,files:[{size:10,sha256:['a'.repeat(64)]}]},
 {...gateway,files:[{size:10,sha256:'a'.repeat(64)},{sha256:'a'.repeat(64),size:10}]},
 {...bucket,selection_sha256:['a'.repeat(64)]},
 {...bucket,provider:['r2'],region:null,account_id:'account'},
])('MEDIUM 4 rejects non-string digests and value-duplicate pairs before storage (%#)',async value=>{
 window.history.replaceState(null,'','/dashboard/'+('provider' in value?'seller-workspace':'gateways')+'#vz='+encode(value));
 await captureHandoff();expect(sessionStorage.length).toBe(0);
});
it.each([
 [{field:'description',message:'Contact details are not allowed'},'Contact details are not allowed'],
 ['AUTHORITY_LISTING_DISABLED','company administrator'],
 ['AUTHORITY_DRAFT_IN_PROGRESS','Open Seller Workspace and finish'],
 ['SELLER_DISABLED','Selling from vectorAIz is not available yet. Contact support.'],
])('CC F5 and #1172 give an actionable refusal for %j',(detail,copy)=>{
 expect(authorityMessage({response:{data:{detail}}})).toContain(copy);
});

it.each([
 [503,'Text validation is temporarily unavailable. Please retry.'],
 [422,'Text exceeds the token limit.'],
 [422,'Text exceeds the render budget.'],
])('CC L3 preserves the plain server refusal for status %s', (status,message)=>{
 expect(authorityMessage({response:{status,data:{detail:{field:'description',message}}}})).toBe(message);
});
it('does not consume a replacement captured while a stale consumer waits for decoding',async()=>{
 window.history.replaceState(null,'','/dashboard/gateways#vz='+encode(gateway));
 const work=captureHandoff();
 const stale=consumeHandoff(id,'/dashboard/gateways',()=>false);
 await work;expect(await stale).toBeNull();
 expect((await consumeHandoff(id,'/dashboard/gateways'))?.handoff).toEqual(gateway);
});
