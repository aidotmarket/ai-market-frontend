import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { acknowledgeGatewayIdentity, createPairingCode, describeGatewayFile, getGatewayFile, getSellerGateway, listGatewayFiles, listReceivedMessages, listSellerGateways, patchSellerGateway, revokeSellerGateway, saveGatewayListingSource, startDoorCheck } from './sellerGateways';

vi.mock('./client', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() } }));
const response = { data: {}, headers: {} };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue(response);
  vi.mocked(api.post).mockResolvedValue(response);
  vi.mocked(api.patch).mockResolvedValue(response);
  vi.mocked(api.delete).mockResolvedValue(response);
  vi.mocked(api.put).mockResolvedValue(response);
});

describe('seller gateway API', () => {
  it('uses the seller routes and request bodies', async () => {
    await createPairingCode(); await listSellerGateways(); await getSellerGateway('id');
    await patchSellerGateway('id', { name: 'A', door_url: 'https://door.example' });
    await revokeSellerGateway('id'); await revokeSellerGateway('id', true);
    await startDoorCheck('id'); await acknowledgeGatewayIdentity('id');
    await listGatewayFiles('id', 'file-1', 200); await getGatewayFile('id', 'file/1');
    await describeGatewayFile('id', 'file/1');
    await listReceivedMessages('id', '7', 200, 'receipt');
    expect(api.post).toHaveBeenCalledWith('/gateways/pairing-codes', {});
    expect(api.get).toHaveBeenCalledWith('/gateways');
    expect(api.get).toHaveBeenCalledWith('/gateways/id');
    expect(api.patch).toHaveBeenCalledWith('/gateways/id', { name: 'A', door_url: 'https://door.example' });
    expect(api.delete).toHaveBeenCalledWith('/gateways/id', { data: {} });
    expect(api.delete).toHaveBeenCalledWith('/gateways/id', { data: { confirm_open_orders: true } });
    expect(api.post).toHaveBeenCalledWith('/gateways/id/door-check', {});
    expect(api.post).toHaveBeenCalledWith('/gateways/id/identity-acknowledgement', { acknowledged: true });
    expect(api.get).toHaveBeenCalledWith('/gateways/id/files', { params: { cursor: 'file-1', limit: 200 } });
    expect(api.get).toHaveBeenCalledWith('/gateways/id/files/file%2F1');
    expect(api.post).toHaveBeenCalledWith('/gateways/id/files/file%2F1/describe', { confirm: true });
    expect(api.get).toHaveBeenCalledWith('/gateways/id/received', { params: { cursor: '7', limit: 200, message_type: 'receipt' } });
  });
  it('reads Retry-After on accepted work', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { door_check: { state: 'pending' } }, headers: { 'retry-after': '3' } });
    expect((await startDoorCheck('id')).retryAfter).toBe(3);
    vi.mocked(api.post).mockResolvedValueOnce({ data: {}, headers: { 'retry-after': '10' } });
    expect((await describeGatewayFile('id', 'file')).retryAfter).toBe(10);
    vi.mocked(api.get).mockResolvedValueOnce({ data: {}, headers: { 'retry-after': '12' } });
    expect((await getGatewayFile('id', 'file')).retryAfter).toBe(12);
  });
  it('sends only the gateway source envelope to the listing route', async () => {
    const source = { type: 'gateway' as const, gateway_id: 'gateway-1', file_ids: ['a', 'b'] };
    vi.mocked(api.put).mockResolvedValueOnce({ data: { source } });
    expect(await saveGatewayListingSource('listing/1', source)).toEqual(source);
    expect(api.put).toHaveBeenCalledWith('/listings/listing%2F1/gateway-source', { source });
  });
});
