// @vitest-environment jsdom
import {File as NodeFile} from 'node:buffer';
import {webcrypto, createHash} from 'node:crypto';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import ListingDocumentsEditor from './ListingDocumentsEditor';
import * as api from '@/api/listingDocuments';
import type {DocumentKind, SellerDocuments} from '@/types/listingDocuments';
import {documentsFixture, documentFixture} from '@/tests/listingDocumentsFixture';
import {advanceAuthSessionOwner} from '@/lib/auth-session-owner';

vi.mock('@/api/listingDocuments', () => ({readListingDocuments: vi.fn(), saveDocumentDraft: vi.fn(), publishDocument: vi.fn(), withdrawDocument: vi.fn(), discardDocumentDraft: vi.fn()}));
let server: SellerDocuments;
beforeEach(() => {
  vi.resetAllMocks(); server = documentsFixture();
  vi.stubGlobal('crypto', webcrypto);
  vi.mocked(api.readListingDocuments).mockImplementation(async () => structuredClone(server));
  vi.mocked(api.saveDocumentDraft).mockImplementation(async (_id, kind, content) => {
    const state = server.documents[kind];
    const draft = documentFixture(kind, {...content, revision: state.max_revision + 1});
    state.max_revision = draft.revision; state.draft = draft; return draft;
  });
  vi.mocked(api.publishDocument).mockImplementation(async (_id, kind) => {
    const state = server.documents[kind];
    state.published = {...state.draft!, state: 'published', published_at: '2026-11-01T12:00:00Z'};
    state.draft = null; return state.published;
  });
  vi.mocked(api.withdrawDocument).mockImplementation(async (_id, kind) => {
    const state = server.documents[kind];
    state.withdrawn = {...state.published!, state: 'withdrawn'}; state.published = null; return state.withdrawn;
  });
  vi.mocked(api.discardDocumentDraft).mockImplementation(async (_id, kind) => {
    const draft = server.documents[kind].draft!; server.documents[kind].draft = null; return draft;
  });
});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
const region = (kind: DocumentKind = 'technical_markdown') => within(screen.getByRole('region', {name: kind === 'technical_markdown' ? 'Technical documentation' : 'Data sheet'}));
async function mount() {
  render(<ListingDocumentsEditor listingId="synthetic-listing"/>);
  await screen.findByRole('region', {name: 'Technical documentation'});
}
function fillTechnical() {
  fireEvent.change(region().getByRole('textbox', {name: 'Technical documentation title'}), {target: {value: 'New guide'}});
  fireEvent.change(region().getByRole('textbox', {name: 'Technical document'}), {target: {value: '**Local source**'}});
}

it('shows an optional section without calling document routes until a Workspace listing exists', () => {
  render(<ListingDocumentsEditor/>);
  expect(screen.getByText(/Publish your listing first/)).toBeTruthy();
  expect(screen.getByText(/never block listing publication/)).toBeTruthy();
  expect(api.readListingDocuments).not.toHaveBeenCalled();
});

