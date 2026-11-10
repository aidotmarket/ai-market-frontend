import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import * as client from './client';
import {nativeClient, nativeSession} from './connector-seller-settings';
import {discardDocumentDraft, publishDocument, readListingDocuments, saveDocumentDraft, withdrawDocument} from './listingDocuments';
import {useAuthStore} from '@/store/auth';
import type {User} from '@/types';
import {documentsFixture, documentFixture} from '@/tests/listingDocumentsFixture';

const listingId = '00000000-0000-4000-8000-000000000004';
const base = `/seller/listings/${listingId}/documents`;
beforeEach(() => useAuthStore.setState({user: {id: 'synthetic-seller'} as User, token: 'synthetic-expired-session'}));
afterEach(() => vi.restoreAllMocks());

it('reads seller state using the retained website session', async () => {
  const state = documentsFixture();
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({data: state});
  expect(await readListingDocuments(listingId)).toEqual(state);
  expect(get).toHaveBeenCalledWith(base, {signal: undefined, headers: nativeSession().headers});
});

const calls = [
  {action: 'draft', method: 'put', body: {expected_revision: 6, title: 'Guide', body_markdown: 'Long source'}, invoke: () => saveDocumentDraft(listingId, 'technical_markdown', {expected_revision: 6, title: 'Guide', body_markdown: 'Long source'})},
  {action: 'publish', method: 'post', body: {revision: 7, render_hash: 'a'.repeat(64)}, invoke: () => publishDocument(listingId, 'technical_markdown', 7, 'a'.repeat(64))},
  {action: 'withdraw', method: 'post', body: {revision: 4}, invoke: () => withdrawDocument(listingId, 'technical_markdown', 4)},
  {action: 'discard-draft', method: 'post', body: {revision: 7}, invoke: () => discardDocumentDraft(listingId, 'technical_markdown', 7)},
] as const;

it.each(calls)('$action refreshes a 401 once, retaining action revisions and rotating both native credentials', async ({action, method, body, invoke}) => {
  const first = nativeSession();
  const request = vi.spyOn(nativeClient, method).mockRejectedValueOnce({isAxiosError: true, response: {status: 401}}).mockResolvedValue({data: documentFixture()});
  const refresh = vi.spyOn(client, 'refreshAccessToken').mockImplementation(async () => {
    useAuthStore.setState({token: 'synthetic-refreshed-session'});
    return 'synthetic-refreshed-session';
  });
  await invoke();
  expect(refresh).toHaveBeenCalledOnce();
  expect(request.mock.calls).toEqual([
    [`${base}/technical_markdown/${action}`, {...body, csrf: first.csrf}, {headers: first.headers}],
    [`${base}/technical_markdown/${action}`, {...body, csrf: nativeSession().csrf}, {headers: nativeSession().headers}],
  ]);
});

it('refreshes an expired read through the existing refresh path', async () => {
  const get = vi.spyOn(nativeClient, 'get').mockRejectedValueOnce({isAxiosError: true, response: {status: 401}}).mockResolvedValue({data: documentsFixture()});
  const refresh = vi.spyOn(client, 'refreshAccessToken').mockImplementation(async () => {
    useAuthStore.setState({token: 'synthetic-fresh-session'}); return 'synthetic-fresh-session';
  });
  await readListingDocuments(listingId);
  expect(refresh).toHaveBeenCalledOnce(); expect(get).toHaveBeenCalledTimes(2);
  expect(get.mock.calls[1][1]?.headers).toEqual(nativeSession().headers);
});

it.each([403, 409, 422])('does not refresh or retry a %i refusal', async status => {
  const error = {isAxiosError: true, response: {status}};
  const put = vi.spyOn(nativeClient, 'put').mockRejectedValue(error);
  const refresh = vi.spyOn(client, 'refreshAccessToken');
  await expect(saveDocumentDraft(listingId, 'technical_markdown', {expected_revision: 0, title: 'Guide', body_markdown: 'body'})).rejects.toBe(error);
  expect(put).toHaveBeenCalledOnce(); expect(refresh).not.toHaveBeenCalled();
});

it('sends only PDF metadata and address, with no file bytes or upload request', async () => {
  const {title, pdf_url, pdf_filename, pdf_size_bytes, pdf_sha256} = documentFixture('data_sheet_pdf');
  const metadata = {expected_revision: 0, title, pdf_url: pdf_url!, pdf_filename: pdf_filename!, pdf_size_bytes: pdf_size_bytes!, pdf_sha256: pdf_sha256!};
  const put = vi.spyOn(nativeClient, 'put').mockResolvedValue({data: documentFixture('data_sheet_pdf')});
  await saveDocumentDraft(listingId, 'data_sheet_pdf', metadata);
  expect(put).toHaveBeenCalledWith(`${base}/data_sheet_pdf/draft`, {...metadata, csrf: nativeSession().csrf}, {headers: nativeSession().headers});
});
