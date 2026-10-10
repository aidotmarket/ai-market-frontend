import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readSigningInstruments, signInstruments } from './seller-batch-signing';
import { nativeClient, nativeSession } from './connector-seller-settings';
import { useAuthStore } from '@/store/auth';
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
  const signed = { ...i, status: 'signed', signing_required: false, acceptance_id: id(20) }; const post = vi.spyOn(nativeClient, 'post').mockResolvedValue({ data: { instruments: [signed] } });
  expect(await signInstruments(body)).toEqual([signed]); expect(post).toHaveBeenCalledWith('/seller-workspace/listing-licences/sign', body, { headers: nativeSession().headers });
  post.mockResolvedValue({ data: { instruments: [{ ...signed, coverage_hash: 'b'.repeat(64) }] } }); await expect(signInstruments(body)).rejects.toThrow('INVALID_RECEIPT');
});
