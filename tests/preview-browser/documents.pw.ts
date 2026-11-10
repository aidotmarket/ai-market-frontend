import {test, expect, type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {documentsFixture, documentFixture} from '../listingDocumentsFixture';
import {categoryRows, guidedCapabilities, guidedConnection, guidedObjects} from '../guidedListingFixture';
import type {DocumentKind} from '../../types/listingDocuments';

const id = '00000000-0000-4000-8000-000000000004';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function setup(page: Page) {
  const state = documentsFixture();
  const calls: {path: string; method: string; body: Record<string, unknown> | null}[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let conflict = false, expire = false, refuse = false, renderBudget = false, refreshes = 0;
  const listing = {id, slug: 'synthetic-documents', title: 'Synthetic listing', description: 'Saved description', category: 'Technology', tags: [], pricing: {price: 25, pricing_type: 'one_time'}, status: 'published'};
  const content = {brief: 'Sales', title: listing.title, description: listing.description, category: categoryRows[0].slug, tags: 'sales', price: '25', license: 'Synthetic licence', description_source_version: 1};
  const rendered_html = '<!doctype html><html><body><h1>Synthetic listing</h1><p>Saved description</p></body></html>';
  const approval = {id: '00000000-0000-4000-8000-000000000002', review_hash: 'c'.repeat(64), render_hash: hash(rendered_html), draft_version: 1, source_version: 1, sample_decision: 'none', approved_at: '2026-11-01T00:00:00Z'};
  const publication = {id: '00000000-0000-4000-8000-000000000003', approval_id: approval.id, listing_id: id, listing_version_id: '00000000-0000-4000-8000-000000000005', title: listing.title, slug: listing.slug, status: 'published', is_listed: true, published_at: '2026-11-01T00:00:00Z', review_hash: approval.review_hash, render_hash: approval.render_hash};
  await page.route('https://api.preview.test/**', async route => {
    const request = route.request(), method = request.method();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const headers = {'access-control-allow-origin': 'http://127.0.0.1:4178', 'access-control-allow-credentials': 'true', 'content-type': 'application/json'};
    if (method === 'OPTIONS') return route.fulfill({status: 204, headers: {...headers, 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': 'authorization,content-type,x-csrf-token'}});
    const body = request.postDataJSON(); calls.push({path, method, body});
    const reply = (value: unknown, status = 200) => route.fulfill({status, headers, body: JSON.stringify(value)});
    if (path === '/auth/refresh') {refreshes++; return reply({access_token: 'test-token'});}
    if (path === `/public/listings/${id}/documents`) return reply(Object.entries(state.documents).flatMap(([kind, value]) => value.published && (kind !== 'data_sheet_pdf' || state.data_sheet_available) ? [value.published] : []));
    if (path.startsWith(`/seller/listings/${id}/documents`)) {
      if (method === 'GET') return reply(state);
      if (expire) {expire = false; return reply({detail: 'Token expired'}, 401);}
      if (refuse) {refuse = false; return reply({detail: 'FIRST_PARTY_SESSION_REQUIRED'}, 403);}
      if (renderBudget) {renderBudget = false; return reply({detail: 'Rendering budget exceeded. Simplify the document.'}, 422);}
      const [, kind, action] = path.split('/documents/')[1].match(/^(.*)\/(.*)$/)!;
      const slot = state.documents[kind as DocumentKind];
      if (conflict) {
        conflict = false;
        slot.max_revision += 1; slot.draft = documentFixture(kind as DocumentKind, {revision: slot.max_revision, title: 'Changed in other window'});
        return reply({detail: 'DOCUMENT_REVISION_CONFLICT'}, 409);
      }
      if (action === 'draft') {
        expect(body.expected_revision).toBe(slot.max_revision);
        slot.max_revision++;
        slot.draft = documentFixture(kind as DocumentKind, {...body, revision: slot.max_revision, body_html: '<h2>Server document</h2><p>Exact <strong>server render</strong></p>'});
        return reply(slot.draft);
      }
      if (action === 'publish') {
        expect(body.revision).toBe(slot.draft!.revision); expect(body.render_hash).toBe(slot.draft!.render_hash);
        slot.published = {...slot.draft!, state: 'published', published_at: '2026-11-01T00:00:00Z'}; slot.draft = null;
        return reply(slot.published);
      }
      if (action === 'withdraw') {
        expect(body.revision).toBe(slot.published!.revision);
        slot.withdrawn = {...slot.published!, state: 'withdrawn'}; slot.published = null; return reply(slot.withdrawn);
      }
      const result = slot.draft; slot.draft = null; return reply(result);
    }
    if (path === `/listings/${id}`) return reply(listing);
    if (path === '/seller-workspace/capabilities') return reply({...guidedCapabilities, listing_licenses: false});
    if (path === '/auth/capabilities') return reply({seller: {effective_status: 'active', missing_steps: []}, next_action: null});
    if (path === '/seller-workspace/connections') return reply({connections: [guidedConnection]});
    if (path.endsWith('/source-objects')) return reply({objects: guidedObjects, next_cursor: null});
    if (path === '/seller-workspace/listing-draft') return reply({draft: {version: 1, content, updated_at: '2026-11-01T00:00:00Z'}});
    if (path === '/seller-workspace/listing-source') return reply({source: {version: 1, connection_current: true, content: {connection_id: guidedConnection.id, connection_version: 1, version_mode: 'current', objects: guidedObjects}}});
    if (path === '/seller-workspace/categories') return reply(categoryRows);
    if (path === '/seller-workspace/listing-review') return reply({fields: content, draft_version: 1, source_version: 1, presentation_version: 'seller-listing-review-v3', rendered_html, render_hash: approval.render_hash, review_hash: approval.review_hash, approval_available: false, missing_fields: [], confirmation_version: 'seller-listing-confirmation-v1', confirmation_statements: {}, sample_decision: 'none', sample_status: 'not_selected', approval, source_hash: 'd'.repeat(64)});
    if (path === '/seller-workspace/listing-publication') return reply({publication_available: true, publication});
    if (path === '/seller-workspace/listing-publications') return reply({items: [publication], page: 0, has_more: false});
    return reply({detail: 'Unavailable in synthetic test'}, 404);
  });
  return {state, calls, errors, conflict: () => {conflict = true;}, expire: () => {expire = true;}, refuse: () => {refuse = true;}, budget: () => {renderBudget = true;}, refreshes: () => refreshes};
}

for (const mode of ['legacy', 'workspace']) for (const width of [1280, 390]) test(`${mode} at ${width}px: seller adds, previews, publishes, replaces and withdraws both documents`, async ({page}) => {
  await page.setViewportSize({width, height: 1000});
  const fixture = await setup(page);
  await page.goto(`/tests/preview-browser/index.html?documents=${mode}`);
  if (mode === 'workspace') await page.getByRole('button', {name: 'Describe and price', exact: true}).click();
  const documents = page.getByRole('region', {name: 'Documents', exact: true});
  const technical = documents.getByRole('region', {name: 'Technical documentation', exact: true});
  await expect(technical.getByText('Not added', {exact: true})).toBeVisible();
  await technical.getByRole('textbox', {name: 'Technical documentation title'}).fill('Technical guide');
  await technical.getByRole('textbox', {name: 'Technical document', exact: true}).fill('**Client source**');
  fixture.expire();
  await technical.getByRole('button', {name: 'Preview exactly what buyers see'}).click();
  const preview = technical.getByLabel('Technical documentation publication preview');
  await expect(preview.getByRole('heading', {name: 'Server document'})).toBeVisible();
  await expect(preview.locator('strong')).toHaveText('server render');
  expect(fixture.refreshes()).toBe(1);
  await technical.getByRole('button', {name: 'Publish technical document'}).click();
  await expect(technical.getByText(/Published · revision 1/)).toBeVisible();
  await technical.getByRole('button', {name: 'Replace'}).click();
  await technical.getByRole('textbox', {name: 'Technical document', exact: true}).fill('New technical text');
  await technical.getByRole('button', {name: 'Preview exactly what buyers see'}).click();
  await technical.getByRole('button', {name: 'Publish technical document'}).click();
  await expect(technical.getByText(/Published · revision 2/)).toBeVisible();
  await technical.getByRole('button', {name: 'Withdraw'}).click();
  await expect(technical.getByText('Withdrawn', {exact: true})).toBeVisible();

  const pdf = documents.getByRole('region', {name: 'Data sheet', exact: true});
  const bytes = Buffer.from('%PDF-1.7\nSynthetic local data sheet');
  await pdf.getByLabel('Choose PDF (local check only)').setInputFiles({name: 'spec.pdf', mimeType: 'application/pdf', buffer: bytes});
  await expect(pdf.getByText(`SHA-256: ${hash(bytes.toString())}`)).toBeVisible();
  await pdf.getByRole('textbox', {name: 'Data sheet title'}).fill('Data sheet');
  await pdf.getByRole('textbox', {name: 'Public PDF address'}).fill('https://cdn.example.com/spec.pdf');
  await pdf.getByRole('button', {name: 'Preview exactly what buyers see'}).click();
  await pdf.getByRole('button', {name: 'Publish data sheet'}).click();
  await expect(pdf.getByText(/Published · revision 1/)).toBeVisible();
  await pdf.getByRole('button', {name: 'Replace'}).click();
  await pdf.getByRole('textbox', {name: 'Data sheet title'}).fill('Replacement data sheet');
  await pdf.getByRole('button', {name: 'Preview exactly what buyers see'}).click();
  await pdf.getByRole('button', {name: 'Publish data sheet'}).click();
  await expect(pdf.getByText(/Published · revision 2/)).toBeVisible();
  await pdf.getByRole('button', {name: 'Withdraw'}).click();
  await expect(pdf.getByText('Withdrawn', {exact: true})).toBeVisible();
  const writes = fixture.calls.filter(call => call.path.includes('/documents/') && call.method !== 'GET');
  expect(writes.every(call => call.body && !('file' in call.body) && !('bytes' in call.body))).toBe(true);
  expect(fixture.errors).toEqual([]);
});

test('seller sees conflict reload, first-party refusal and server render-budget messages', async ({page}) => {
  const fixture = await setup(page);
  await page.goto('/tests/preview-browser/index.html?documents=legacy');
  const technical = page.getByRole('region', {name: 'Technical documentation', exact: true});
  await technical.getByRole('textbox', {name: 'Technical documentation title'}).fill('Title');
  await technical.getByRole('textbox', {name: 'Technical document', exact: true}).fill('Technical body');
  const pdfTitle = page.getByRole('textbox', {name: 'Data sheet title'});
  await pdfTitle.fill('Unsaved PDF title');
  fixture.conflict(); await technical.getByRole('button', {name: 'Save document draft'}).click();
  await expect(page.getByRole('region', {name: 'Documents', exact: true}).getByRole('alert')).toContainText('changed in another window');
  await expect(technical.getByRole('textbox', {name: 'Technical documentation title'})).toHaveValue('Changed in other window');
  await expect(pdfTitle).toHaveValue('Unsaved PDF title');
  await page.getByRole('button', {name: 'Reload documents'}).click();
  await expect(pdfTitle).toHaveValue('Unsaved PDF title');
  fixture.refuse(); await technical.getByRole('button', {name: 'Save document draft'}).click();
  await expect(page.getByRole('region', {name: 'Documents', exact: true}).getByRole('alert')).toContainText('Sign in on the ai.market website');
  fixture.budget(); await technical.getByRole('button', {name: 'Save document draft'}).click();
  await expect(page.getByRole('region', {name: 'Documents', exact: true}).getByRole('alert')).toContainText('Rendering budget exceeded. Simplify the document.');
  expect(fixture.refreshes()).toBe(0); expect(fixture.errors).toEqual([]);
});

test('buyer sees server HTML, expanded full text, safe PDF link and fresh withdrawal/identity hiding', async ({page}) => {
  const fixture = await setup(page);
  fixture.state.documents.technical_markdown.published = documentFixture('technical_markdown', {state: 'published', body_html: '<h2>Server guide</h2>' + '<p>Safe document text.</p>'.repeat(100)});
  fixture.state.documents.data_sheet_pdf.published = documentFixture('data_sheet_pdf', {state: 'published'});
  await page.goto('/tests/preview-browser/index.html?documents=buyer');
  await expect(page.getByRole('heading', {name: 'Server guide'})).toBeVisible();
  const expand = page.getByRole('button', {name: 'Show full documentation'});
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.click(); await expect(page.getByRole('button', {name: 'Show less documentation'})).toHaveAttribute('aria-expanded', 'true');
  const link = page.getByRole('link', {name: 'Open data sheet (PDF, new tab)'});
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
  await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
  fixture.state.data_sheet_available = false;
  await page.reload(); await expect(page.getByRole('heading', {name: 'Server guide'})).toBeVisible();
  await expect(link).toHaveCount(0);
  fixture.state.documents.technical_markdown.published = null;
  await page.reload(); await expect(page.getByText('Loading buyer documents…')).toHaveCount(0);
  await expect(page.getByRole('region', {name: 'Documentation'})).toHaveCount(0);
  expect(fixture.errors).toEqual([]);
});

test('buyer invalid server markup stays escaped text', async ({page}) => {
  const fixture = await setup(page);
  fixture.state.documents.technical_markdown.published = documentFixture('technical_markdown', {state: 'published', body_markdown: '🫨*! sales@acme*.io\n<script>literal</script>', body_html: '<img src="https://tracker.example/x" onerror="alert(1)">'});
  await page.goto('/tests/preview-browser/index.html?documents=buyer');
  const content = page.locator('#technical-documentation [dir="auto"]');
  await expect(content).toHaveText('🫨*! sales@acme*.io\n<script>literal</script>');
  await expect(content).toHaveCSS('white-space', 'pre-wrap');
  await expect(content.locator('script, img, strong, a')).toHaveCount(0);
  expect(fixture.errors).toEqual([]);
});
