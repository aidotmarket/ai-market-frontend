// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
import {createStandardSelection,LICENSE_HASHES,licenseDocumentPath,publishedCustomLicense,uploadCustomLicense} from './listingLicenses';
import vectors from './fixtures/s1735-backend-hash-vectors.json';
const client=vi.hoisted(()=>({post:vi.fn(),get:vi.fn()}));
vi.mock('./client',()=>({api:client}));
beforeEach(()=>vi.resetAllMocks());

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

it('posts the custom document with an explicit training boolean and verifies every returned hash',async()=>{
  const file=new File(['terms'],'terms.txt',{type:'text/plain'});
  const response={id:'11111111-1111-4111-8111-111111111111',title:'terms.txt',content_type:'text/plain',size_bytes:file.size,source_sha256:'2'.repeat(64),license_sha256:'1'.repeat(64),status:'active'};
  client.post.mockResolvedValue({data:response});
  expect(await uploadCustomLicense(file,false)).toEqual(response);
  const body=client.post.mock.calls[0][1] as FormData;
  expect(client.post.mock.calls[0][0]).toBe('/licenses/custom');expect(body.get('upload')).toBe(file);expect(body.get('title')).toBe('terms.txt');expect(body.get('ai_training')).toBe('false');
  client.post.mockResolvedValue({data:{...response,license_sha256:'not-a-hash'}});
  await expect(uploadCustomLicense(file,true)).rejects.toThrow('could not be verified');
});
it('reads a published custom document from the authenticated listing-scoped route',async()=>{
 const document=new Blob(['seller terms'],{type:'text/plain'});
 client.get.mockResolvedValue({data:document});
 expect(await publishedCustomLicense('11111111-1111-4111-8111-111111111111')).toBe(document);
 expect(client.get).toHaveBeenCalledWith('/listings/11111111-1111-4111-8111-111111111111/license-document',{responseType:'blob'});
});
