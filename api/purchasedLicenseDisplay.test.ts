import {it,expect,vi,beforeEach} from 'vitest';
import wire from '@/tests/fixtures/s1922-backend-wire.json';
import {parsePurchasedLicenseDisplay,getPurchasedLicenseDisplay} from './purchasedLicenseDisplay';
import {AxiosError} from 'axios';
const client=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('./client',()=>({api:client}));
beforeEach(()=>vi.resetAllMocks());
it('only treats an actual HTTP 404 as missing; cancellation and other errors still reject',async()=>{
 const f=wire.purchased[0],controller=new AbortController();
 const missing=new AxiosError('missing',undefined,undefined,undefined,{status:404} as never);
 client.get.mockRejectedValue(missing);
 await expect(getPurchasedLicenseDisplay(f.order_id,f.listing_id,controller.signal)).resolves.toBeNull();
 controller.abort();
 await expect(getPurchasedLicenseDisplay(f.order_id,f.listing_id,controller.signal)).rejects.toThrow();
 for(const error of [new Error('transport'),{response:{status:404}},new AxiosError('forbidden',undefined,undefined,undefined,{status:403} as never)]){
  client.get.mockRejectedValue(error);
  await expect(getPurchasedLicenseDisplay(f.order_id,f.listing_id,new AbortController().signal)).rejects.toBe(error);
 }
});
it.each(wire.purchased)('consumes actual purchased $instrument_display.license_version / $retained_presentation.presentation.presentation_version independently of current display',async fixture=>{
 const before=JSON.stringify(fixture);
 const value=await parsePurchasedLicenseDisplay(fixture,fixture.order_id,fixture.listing_id);
 expect(value.instrument_display?.license_label).toContain(fixture.instrument_display!.license_version);
 expect(value.retained_presentation?.presentation.rendered_html).toContain('ai.market Standard Data Licence v1.0');
 expect(value.original_license).toEqual(fixture.original_license);
 expect(JSON.stringify(fixture)).toBe(before);
});
it.each(wire.purchased)('accepts entitlement-gated HTML for $retained_presentation.presentation.presentation_version without dropping evidence',async f=>{
 const gated={...f,retained_presentation:{...f.retained_presentation!,presentation:{...f.retained_presentation!.presentation,rendered_html:null}}};
 await expect(parsePurchasedLicenseDisplay(gated,f.order_id,f.listing_id)).resolves.toEqual(gated);
});
it('still validates all other gated evidence fields',async()=>{
 const f=wire.purchased[0];
 const presentation={...f.retained_presentation!.presentation,rendered_html:null};
 const retained={...f.retained_presentation!,presentation};
 const gated={...f,retained_presentation:retained};
 const missing:Record<string,unknown>={...presentation};delete missing.render_hash;
 for(const bad of [
  {...gated,original_snapshot_hash:'BAD'},
  {...gated,instrument_display:{...f.instrument_display,notice:'changed'}},
  {...gated,retained_presentation:{...retained,publication_id:'BAD'}},
  {...gated,retained_presentation:{...retained,approval_id:'BAD'}},
  {...gated,retained_presentation:{...retained,provenance:'changed'}},
  {...gated,retained_presentation:{...retained,original_render_hash:'BAD'}},
  {...gated,retained_presentation:{...retained,notice:'changed'}},
  ...[missing,{...presentation,presentation_version:'unknown'},{...presentation,render_hash:'BAD'},
   {...presentation,extra:true},{...presentation,presentation_kind:undefined},
   {...wire.public[0].corrected,rendered_html:null}].map(presentation=>({...gated,retained_presentation:{...retained,presentation}})),
 ]) await expect(parsePurchasedLicenseDisplay(bad,f.order_id,f.listing_id)).rejects.toThrow();
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
