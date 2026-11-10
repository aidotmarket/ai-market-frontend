import {it,expect,vi,beforeEach} from 'vitest';
import wire from '@/tests/fixtures/s1922-backend-wire.json';
import {parsePurchasedLicenseDisplay,getPurchasedLicenseDisplay} from './purchasedLicenseDisplay';
const client=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('./client',()=>({api:client}));
beforeEach(()=>vi.resetAllMocks());
it.each(wire.purchased)('consumes actual purchased $instrument_display.license_version / $retained_presentation.presentation.presentation_version independently of current display',async fixture=>{
 const before=JSON.stringify(fixture);
 const value=await parsePurchasedLicenseDisplay(fixture,fixture.order_id,fixture.listing_id);
 expect(value.instrument_display?.license_label).toContain(fixture.instrument_display!.license_version);
 expect(value.retained_presentation?.presentation.rendered_html).toContain('ai.market Standard Data Licence v1.0');
 expect(value.original_license).toEqual(fixture.original_license);
 expect(JSON.stringify(fixture)).toBe(before);
});
it('refuses foreign, unknown, tampered or correction evidence in the purchased contract',async()=>{
 const f=wire.purchased[2];
 for(const bad of [{...f,order_id:wire.purchased[0].order_id},{...f,listing_id:wire.purchased[0].listing_id},
  {...f,presentation_kind:'unknown'},{...f,original_snapshot_hash:'BAD'},
  {...f,instrument_display:{...f.instrument_display,license_label:'ai.market Standard Data Licence v1.0'}},
  {...f,retained_presentation:{...f.retained_presentation,presentation:wire.public[2].corrected}},
  {...f,retained_presentation:{...f.retained_presentation,presentation:{...wire.public[2].original,rendered_html:'tampered'}}}])
   await expect(parsePurchasedLicenseDisplay(bad,f.order_id,f.listing_id)).rejects.toThrow();
});
it('uses private no-store transport and refuses missing response privacy, preserving original evidence',async()=>{
 const f=wire.purchased[0],signal=new AbortController().signal;
 client.get.mockResolvedValue({data:f,headers:{'cache-control':'private, no-store'}});
 await expect(getPurchasedLicenseDisplay(f.order_id,f.listing_id,signal)).resolves.toEqual(f);
 expect(client.get).toHaveBeenCalledWith(`/orders/${f.order_id}/license-display`,{signal,adapter:'fetch',fetchOptions:{cache:'no-store'}});
 for(const policy of ['', 'public, max-age=900','no-store']){
  client.get.mockResolvedValue({data:f,headers:{'cache-control':policy}});
  await expect(getPurchasedLicenseDisplay(f.order_id,f.listing_id,signal)).rejects.toThrow('must not be cached');
 }
});
