"""Generate synthetic wire fixtures using backend19ff184 production functions.
Usage: PYTHONPATH=<owned backend packages> python3 this_file.py <backend checkout>
Imports the backend isolated harness (module stubs only; no app/DB startup).
"""
import asyncio
import json
from pathlib import Path
import runpy
import sys
from uuid import UUID

backend = Path(sys.argv[1])
ns = runpy.run_path(str(backend / 'tests/isolated_s1922/test_license_display.py'))
# Deterministic synthetic identities; no customer data.
count = 0
def identity():
    global count
    count += 1
    return UUID(int=count)
ns['fixture'].__globals__['uuid4'] = identity
core, admission = ns['core'], ns['admission']
# Enable contact projection only on the harness's in-memory settings stub.
ns['settings'].MARKETPLACE_SELLER_PRESENTATION_ENABLED = True
public = []
for number in (2, 3, 4):
    version = f'seller-listing-review-v{number}'
    fields, raw, listing, original, payload = ns['fixture'](version, contact=True)
    served = admission.validate_public_presentation(dict(listing, license=core.TO_LABEL),
        (payload['corrected_fields'], payload['corrected_html'], payload['corrected_render_hash'], version))
    corrected = core.envelope(payload, correction_id=identity(), correction_digest=core.canonical_hash(payload), original=original, served=served)
    core.verify_public_envelope(original)
    core.verify_public_envelope(corrected)
    public.append(dict(original=original, corrected=corrected, frozen=raw, fields=fields))

async def purchased_fixtures():
    module = ns['load']('app.services.purchased_license_display', 'app/services/purchased_license_display.py')
    results = []
    for version, template in [('1.0', 2), ('1.1', 3), ('1.1', 4)]:
        row, retained = ns['PurchasedDisplayTests']().evidence(version)
        fields, raw, _, _, _ = ns['fixture'](f'seller-listing-review-v{template}')
        retained.update(public_fields=fields, rendered_html=raw['rendered_html'], render_hash=raw['render_hash'], presentation_version=raw['presentation_version'] if 'presentation_version' in raw else f'seller-listing-review-v{template}')
        class DB(ns['ReadDB']):
            async def execute(self, stmt, params):
                return ns['Result'](row if 'FROM orders' in str(stmt) else [retained])
        results.append(await module.purchased_license_display(DB(), row['id'], row['buyer_id']))
    return results

result = dict(backend_head='19ff184444425979a861f4f75152fac1f959f9c2', public=public, purchased=asyncio.run(purchased_fixtures()))
# Generate current JSON-LD through the actual backend emitter, retaining original summary/disclosure data.
ns['package']('app.services.discovery_projection', ListingDiscoveryProjection=type('ListingDiscoveryProjection', (), {}))
ns['package']('app.services.listing_privacy', privacy_display_status=lambda value: 'not_scanned')
sys.modules['app.services.public_seller_identity'].ANONYMOUS_SELLER_NAME = 'Anonymous seller'
sys.modules['app.services.public_reference'].public_reference_jsonld = lambda value: {}
ns['package']('app.services.gateway_file_metadata', encoding_formats=lambda value: [])
jsonld = ns['load']('app.services.jsonld_service', 'app/services/jsonld_service.py')
ns['settings'].LISTING_LICENSES_ENABLED = False
for fixture in public:
    correction = fixture['corrected']
    fixture['license_display'] = {key: correction[key] for key in ('license_label', 'provenance', 'correction_id', 'correction_digest')}
    fixture['at_a_glance'] = {'profile': 'aim-listing-enrichment-profile-v2', 'license': {'value': core.FROM_LABEL, 'provenance': 'seller_entered', 'authority': 'publication_bound', 'source_reference': 'Listing.license', 'source_revision': core.canonical_hash(fixture['fields'])}}
    fixture['jsonld'] = jsonld.generate_listing_jsonld(dict(id=correction['listing_id'], title='Synthetic title', slug='synthetic',
        description='Original seller prose', price=12, license=core.TO_LABEL, at_a_glance=fixture['at_a_glance'],
        disclosure_snapshot={'license': core.FROM_LABEL, 'disclosure_version': 'historical'}, license_display=fixture['license_display']))
Path(__file__).with_name('fixtures').joinpath('s1922-backend-wire.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
