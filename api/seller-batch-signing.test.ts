import * as client from './client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readSigningInstruments, signInstruments } from './seller-batch-signing';
import { nativeClient, nativeSession } from './connector-seller-settings';
import { useAuthStore } from '@/store/auth';
import { LICENSE_HASHES_1_0 } from './listingLicenses';
import { instrument, id } from '@/tests/fixtures/seller-authority';
beforeEach(() => useAuthStore.setState({ token: 'retained-session' }));
afterEach(() => vi.restoreAllMocks());
it.each([[], [id(1), id(1)], Array.from({ length: 51 }, (_, i) => id(i + 1))].map(ids => ({ ids })))('rejects empty, duplicate or 51-member requests without splitting', async ({ ids }) => {
  const get = vi.spyOn(nativeClient, 'get'); await expect(readSigningInstruments(ids)).rejects.toThrow('INVALID_BATCH'); expect(get).not.toHaveBeenCalled();
});
it('reads complete preparation selections without changing their bindings', async () => {
  const get = vi.spyOn(nativeClient, 'get').mockImplementation(async path => ({ data: instrument(Number(String(path).slice(-1))) }));
  expect(await readSigningInstruments([id(1), id(2)])).toEqual([instrument(1), instrument(2)]);
  expect(get).toHaveBeenCalledWith(`/seller-workspace/listing-preparation/${id(1)}`, { headers: nativeSession().headers });
});
it('uses the dedicated native licence signing endpoint and verifies every coverage receipt', async () => {
  const i = instrument(1); const body = { request_id: id(9), csrf: nativeSession().csrf, instruments: [{ preparation_id: i.id, coverage_hash: i.coverage_hash, selection: i.license_selection }] };
  const signed = { ...i, status: 'signed', signed_coverage_hash: 'b'.repeat(64), signing_required: false, acceptance_id: id(20) }; const post = vi.spyOn(nativeClient, 'post').mockResolvedValue({ data: { instruments: [signed] } });
  expect(await signInstruments(body)).toEqual([signed]); expect(post).toHaveBeenCalledWith('/seller-workspace/listing-licences/sign', body, { headers: nativeSession().headers });
  expect((post.mock.calls[0][1] as {csrf:string}).csrf).toBe(nativeSession().csrf);
  post.mockResolvedValue({ data: { instruments: [{ ...signed, coverage_hash: 'b'.repeat(64) }] } }); await expect(signInstruments(body)).rejects.toThrow('INVALID_RECEIPT');
});

it('keeps a batch read valid when sibling responses settle before one instrument refreshes', async () => {
  const expired = { isAxiosError: true, response: { status: 401 } };
  const get = vi.spyOn(nativeClient, 'get')
    .mockRejectedValueOnce(expired)
    .mockResolvedValueOnce({ data: instrument(2) })
    .mockResolvedValueOnce({ data: instrument(1) });
  const refresh = vi.spyOn(client, 'refreshAccessToken').mockImplementation(async () => {
    // Let the other instrument's already completed response settle first.
    await Promise.resolve();
    useAuthStore.setState({ token: 'fresh-batch-session' });
    return 'fresh-batch-session';
  });
  expect(await readSigningInstruments([id(1), id(2)])).toEqual([instrument(1), instrument(2)]);
  expect(get).toHaveBeenCalledTimes(3);
  expect(refresh).toHaveBeenCalledOnce();
});

it('fails closed when a sibling response settles after another instrument refreshed the token', async () => {
  const expired = { isAxiosError: true, response: { status: 401 } };
  let releaseFirst!: (v: unknown) => void;
  vi.spyOn(nativeClient, 'get')
    .mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve; }))
    .mockRejectedValueOnce(expired)
    .mockResolvedValueOnce({ data: instrument(2) });
  vi.spyOn(client, 'refreshAccessToken').mockImplementation(async () => {
    useAuthStore.setState({ token: 'fresh-batch-session' });
    queueMicrotask(() => releaseFirst({ data: instrument(1) }));
    return 'fresh-batch-session';
  });
  // A batch never mixes responses from two tokens; the user can reload the batch.
  await expect(readSigningInstruments([id(1), id(2)])).rejects.toThrow('SESSION_CHANGED');
});

it('reads a historical 1.0 preparation without rewriting its stored selection', async () => {
  const old = instrument(1);
  Object.assign(old.license_selection, {version: '1.0', covenant_version: '1.0',
    license_sha256: LICENSE_HASHES_1_0.standard.true, covenant_sha256: LICENSE_HASHES_1_0.covenant});
  vi.spyOn(nativeClient, 'get').mockResolvedValue({data: old});
  expect(await readSigningInstruments([old.id])).toEqual([old]);
});

it('refuses platform correction markers in actual preparation/signing readers without changing original coverage',async()=>{
 const {default:wire}=await import('@/tests/fixtures/s1922-backend-wire.json');
 const c=wire.public[2].corrected,i=instrument(1);
 const get=vi.spyOn(nativeClient,'get'),post=vi.spyOn(nativeClient,'post');
 for(const key of ['presentation_kind','original_render_hash','original_admitted_render_hash','correction_id','correction_digest','provenance','license_label'] as const){
  const marker={[key]:c[key]};
  get.mockResolvedValue({data:{...i,...marker}});
  await expect(readSigningInstruments([i.id])).rejects.toThrow();
  get.mockResolvedValue({data:{...i,binding:{...i.binding,...marker}}});
  await expect(readSigningInstruments([i.id])).rejects.toThrow();
  const body={request_id:id(9),csrf:nativeSession().csrf,instruments:[{preparation_id:i.id,coverage_hash:i.coverage_hash,selection:{...i.license_selection,...marker}}]};
  await expect(signInstruments(body)).rejects.toThrow('Original signing evidence');
  expect(post).not.toHaveBeenCalled();
 }
 expect(i.binding.render_hash).toBe(instrument(1).binding.render_hash);
 expect(i.coverage_hash).toBe(instrument(1).coverage_hash);
});

it.each(['omitted','null','undefined','incomplete'] as const)('requires a complete selection for signing: %s',async kind=>{
  const {license_selection,...view}=instrument();
  const data=kind==='omitted'?view:{...view,license_selection:kind==='null'?null:kind==='undefined'?undefined:{...license_selection,seller_acceptance:{...license_selection.seller_acceptance,authority_confirmed:false}}};
  vi.spyOn(nativeClient,'get').mockResolvedValue({data});
  await expect(readSigningInstruments([view.id])).rejects.toThrow();
});
it('accepts the backend signing receipt without a licence selection and preserves both coverage hashes',async()=>{
  const {license_selection,...view}=instrument();
  const signed={...view,status:'signed',signing_required:false,acceptance_id:id(20),signed_coverage_hash:'b'.repeat(64)};
  const body={request_id:id(9),csrf:nativeSession().csrf,instruments:[{preparation_id:view.id,coverage_hash:view.coverage_hash,selection:license_selection}]};
  vi.spyOn(nativeClient,'post').mockResolvedValue({data:{instruments:[signed]}});
  expect(await signInstruments(body)).toEqual([signed]);
});
