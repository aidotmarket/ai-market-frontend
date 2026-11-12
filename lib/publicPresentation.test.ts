import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import wire from '@/tests/fixtures/s1922-backend-wire.json';
import {verifyPresentation, verifyCurrentListing, correctionFields, CORRECTION_KIND} from './publicPresentation';
const digest=(html:string)=>createHash('sha256').update(html,'utf8').digest('hex');
describe('actual backend19ff184 original and corrected presentation readers',()=>{
  it.each(wire.public)('admits supported original and correction $original.presentation_version',async fixture=>{
    const before=JSON.stringify(fixture);
    expect(await verifyPresentation(fixture.original)).toEqual(fixture.original);
    const c=fixture.corrected;
    expect(await verifyPresentation(c,{listing_id:c.listing_id,publication_id:c.publication_id,listing_version_id:c.listing_version_id,approval_id:c.approval_id})).toEqual(c);
    expect(c.original_render_hash).toBe(fixture.frozen.render_hash);
    expect(c.original_admitted_render_hash).toBe(fixture.original.render_hash);
    expect(c.original_render_hash).not.toBe(c.original_admitted_render_hash);
    expect(c.render_hash).not.toBe(c.original_render_hash);
    expect(c.render_hash).toBe(digest(c.rendered_html));
    expect(JSON.stringify(fixture)).toBe(before);
  });
  it('requires every correction field and refuses unknown, null, partial, excess and malformed variants',async()=>{
    const c=wire.public[2].corrected;
    for(const key of correctionFields){
      const missing:Record<string,unknown>={...c};delete missing[key];
      await expect(verifyPresentation(missing)).rejects.toThrow();
      await expect(verifyPresentation({...c,[key]:null})).rejects.toThrow();
    }
    for(const bad of [null,{}, {...c,presentation_kind:'unknown'}, {...c,presentation_version:'seller-listing-review-v5'},
      {...c,provenance:'seller_approved'}, {...c,license_label:'ai.market Standard Data Licence v1.0'}, {...c,extra:true},
      {...c,rendered_html:c.rendered_html+'tampered'}, {...c,render_hash:c.original_admitted_render_hash}])
      await expect(verifyPresentation(bad)).rejects.toThrow();
    for(const key of ['listing_id','publication_id','listing_version_id','approval_id','correction_id'])
      for(const value of ['foreign','00000000-0000-0000-0000-00000000000X',1])await expect(verifyPresentation({...c,[key]:value})).rejects.toThrow();
    for(const key of ['render_hash','original_render_hash','original_admitted_render_hash','correction_digest'])
      for(const value of ['A'.repeat(64),'a'.repeat(63),'g'.repeat(64),1])await expect(verifyPresentation({...c,[key]:value})).rejects.toThrow();
  });
  it('checks UTF8 size rather than character count on both variants',async()=>{
    for(const fixture of [wire.public[0].original,wire.public[2].corrected]){
      const valid='é'.repeat(50000),invalid='é'.repeat(50001);
      expect((await verifyPresentation({...fixture,rendered_html:valid,render_hash:digest(valid)})).rendered_html).toBe(valid);
      await expect(verifyPresentation({...fixture,rendered_html:invalid,render_hash:digest(invalid)})).rejects.toThrow();
    }
  });
  it('binds the actual detail container, adjacent metadata and every independent response identity',async()=>{
    const c=wire.public[2].corrected;
    const display={license_label:c.license_label,provenance:c.provenance,correction_id:c.correction_id,correction_digest:c.correction_digest};
    const listing={id:c.listing_id,publication_id:c.publication_id,listing_version_id:c.listing_version_id,approval_id:c.approval_id,approved_presentation:c,license:c.license_label,license_display:display};
    await expect(verifyCurrentListing(listing)).resolves.toBeUndefined();
    for(const key of ['id','publication_id','listing_version_id','approval_id'])await expect(verifyCurrentListing({...listing,[key]:'ffffffff-ffff-ffff-ffff-ffffffffffff'})).rejects.toThrow();
    await expect(verifyCurrentListing({...listing,license_display:{...display,correction_digest:'a'.repeat(64)}})).rejects.toThrow();
    await expect(verifyCurrentListing({...listing,license:'ai.market Standard Data Licence v1.0'})).rejects.toThrow();
    await expect(verifyCurrentListing({...listing,approved_presentation:wire.public[2].original})).rejects.toThrow();
    expect(c.presentation_kind).toBe(CORRECTION_KIND);
  });
});