it('adds, saves, previews the server render, publishes, replaces, discards and withdraws technical documentation', async () => {
  await mount();
  expect(region().getByText('Not added')).toBeTruthy();
  expect(region().queryByRole('button', {name: 'Publish technical document'})).toBeNull();
  fillTechnical();
  fireEvent.click(region().getByRole('button', {name: 'Save document draft'}));
  await waitFor(() => expect(region().getByText('Draft')).toBeTruthy());
  expect(region().queryByRole('button', {name: 'Publish technical document'})).toBeNull();
  fireEvent.click(region().getByRole('button', {name: 'Preview exactly what buyers see'}));
  const publish = await screen.findByRole('button', {name: 'Publish technical document'});
  const preview = region().getByLabelText('Technical documentation publication preview');
  expect(preview.querySelector('strong')?.textContent).toBe('RENDER');
  expect(preview.textContent).not.toContain('Local source');
  fireEvent.click(publish);
  await waitFor(() => expect(region().getByText(/Published · revision 2/)).toBeTruthy());
  expect(api.publishDocument).toHaveBeenCalledWith('synthetic-listing', 'technical_markdown', 2, 'a'.repeat(64), expect.any(AbortSignal));
  fireEvent.click(region().getByRole('button', {name: 'Replace'}));
  fireEvent.change(region().getByRole('textbox', {name: 'Technical document'}), {target: {value: 'replacement'}});
  fireEvent.click(region().getByRole('button', {name: 'Save document draft'}));
  await screen.findByText(/Draft · revision 3/);
  fireEvent.click(region().getByRole('button', {name: 'Discard draft'}));
  await waitFor(() => expect(region().queryByRole('button', {name: 'Discard draft'})).toBeNull());
  expect(api.discardDocumentDraft).toHaveBeenCalledWith('synthetic-listing', 'technical_markdown', 3, expect.any(AbortSignal));
  fireEvent.click(region().getByRole('button', {name: 'Withdraw'}));
  await waitFor(() => expect(region().getByText('Withdrawn')).toBeTruthy());
  expect(api.withdrawDocument).toHaveBeenCalledWith('synthetic-listing', 'technical_markdown', 2, expect.any(AbortSignal));
  expect(screen.getByText(/Copies already downloaded/)).toBeTruthy();
});

it.each(['title', 'body'])('invalidates the publication preview when the %s changes', async field => {
  await mount(); fillTechnical();
  fireEvent.click(region().getByRole('button', {name: 'Preview exactly what buyers see'}));
  await screen.findByRole('button', {name: 'Publish technical document'});
  fireEvent.change(region().getByRole('textbox', {name: field === 'title' ? 'Technical documentation title' : 'Technical document'}), {target: {value: 'changed'}});
  expect(region().queryByRole('button', {name: 'Publish technical document'})).toBeNull();
});

