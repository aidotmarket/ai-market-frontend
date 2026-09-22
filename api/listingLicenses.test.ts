// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
import {createStandardSelection,LICENSE_HASHES,uploadCustomLicense} from './listingLicenses';
const client=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('./client',()=>({api:client}));
beforeEach(()=>vi.resetAllMocks());

it('pins the reviewed standard, rider and covenant vectors',()=>{
  expect(createStandardSelection(true).license_sha256).toBe('4b05dbcd0c186746d3deab6c68beaebba88610de8e85122efb4d527edb1263c6');
  expect(createStandardSelection(false).license_sha256).toBe('e83e03bb731fee832d108ef77689f7ff49e3409f88124b483b2ef34ca7ba3821');
  expect(LICENSE_HASHES.rider).toEqual({true:'f9785144dc4d48af6446512cbabd03431a35015d71b92260f4dcfab164084140',false:'8878e2fb3327378e90a1d9206da9aa2b419255872cdfa6a883c0d2688f768416'});
  expect(LICENSE_HASHES.covenant).toBe('a91234b67bf7467a0c80f6e1caa47b563032e94751146901b796eaaf220431af');
});

it('posts the custom document with an explicit training boolean and verifies every returned hash',async()=>{
  const response={license_document_id:'11111111-1111-4111-8111-111111111111',license_sha256:'1'.repeat(64),rider_sha256:'2'.repeat(64),covenant_sha256:'3'.repeat(64)};
  client.post.mockResolvedValue({data:response});const file=new File(['terms'],'terms.txt',{type:'text/plain'});
  expect(await uploadCustomLicense(file,false)).toEqual(response);
  const body=client.post.mock.calls[0][1] as FormData;
  expect(client.post.mock.calls[0][0]).toBe('/licenses/custom');expect(body.get('file')).toBe(file);expect(body.get('ai_training')).toBe('false');
  client.post.mockResolvedValue({data:{...response,license_sha256:'not-a-hash'}});
  await expect(uploadCustomLicense(file,true)).rejects.toThrow('could not be verified');
});
