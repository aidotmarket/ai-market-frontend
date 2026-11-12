"""Execute backend19ff184 saved-review production functions, offline.

Usage: PYTHONPATH=<installed backend packages> python3 this_file.py <backend checkout>
Reuse its isolated harness; SQL expressions use owned mapped doubles, never an
engine. Execute the real prepare, discover_approved_review, review, review_files,
source_page and approval_receipt functions. Route decorators/dependency defaults
are omitted via AST to avoid application/configuration startup, not HTTP-tested.
"""
import ast
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import runpy
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

backend = Path(sys.argv[1])
ns = runpy.run_path(str(backend / 'tests/isolated_s1922/test_license_display.py'))
load, package, mapped = ns['load'], ns['package'], ns['mapped']
settings = ns['settings']
package('app.schemas', backend / 'app/schemas')
load('app.schemas.pricing', 'app/schemas/pricing.py')
load('app.schemas.license_selection', 'app/schemas/license_selection.py')
load('app.services.listing_write_normalization', 'app/services/listing_write_normalization.py')
User = mapped('ReviewUser', 'review_users', set())
sys.modules['app.models'].User = User
Source = mapped('ReviewSource', 'review_sources', {'seller_id', 'draft_id', 'version', 'input_hash', 'connection_id', 'connection_version'})
Draft = mapped('ReviewDraft', 'review_drafts', {'seller_id', 'draft_id', 'listing_id', 'base_listing_version_id'})
Connection = mapped('ReviewConnection', 'review_connections', {'seller_id', 'version', 'status'})
package('app.models.seller_listing_source', SellerListingSource=Source)
package('app.models.seller_listing_draft', SellerListingDraft=Draft)
package('app.models.seller_workspace', CloudConnection=Connection)
categories = [{'slug': 'consumer-retail', 'name': 'Consumer & Retail'}]
package('app.api', backend / 'app/api')
package('app.api.v1', backend / 'app/api/v1')
package('app.api.v1.endpoints', backend / 'app/api/v1/endpoints')
package('app.api.v1.endpoints.datasets', list_categories=lambda db: categories)
seller_id, draft_id = UUID(int=901), UUID(int=902)
sys.modules['app.services.seller_listing_lineage'].draft_id_for = AsyncMock(return_value=draft_id)


def route_functions(namespace):
    path = backend / 'app/api/v1/endpoints/seller_listing_review.py'
    tree = ast.parse(path.read_text())
    names = {'approval_receipt', 'approval_ready', 'discover_approved_review', 'review', 'review_files'}
    nodes = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
    assert {node.name for node in nodes} == names
    for node in nodes:
        node.decorator_list = []
        node.args.defaults = [ast.Constant(None) for _ in node.args.defaults]
        node.returns = None
        for arg in node.args.args:
            arg.annotation = None
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])), str(path), 'exec'), namespace)


class Object:
    def __init__(self, index):
        self.value = dict(key=f'synthetic/source-{index}.csv', size=42, etag=f'synthetic-{index}', version_id=None)
        self.size = 42

    def model_dump(self, **kwargs):
        return dict(self.value)

    def model_dump_json(self):
        return json.dumps(self.value)


