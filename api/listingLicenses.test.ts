// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
import {createStandardSelection,LICENSE_HASHES,licenseDocumentPath,uploadCustomLicense} from './listingLicenses';
import vectors from './fixtures/s1735-backend-hash-vectors.json';
const client=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('./client',()=>({api:client}));
beforeEach(()=>vi.resetAllMocks());

it('pins the reviewed standard, rider and covenant vectors',()=>{
  expect(createStandardSelection(true).license_sha256).toBe(vectors.standard_true);
  expect(createStandardSelection(false).license_sha256).toBe(vectors.standard_false);
  expect(LICENSE_HASHES.rider).toEqual({true:vectors.rider_true,false:vectors.rider_false});
  expect(LICENSE_HASHES.covenant).toBe(vectors.covenant);
  expect(vectors.custom_pdf_true).toBe('80a42b3f3b022e19ce60ad7b2cf59b524877b92320ec49f8af859833764a55f4');
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