it('preserves and counts astral values up to and beyond 50,000 without truncating on load or paste', async () => {
  server.documents.technical_markdown = {max_revision: 2, draft: documentFixture('technical_markdown', {revision: 2, body_markdown: '🫨'.repeat(50001)}), published: null, withdrawn: null};
  await mount();
  const body = region().getByRole('textbox', {name: 'Technical document'}) as HTMLTextAreaElement;
  expect([...body.value]).toHaveLength(50001); expect(body.hasAttribute('maxlength')).toBe(false);
  expect(region().getByText('50,001 / 50,000')).toBeTruthy();
  expect((region().getByRole('button', {name: 'Save document draft'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(body, {target: {value: '🫨'.repeat(50000)}});
  expect([...body.value]).toHaveLength(50000);
  expect(region().getByText('50,000 / 50,000')).toBeTruthy();
  fireEvent.click(region().getByRole('button', {name: 'Save document draft'}));
  await waitFor(() => expect(api.saveDocumentDraft).toHaveBeenCalled());
  expect(vi.mocked(api.saveDocumentDraft).mock.calls[0][2]).toMatchObject({body_markdown: '🫨'.repeat(50000)});
});

it.each(['draft', 'publish', 'withdraw', 'discard-draft'] as const)('reloads a 409 on %s and does not replay it', async action => {
  server.documents.technical_markdown = {max_revision: 2, draft: documentFixture('technical_markdown', {revision: 2}), published: documentFixture('technical_markdown', {state: 'published', revision: 1, published_at: '2026-11-01T00:00:00Z'}), withdrawn: null};
  await mount();
  if (action === 'publish') {
    fireEvent.click(region().getByRole('button', {name: 'Preview exactly what buyers see'}));
    await screen.findByRole('button', {name: 'Publish technical document'});
  }
  const mutation = action === 'draft' ? api.saveDocumentDraft : action === 'publish' ? api.publishDocument : action === 'withdraw' ? api.withdrawDocument : api.discardDocumentDraft;
  vi.mocked(mutation).mockImplementationOnce(async () => {
    server.documents.technical_markdown = {max_revision: 9, draft: documentFixture('technical_markdown', {title: 'Newer window guide', revision: 9}), published: null, withdrawn: null};
    throw {isAxiosError: true, response: {status: 409, data: {detail: action === 'publish' ? 'DOCUMENT_CHANGED' : 'DOCUMENT_REVISION_CONFLICT'}}};
  });
  const callsBefore = vi.mocked(mutation).mock.calls.length;
  fireEvent.click(region().getByRole('button', {name: action === 'draft' ? 'Save document draft' : action === 'publish' ? 'Publish technical document' : action === 'withdraw' ? 'Withdraw' : 'Discard draft'}));
  await screen.findByText(/changed in another window/);
  expect((region().getByRole('textbox', {name: 'Technical documentation title'}) as HTMLInputElement).value).toBe('Newer window guide');
  expect(vi.mocked(mutation).mock.calls.length).toBe(callsBefore + 1);
  expect(region().queryByRole('button', {name: 'Publish technical document'})).toBeNull();
});

it.each([
  [403, 'FIRST_PARTY_SESSION_REQUIRED', 'Sign in on the ai.market website'],
  [422, 'Rendering budget exceeded. Simplify this document.', 'Rendering budget exceeded. Simplify this document.'],
  [422, 'Remove contact details from this document.', 'Remove contact details from this document.'],
] as const)('shows actionable server errors for %i %s', async (status, detail, text) => {
  await mount(); fillTechnical();
  vi.mocked(api.saveDocumentDraft).mockRejectedValueOnce({isAxiosError: true, response: {status, data: {detail}}});
  fireEvent.click(region().getByRole('button', {name: 'Save document draft'}));
  await screen.findByText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  expect(api.publishDocument).not.toHaveBeenCalled();
});

it('shows an unavailable PDF message and a hidden published state while still allowing withdrawal', async () => {
  server.data_sheet_available = false;
  server.documents.data_sheet_pdf = {max_revision: 2, published: documentFixture('data_sheet_pdf', {state: 'published', revision: 2, published_at: '2026-11-01T00:00:00Z'}), draft: null, withdrawn: null};
  await mount();
  const pdf = region('data_sheet_pdf');
  expect(pdf.getByText(/Published but hidden until public business names are on/)).toBeTruthy();
  expect(pdf.getByText(/Data sheets become available/)).toBeTruthy();
  expect(pdf.queryByLabelText('Choose PDF (local check only)')).toBeNull();
  fireEvent.click(pdf.getByRole('button', {name: 'Withdraw'}));
  await waitFor(() => expect(region('data_sheet_pdf').getByText('Withdrawn')).toBeTruthy());
});

it('hashes a selected PDF locally and saves only metadata and its public address before publishing', async () => {
  const network = vi.fn(() => {throw new Error('File uploads forbidden');});
  vi.stubGlobal('fetch', network); vi.stubGlobal('XMLHttpRequest', network);
  await mount(); const pdf = region('data_sheet_pdf');
  const bytes = '%PDF-1.7\nSynthetic data sheet';
  const file = new NodeFile([bytes], 'local.pdf', {type: 'application/pdf'});
  fireEvent.change(pdf.getByLabelText('Choose PDF (local check only)'), {target: {files: [file]}});
  await pdf.findByText(`SHA-256: ${createHash('sha256').update(bytes).digest('hex')}`);
  fireEvent.change(pdf.getByRole('textbox', {name: 'Data sheet title'}), {target: {value: 'Specs'}});
  fireEvent.change(pdf.getByRole('textbox', {name: 'Public PDF address'}), {target: {value: 'https://cdn.example.com/local.pdf'}});
  fireEvent.click(pdf.getByRole('button', {name: 'Preview exactly what buyers see'}));
  fireEvent.click(await screen.findByRole('button', {name: 'Publish data sheet'}));
  await waitFor(() => expect(region('data_sheet_pdf').getByText(/Published · revision 1/)).toBeTruthy());
  expect(api.saveDocumentDraft).toHaveBeenCalledWith('synthetic-listing', 'data_sheet_pdf', {
    expected_revision: 0, title: 'Specs', pdf_url: 'https://cdn.example.com/local.pdf', pdf_filename: 'local.pdf', pdf_size_bytes: Buffer.byteLength(bytes), pdf_sha256: createHash('sha256').update(bytes).digest('hex'),
  }, expect.any(AbortSignal));
  expect(network).not.toHaveBeenCalled();
});

it('refuses an invalid local file without saving a draft', async () => {
  await mount();
  fireEvent.change(region('data_sheet_pdf').getByLabelText('Choose PDF (local check only)'), {target: {files: [new NodeFile(['not PDF'], 'fake.pdf')]}});
  await screen.findByText(/must start with %PDF-/);
  expect(api.saveDocumentDraft).not.toHaveBeenCalled();
});

it('preserves unsaved PDF fields when saving the technical document', async () => {
  await mount();
  fireEvent.change(region('data_sheet_pdf').getByRole('textbox', {name: 'Data sheet title'}), {target: {value: 'Unsaved PDF title'}});
  fireEvent.change(region('data_sheet_pdf').getByRole('textbox', {name: 'Public PDF address'}), {target: {value: 'https://cdn.example.com/unsaved.pdf'}});
  fillTechnical(); fireEvent.click(region().getByRole('button', {name: 'Save document draft'}));
  await screen.findByText('Draft', {exact: true});
  expect((region('data_sheet_pdf').getByRole('textbox', {name: 'Data sheet title'}) as HTMLInputElement).value).toBe('Unsaved PDF title');
  expect((region('data_sheet_pdf').getByRole('textbox', {name: 'Public PDF address'}) as HTMLInputElement).value).toBe('https://cdn.example.com/unsaved.pdf');
});

it('withdraws the published revision while a newer draft remains', async () => {
  server.documents.technical_markdown = {max_revision: 7, draft: documentFixture('technical_markdown', {revision: 7}), published: documentFixture('technical_markdown', {state: 'published', revision: 4, published_at: '2026-11-01T00:00:00Z'}), withdrawn: null};
  await mount();
  fireEvent.click(region().getByRole('button', {name: 'Withdraw'}));
  await waitFor(() => expect(region().queryByRole('button', {name: 'Withdraw'})).toBeNull());
  expect(region().getByRole('button', {name: 'Discard draft'})).toBeTruthy();
  expect(api.withdrawDocument).toHaveBeenCalledWith('synthetic-listing', 'technical_markdown', 4, expect.any(AbortSignal));
  expect(server.documents.technical_markdown.draft?.revision).toBe(7);
});

it('fails closed when the conflict reload fails and permits an explicit retry', async () => {
  await mount(); fillTechnical();
  vi.mocked(api.saveDocumentDraft).mockRejectedValueOnce({isAxiosError: true, response: {status: 409}});
  vi.mocked(api.readListingDocuments).mockRejectedValueOnce(new Error('Offline'));
  fireEvent.click(region().getByRole('button', {name: 'Save document draft'}));
  await screen.findByText(/Reload the current documents before continuing/);
  expect(screen.queryByRole('button', {name: 'Save document draft'})).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Reload documents'}));
  await screen.findByRole('region', {name: 'Technical documentation'});
});

it('shows a structured server render-budget refusal verbatim', async () => {
  await mount(); fillTechnical();
  vi.mocked(api.saveDocumentDraft).mockRejectedValueOnce({isAxiosError: true, response: {status: 422, data: {detail: {code: 'DOCUMENT_RENDER_BUDGET', message: 'Simplify this document to preview it.'}}}});
  fireEvent.click(region().getByRole('button', {name: 'Preview exactly what buyers see'}));
  await screen.findByText(/Simplify this document to preview it/);
  expect(api.publishDocument).not.toHaveBeenCalled();
});

it('clears private editor state when the signed-in session lifecycle changes', async () => {
  server.documents.technical_markdown = {max_revision: 1, draft: documentFixture('technical_markdown', {title: 'Private old session guide'}), published: null, withdrawn: null};
  await mount();
  expect((region().getByRole('textbox', {name: 'Technical documentation title'}) as HTMLInputElement).value).toBe('Private old session guide');
  server = documentsFixture();
  act(() => {advanceAuthSessionOwner(false);});
  await waitFor(() => expect((region().getByRole('textbox', {name: 'Technical documentation title'}) as HTMLInputElement).value).toBe(''));
  expect(screen.queryByDisplayValue('Private old session guide')).toBeNull();
});
