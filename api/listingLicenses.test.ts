// @vitest-environment jsdom
import {webcrypto} from 'node:crypto';
import {beforeEach,expect,it,vi} from 'vitest';
import {createStandardSelection,LICENSE_HASHES,licenseDocumentPath,submitCustomLicenseText} from './listingLicenses';
import {hashLicenseComponentBytes,sha256} from '@/lib/customLicenseVerification';
import vectors from './fixtures/s1735-backend-hash-vectors.json';
const client=vi.hoisted(()=>({post:vi.fn(),get:vi.fn()}));
vi.mock('./client',()=>({api:client}));
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('crypto',webcrypto);});

it('pins the reviewed standard, rider and covenant vectors',()=>{
  expect(Object.keys(vectors).sort()).toEqual(['covenant_marketplace_listing','rider_not_permitted','rider_permitted','standard_ai_training','standard_no_ai_training']);
  expect(createStandardSelection(true).license_sha256).toBe(vectors.standard_ai_training);
  expect(createStandardSelection(false).license_sha256).toBe(vectors.standard_no_ai_training);
  expect(LICENSE_HASHES.rider).toEqual({true:vectors.rider_permitted,false:vectors.rider_not_permitted});
  expect(LICENSE_HASHES.covenant).toBe(vectors.covenant_marketplace_listing);
});

it('constructs the immutable public document paths',()=>{
  expect(licenseDocumentPath('standard',true)).toBe('/licenses/standard/1.0/ai-training');
  expect(licenseDocumentPath('standard',false)).toBe('/licenses/standard/1.0/no-ai-training');
  expect(licenseDocumentPath('covenant')).toBe('/licenses/marketplace-listing/1.0');
  expect(licenseDocumentPath('rider',true)).toBe('/licenses/ai-training-rider/1.0/permitted');
  expect(licenseDocumentPath('rider',false)).toBe('/licenses/ai-training-rider/1.0/not-permitted');
});

async function responseFor(text:string,aiTraining:boolean) {
  const bytes=new TextEncoder().encode(text);
  const source_sha256=await sha256(bytes);
  return {id:'11111111-1111-4111-8111-111111111111',title:'Terms',text,content_type:'text/plain',size_bytes:bytes.length,source_sha256,
    license_sha256:await hashLicenseComponentBytes(bytes,{kind:'license',code:'custom',version:'1',params:{ai_training:aiTraining,source_sha256}}),status:'active'};
}

it('posts JSON text with a boolean and verifies canonical UTF-8 source and component hashes',async()=>{
  const response=await responseFor('A\nB\n',false);
  client.post.mockResolvedValue({data:response});
  expect(await submitCustomLicenseText(' Terms ','A  \r\nB',false)).toEqual(response);
  expect(client.post).toHaveBeenCalledWith('/licenses/custom',{title:' Terms ',ai_training:false,text:'A  \r\nB'},{headers:{'Content-Type':'application/json'}});
  for(const damaged of [{...response,text:'A  \nB\n'},{...response,size_bytes:3},{...response,source_sha256:'0'.repeat(64)},{...response,license_sha256:'0'.repeat(64)},{...response,content_type:'application/pdf'},{...response,extra:1}]) {
    client.post.mockResolvedValue({data:damaged});
    await expect(submitCustomLicenseText('Terms','A\nB\n',false)).rejects.toThrow('could not be verified');
  }
});

it.each([
  ['A  \r\nB','A\nB\n','daee1cd25194ae952d046ad9b9c81d3c07dc5332440b58d6d7461b248be56712','089b5fc383a91cab83bcd343b4d84088ffa88bee1e0722b2aacb6f4e35488a88','a46e8d2b14a1a242b46fd0f90909c4bf8e890491944c4ff330b54da5481cb215'],
  ['Cafe\u0301\rC\t\n\n','Café\nC\n','d46134a41760f4f038325c0b69df0cb47cd171208d26ecb6dd8c8871abea7515','01e47cbea636183300c55bf3a5ca48968b5dd164f71853c94867f8d673da8786','8103af7dfc67d05124e2bd28552035d8b34d4957b6acb0fca6d7603a9109892c'],
])('checks the published LF, TAB, NFC and trailing-space vector',async(input,canonical,source,trueHash,falseHash)=>{
  for(const [training,hash] of [[true,trueHash],[false,falseHash]] as const){
    const response={...await responseFor(canonical,training),source_sha256:source,license_sha256:hash};
    client.post.mockResolvedValue({data:response});
    expect((await submitCustomLicenseText('Terms',input,training)).text).toBe(canonical);
  }
});

it('enforces the code-point counter boundary before sending',async()=>{
  client.post.mockResolvedValue({data:await responseFor('😀'.repeat(65_535)+'\n',true)});
  await submitCustomLicenseText('Terms','😀'.repeat(65_535),true);
  expect(client.post).toHaveBeenCalledTimes(1);
  await expect(submitCustomLicenseText('Terms','😀'.repeat(65_536),true)).rejects.toThrow('LICENSE_SIZE_INVALID');
  expect(client.post).toHaveBeenCalledTimes(1);
});
