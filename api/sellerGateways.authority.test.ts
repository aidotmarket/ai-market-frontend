import {beforeEach,expect,it,vi} from 'vitest';
import {readAuthorityGatewayFiles} from './sellerGateways';
const get=vi.hoisted(()=>vi.fn());
vi.mock('./client',()=>({api:{get}}));
beforeEach(()=>get.mockReset());
it('takes the revision from every selection page, never from gateway detail',async()=>{
 get.mockResolvedValueOnce({data:{files:[{file_id:'a'}],next_cursor:'next',gateway_metadata_revision:7}})
 .mockResolvedValueOnce({data:{files:[{file_id:'b'}],next_cursor:null,gateway_metadata_revision:7}});
 expect(await readAuthorityGatewayFiles('gateway')).toEqual({files:[{file_id:'a'},{file_id:'b'}],revision:7});
 expect(get.mock.calls.map(c=>c[0])).toEqual(['/gateways/gateway/files','/gateways/gateway/files']);
});
it('rejects changing revisions instead of mixing selection pages',async()=>{
 get.mockResolvedValueOnce({data:{files:[{file_id:'a'}],next_cursor:'next',gateway_metadata_revision:7}})
 .mockResolvedValueOnce({data:{files:[{file_id:'b'}],next_cursor:null,gateway_metadata_revision:8}});
 await expect(readAuthorityGatewayFiles('gateway')).rejects.toThrow('AUTHORITY_PURCHASER_STALE');
});
it.each([undefined,-1,1.5])('offers no guessed revision (%s)',async revision=>{
 get.mockResolvedValue({data:{files:[],next_cursor:null,gateway_metadata_revision:revision}});
 if(revision===undefined)expect(await readAuthorityGatewayFiles('gateway')).toBeNull();
 else await expect(readAuthorityGatewayFiles('gateway')).rejects.toThrow();
});
it('refuses duplicate files and cursor cycles',async()=>{
 get.mockResolvedValue({data:{files:[{file_id:'a'}],next_cursor:'same',gateway_metadata_revision:1}});
 await expect(readAuthorityGatewayFiles('gateway')).rejects.toThrow('AUTHORITY_PURCHASER_STALE');
});