async def generate():
    fixtures = []
    for enabled in (False, True):
        settings.LISTING_LICENSES_ENABLED = enabled
        confirmations = load('app.services.seller_listing_confirmations', 'app/services/seller_listing_confirmations.py')
        service = load('app.services.seller_listing_review', 'app/services/seller_listing_review.py')
        pages = load('app.services.seller_listing_review_pages', 'app/services/seller_listing_review_pages.py')
        schema = load('app.schemas.seller_listing_approval', 'app/schemas/seller_listing_approval.py')
        for template in (2, 3, 4):
            for bound, legacy in ((False, False), (True, False), (False, True)):
                selection = dict(kind='standard', version='1.1', ai_training=True, license_document_id=None,
                    license_sha256='881266a455d100e6b263ec121523001e5e53f6e3bf3bd97047e29ae39f8959fb', rider_sha256=None,
                    covenant_code='marketplace-listing', covenant_version='1.1',
                    covenant_sha256='58eff1def7acb59db75920fe0da89a3f4f87bb12bd6765ec8eae231bbea118b5',
                    seller_acceptance=dict(signer_name='Synthetic Seller', signer_title='Owner', authority_confirmed=True))
                # Saved draft content uses the production selection serializer,
                # including nullable identity_version (not a frontend-only mock).
                selection = schema.LicenseSelection.model_validate(selection).model_dump(mode='json')
                content = dict(title='Synthetic saved offer', description='Original seller description', category='consumer-retail',
                    tags='synthetic,retail', price='25.00', license='Research', **({'license_selection': selection} if enabled else {}))
                source = SimpleNamespace(version=2, input_hash='e'*64, connection_id=UUID(int=903), connection_version=1)
                draft = SimpleNamespace(content=content, draft_id=draft_id, listing_id=UUID(int=904) if bound else None,
                    base_listing_version_id=UUID(int=905) if bound else None, version=3)
                base = SimpleNamespace(public_fields=dict(license='ai.market Standard Data Licence v1.0', category='consumer-retail'))

                class DB:
                    row = None

                    async def execute(self, statement):
                        sql = str(statement)
                        if 'review_sources' in sql:
                            value = source
                        elif 'review_connections' in sql:
                            value = SimpleNamespace(status='verified', version=1)
                        elif 'review_drafts' in sql:
                            value = draft
                        elif 'seller_listing_approvals' in sql:
                            if 'JOIN' in sql:
                                value = base
                            elif 'review_hash =' in sql:
                                value = self.row if self.row and statement.compile().params.get('review_hash_1') == self.row.review_hash else None
                            else:
                                value = self.row
                        else:
                            value = None  # synthetic owner-lock result
                        return ns['Result'](value)

                    async def run_sync(self, function):
                        return function(None)

                db = DB()
                version = f'seller-listing-review-v{template}'
                original = await service.SellerListingReviewService(db).prepare(seller_id, draft_id,
                    legacy_binding=legacy, presentation_version=version)
                assert original['missing_fields'] == []
                db.row = SimpleNamespace(id=UUID(int=906), draft_id=None if legacy else draft_id,
                    presentation_version=version, public_fields=original['fields'], review_hash=original['review_hash'],
                    render_hash=original['render_hash'], draft_version=3, source_version=2,
                    sample_decision='none', approved_at=datetime(2026, 11, 10, tzinfo=timezone.utc))
                sources = SimpleNamespace(read=AsyncMock(return_value=SimpleNamespace(connection_current=True, version=2,
                    content=SimpleNamespace(objects=[Object(index) for index in range(3)]))))
                namespace = dict(service.__dict__, source_page=pages.source_page, SellerListingApproval=ns['approval'].SellerListingApproval,
                    ListingApprovalReceipt=schema.ListingApprovalReceipt, SourceConflict=type('SourceConflict', (Exception,), {}),
                    UUID=UUID, or_=__import__('sqlalchemy').or_)
                route_functions(namespace)
                review = await namespace['review'](SimpleNamespace(state=SimpleNamespace(auth_method='jwt')), draft_id=draft_id,
                    page_size=2, seller=SimpleNamespace(id=seller_id), db=db,
                    config=SimpleNamespace(approval_enabled=True, require_storage=lambda **kwargs: None), sources=sources)
                assert review['review_hash'] == original['review_hash'] and review['approval']['id'] == str(db.row.id)
                next_page = await namespace['review_files'](draft_id=draft_id, cursor=review['source_page']['next_cursor'],
                    seller=SimpleNamespace(id=seller_id), db=db, sources=sources)
                fixtures.append(dict(name=f'v{template}-{"bound" if bound else "legacy" if legacy else "fresh"}-licenses-{enabled}',
                    legacy_binding=legacy, review=deepcopy(review), next_page=next_page))
    return fixtures


paths = ['app/services/seller_listing_review.py', 'app/api/v1/endpoints/seller_listing_review.py',
    'app/services/seller_listing_review_pages.py', 'app/schemas/seller_listing_approval.py',
    'app/services/seller_listing_confirmations.py', 'app/services/seller_listing_render.py']
result = dict(backend_head='19ff184444425979a861f4f75152fac1f959f9c2',
    source_sha256={path: hashlib.sha256((backend / path).read_bytes()).hexdigest() for path in paths},
    fixtures=asyncio.run(generate()))
Path(__file__).with_name('fixtures').joinpath('s1922-saved-review-wire.json').write_text(json.dumps(result, indent=2) + '\n')
print(f'Generated {len(result["fixtures"])} saved-review/receipt/pagination fixtures from production functions; no DB/app startup')
