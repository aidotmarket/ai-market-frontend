"""Offline real detail builder/model/projection/JSON fixture, backend 1ad9300.

No app/config/DB startup. The unchanged route builder body is AST-loaded.
Synthetic ports: DB snapshot/query, contact detector, seller identity, reference
licence policy, privacy/verification. Actual correction admission, transform,
record digest, current_display, project_current_model and full public Pydantic
serializer execute. Native persistence/HTTP authorization are separate proof.
"""
import ast
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import runpy
import sys
import types
from unittest.mock import AsyncMock, patch
from uuid import UUID

backend = Path(sys.argv[1]).resolve()
ns = runpy.run_path(str(backend / 'tests/isolated_s1922/test_license_display.py'))
count = 10000
def identity():
    global count
    count += 1
    return UUID(int=count)
ns['fixture'].__globals__['uuid4'] = identity
ns['ReadTests'].snapshot.__globals__['uuid4'] = identity
settings = ns['settings']
settings.LISTING_LICENSES_ENABLED = False
settings.MARKETPLACE_SELLER_PRESENTATION_ENABLED = True
package, load = ns['package'], ns['load']
package('services', backend / 'services')
package('services.gateway_signer', backend / 'services/gateway_signer')
package('app.schemas', backend / 'app/schemas')
# Only this real base serializer is needed; avoid unrelated preview imports.
from pydantic import BaseModel, model_serializer
summary_ns = dict(BaseModel=BaseModel, model_serializer=model_serializer)
def extract(path, names, scope):
    tree = ast.parse((backend / path).read_text())
    nodes = [n for n in tree.body if isinstance(n,(ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names]
    assert len(nodes) == len(names)
    for node in nodes:
        if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
            node.decorator_list=[]  # public text is an explicit synthetic port below
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(backend / path),'exec'),scope)
extract('app/schemas/listing_summary.py', {'SummaryVisibilityModel'}, summary_ns)
package('app.schemas.listing_summary', SummaryVisibilityModel=summary_ns['SummaryVisibilityModel'])
schema = load('app.schemas.listing_public','app/schemas/listing_public.py')
reference = sys.modules['app.services.public_reference']
reference.public_reference_license = lambda row, enabled: {'license': row['license']}
reference.sample_public_fields = lambda row: (_ for _ in ()).throw(AssertionError('not a sample fixture'))
route_ns = dict(vars(schema), json=json, List=list, settings=settings,
    public_listing_text=lambda row: row,
    public_reference=lambda row: None, public_reference_opted_in=lambda row: False,
    publisher_info=lambda *args: schema.PublisherPublicInfo(display_name='Synthetic seller',
        schema_version='seller-presentation-v1',name_source='seller_supplied'),
    privacy_display_status=lambda row: 'not_scanned', verification_public_projection=lambda row: None)
extract('app/api/v1/endpoints/public.py', {'_row_to_public_response','_parse_json_field','_coerce_string_list'},route_ns)
service, core = ns['service'], ns['core']
async def generate():
    cases=[]
    for number in (2,3,4):
        version=f'seller-listing-review-v{number}'
        # Production snapshot fixture, with actual contact projection and this
        # supported template. Only read-only DB admission/query is substituted.
        fixture=ns['fixture']
        with patch.dict(ns['ReadTests'].snapshot.__globals__,fixture=lambda: fixture(version,contact=True)):
            snap,record,state=ns['ReadTests']().snapshot()
        snap=(*snap[:6],version,*snap[7:])
        record.created_at=datetime(2026,11,10,tzinfo=timezone.utc)
        record.digest=service.record_digest(record)
        db=ns['ReadDB'](state,record,pointer=snap[2].id)
        row=dict(snap[3],id=snap[0].id,slug=f'synthetic-composed-v{number}',tags=['one','two'],
            created_at=datetime(2026,11,10,tzinfo=timezone.utc),status='published')
        response=route_ns['_row_to_public_response'](row)
        original=response.model_dump(mode='json')
        with patch.object(service,'_snapshot',AsyncMock(return_value=snap)):
            display=await service.current_display(db,row['id'])
            assert display is not None
            response.approved_presentation=schema.ApprovedListingPresentation.model_validate(display['public_presentation'])
            assert isinstance(response.model_dump()['approved_presentation']['listing_id'],UUID)
            projected=await service.project_current_model(db,row['id'],response,surface='public_detail')
        wire=json.loads(projected.model_dump_json())
        assert wire['license_display']['correction_id']==wire['approved_presentation']['correction_id']
        assert wire['license']==core.TO_LABEL
        assert 'contact@example.invalid' not in wire['approved_presentation']['rendered_html']
        assert snap[5]!=wire['approved_presentation']['original_admitted_render_hash']
        assert original['license']==core.FROM_LABEL
        cases.append(wire)
    return cases
paths=['app/api/v1/endpoints/public.py','app/schemas/listing_public.py','app/schemas/listing_summary.py',
    'app/services/license_display_correction.py','app/services/license_display_transform.py',
    'app/services/seller_listing_public_presentation.py']
result=dict(backend_head='1ad9300bc6c3d4b14c2aad6f46b2694d29d71bd3',
    source_sha256={p:hashlib.sha256((backend/p).read_bytes()).hexdigest() for p in paths},
    synthetic_ports=['snapshot/query','contact detector','seller identity','reference licence policy','privacy/verification','public text'],
    detail=asyncio.run(generate()))
Path(__file__).with_name('fixtures').joinpath('s1922-composed-detail.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('Generated 3 actual builder/Pydantic/projection/JSON detail fixtures; native HTTP/DB not executed')
