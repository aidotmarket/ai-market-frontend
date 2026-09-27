import {beforeEach,expect,it,vi} from 'vitest';
import {getSellerLegalIdentity,refreshSellerLegalIdentity,saveSellerLegalIdentity,legalIdentityFailure} from './sellerLegalIdentity';

const transport=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}));
vi.mock('./client',()=>({api:transport}));
beforeEach(()=>vi.clearAllMocks());

it('uses the three owner scoped legal identity endpoints and carries the expected version',async()=>{
  const known={status:'known',source:'seller_typed',legal_name:'Seller',jurisdiction:'GB',version:3};
  transport.get.mockResolvedValue({data:known});transport.post.mockResolvedValue({data:known});transport.put.mockResolvedValue({data:known});
  expect(await refreshSellerLegalIdentity()).toEqual(known);
  expect(await getSellerLegalIdentity()).toEqual(known);
  expect(await saveSellerLegalIdentity('Seller','GB',2)).toEqual(known);
  expect(transport.post).toHaveBeenCalledWith('/seller-workspace/legal-identity/refresh');
  expect(transport.get).toHaveBeenCalledWith('/seller-workspace/legal-identity');
  expect(transport.put).toHaveBeenCalledWith('/seller-workspace/legal-identity',{legal_name:'Seller',jurisdiction:'GB',expected_version:2});
});
it.each([
  [409,'LEGAL_IDENTITY_CONFLICT','conflict'],
  [409,'SELLER_LEGAL_IDENTITY_REQUIRED','required'],
  [503,'IDENTITY_SERVICE_UNAVAILABLE','unavailable'],
  [503,'OTHER_SERVICE_UNAVAILABLE','other'],
  [409,'REVIEW_STALE','other'],
])('maps HTTP %s detail code %s', (status,code,expected)=>{
  expect(legalIdentityFailure({response:{status,data:{detail:{code}}}})).toBe(expected);
});
