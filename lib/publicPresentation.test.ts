import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import wire from '@/tests/fixtures/s1922-backend-wire.json';
import {verifyPresentation, verifyPublicPresentation, verifyCurrentListing, readLicenseDisplay, correctionFields, CORRECTION_KIND} from './publicPresentation';
const digest=(html:string)=>createHash('sha256').update(html,'utf8').digest('hex');
describe('actual backend19ff184 original and corrected presentation readers',()=>{
  it.each(wire.public)('rejects null HTML on public $original.presentation_version presentations',async fixture=>{
    for(const presentation of [fixture.original,fixture.corrected]) {
      await expect(verifyPresentation({...presentation,rendered_html:null})).rejects.toThrow();
      await expect(verifyCurrentListing({id:fixture.corrected.listing_id,approved_presentation:{...presentation,rendered_html:null}})).rejects.toThrow();
    }
  });
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
  it.each(wire.public)('projects additive public fields for $original.presentation_version with a strict verifier default', async fixture => {
    for (const presentation of [fixture.original, fixture.corrected]) {
      const known = {...presentation, approved_display_html: '<p>Coverage</p>', presentation_display_version: 'approved-display-v1'};
      const additive = {...known, future_metadata: {enabled: true}};
      await expect(verifyPublicPresentation(additive)).resolves.toEqual(known);
      await expect(verifyPresentation(additive)).rejects.toThrow('The approved listing presentation could not be verified');
      expect(additive.future_metadata).toEqual({enabled: true});
    }
    await expect(verifyCurrentListing({id: fixture.corrected.listing_id,
      approved_presentation: {...fixture.original, future_metadata: true}})).resolves.toBeUndefined();
  });
  it('rejects correction and envelope fields in original public evidence with additive fields', async () => {
    const {original, corrected} = wire.public[0];
    const approved = {...original, future_metadata: true};
    for (const key of [...correctionFields, 'license_display', 'public_presentation', 'approved_presentation']) {
      await expect(verifyCurrentListing({id: corrected.listing_id, approved_presentation: {...approved, [key]: null}}))
        .rejects.toThrow('The approved listing presentation could not be verified');
    }
  });
  it.each(['license_display', 'public_presentation', 'approved_presentation'])(
    'rejects a nested %s inside a corrected public presentation with additive fields', async key => {
      const {corrected, license_display} = wire.public[2];
      const listing = {id: corrected.listing_id, license_display,
        approved_presentation: {...corrected, future_metadata: {enabled: true}}};
      await expect(verifyCurrentListing(listing)).resolves.toBeUndefined();
      await expect(verifyCurrentListing({...listing,
        approved_presentation: {...listing.approved_presentation, [key]: null}}))
        .rejects.toThrow('The approved listing presentation could not be verified');
    },
  );
  it('accepts future metadata in a standalone licence display and rejects misplaced known fields', async () => {
    const {corrected, license_display} = wire.public[2];
    const display = {...license_display, future_metadata: {enabled: true}};
    const listing = {id: corrected.listing_id, license: corrected.license_label, license_display: display};
    await expect(verifyCurrentListing(listing)).resolves.toBeUndefined();
    const misplaced = {
      ...Object.fromEntries(Object.entries(corrected).filter(([key]) => !(key in license_display))),
      sample_files: null, approved_display_html: null, presentation_display_version: null,
      license_display: null, public_presentation: null, approved_presentation: null,
    };
    for (const [key, value] of Object.entries(misplaced)) {
      await expect(verifyCurrentListing({...listing, license_display: {...display, [key]: value}}))
        .rejects.toThrow('Current licence display could not be verified');
    }
  });
  it('requires every correction field and refuses unknown, null, partial, excess and malformed variants',async()=>{
    const c=wire.public[2].corrected;
    for(const key of correctionFields){
      const missing:Record<string,unknown>={...c};delete missing[key];
      await expect(verifyPresentation(missing)).rejects.toThrow();
      await expect(verifyPresentation({...c,[key]:null})).rejects.toThrow();
      await expect(verifyPublicPresentation({...missing, future_metadata: true})).rejects.toThrow();
      await expect(verifyPublicPresentation({...c, [key]: null, future_metadata: true})).rejects.toThrow();
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
    const listing={id:c.listing_id,publication_id:c.publication_id,listing_version_id:c.listing_version_id,approval_id:c.approval_id,
      approved_presentation:{...c,future_metadata:true},license:c.license_label,license_display:{...display,future_metadata:true}};
    expect(readLicenseDisplay(listing.license_display)).toEqual(display);
    await expect(verifyCurrentListing(listing)).resolves.toBeUndefined();
    for(const key of ['id','publication_id','listing_version_id','approval_id'])await expect(verifyCurrentListing({...listing,[key]:'ffffffff-ffff-ffff-ffff-ffffffffffff'})).rejects.toThrow();
    for (const key of Object.keys(display)) {
      const missing: Record<string, unknown> = {...listing.license_display};
      delete missing[key];
      expect(() => readLicenseDisplay(missing)).toThrow('Current licence display could not be verified');
      expect(() => readLicenseDisplay({...listing.license_display, [key]: 'invalid'})).toThrow('Current licence display could not be verified');
    }
    await expect(verifyCurrentListing({...listing,license_display:{...listing.license_display,correction_digest:'a'.repeat(64)}})).rejects.toThrow('Inconsistent current licence display');
    await expect(verifyCurrentListing({...listing,license:'ai.market Standard Data Licence v1.0'})).rejects.toThrow('Inconsistent current licence label');
    await expect(verifyCurrentListing({...listing,approved_presentation:wire.public[2].original})).rejects.toThrow();
    expect(c.presentation_kind).toBe(CORRECTION_KIND);
  });
  it('still checks required HTML, version, hash and display fields with additive fields', async () => {
    for (const presentation of [wire.public[0].original, wire.public[0].corrected]) {
      for (const [key, invalid] of Object.entries({presentation_version: 'seller-listing-review-v5',
        rendered_html: presentation.rendered_html + 'tampered', render_hash: 'a'.repeat(64),
        approved_display_html: 42, presentation_display_version: 'unknown'})) {
        await expect(verifyPublicPresentation({...presentation, [key]: invalid, future_metadata: true})).rejects.toThrow();
      }
      for (const key of ['presentation_version', 'rendered_html', 'render_hash']) {
        const missing: Record<string, unknown> = {...presentation, future_metadata: true};
        delete missing[key];
        await expect(verifyPublicPresentation(missing)).rejects.toThrow();
      }
    }
  });
});


it.each(wire.public)('accepts optional approved display fields without changing immutable evidence $original.presentation_version', async fixture => {
  for (const original of [fixture.original, fixture.corrected]) {
    const display = {...original, approved_display_html: '<h2>Coverage</h2><ul><li>Region</li></ul>', presentation_display_version: 'approved-display-v1'};
    expect(await verifyPresentation(display)).toEqual(display);
    expect(await verifyPresentation({...original, approved_display_html: null, presentation_display_version: null})).toMatchObject(original);
    await expect(verifyPresentation({...display, rendered_html: original.rendered_html + 'tampered'})).rejects.toThrow();
    await expect(verifyPresentation({...display, approved_display_html: 42})).rejects.toThrow();
    await expect(verifyPresentation({...display, presentation_display_version: 'unknown'})).rejects.toThrow();
    const missingVersion: Record<string, unknown> = {...display};
    delete missingVersion.presentation_display_version;
    await expect(verifyPresentation(missingVersion)).rejects.toThrow();
    await expect(verifyPresentation({...display, presentation_display_version: null})).rejects.toThrow();
  }
});
