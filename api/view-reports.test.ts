import '@/tests/support-network-trap';
import { expect, it } from 'vitest';
import { viewReportReceipt, type ViewReport } from './view-reports';

const report: ViewReport = { view: 'wallet', wallet_offset: 20,
  report_id: '00000000-0000-4000-8000-000000000001', description: 'Original wallet failure', failure: 'normal_read_failed' };
const receipt = () => ({ public_ref: 'SUP-SYNTHETIC', conversation_id: '00000000-0000-4000-8000-000000000002',
  received_at: '2026-11-07T00:00:00Z', status: 'in_progress', next_action: 'Support is reviewing.',
  original: { category: 'other', description: report.description, failed_operation: 'wallet:normal_read_failed' },
  email_state: 'pending', acknowledgement: { id: 'ack', version: 'v1', direction: 'outbound', body: 'Report retained.' } });
it('keeps the exact parsed receipt object', () => {
  const value = receipt(); expect(viewReportReceipt(value, report)).toBe(value);
});
it.each([
  ['description', (r: ReturnType<typeof receipt>) => { r.original.description = 'Foreign description'; }],
  ['operation', (r: ReturnType<typeof receipt>) => { r.original.failed_operation = 'request_thread:normal_read_failed'; }],
  ['category', (r: ReturnType<typeof receipt>) => { r.original.category = 'payment'; }],
  ['email', (r: ReturnType<typeof receipt>) => { r.email_state = 'sent'; }],
  ['inbound acknowledgement', (r: ReturnType<typeof receipt>) => { r.acknowledgement.direction = 'inbound'; }],
  ['timestamp', (r: ReturnType<typeof receipt>) => { r.received_at = 'invalid'; }],
  ['conversation identity', (r: ReturnType<typeof receipt>) => { r.conversation_id = 'not-a-uuid'; }],
  ['public identity', (r: ReturnType<typeof receipt>) => { r.public_ref = ''; }],
  ['unknown receipt key', (r: ReturnType<typeof receipt>) => { Object.assign(r, { foreign: 'data' }); }],
  ['unknown original key', (r: ReturnType<typeof receipt>) => { Object.assign(r.original, { foreign: 'data' }); }],
] as const)('rejects invalid %s before installing a receipt', (_name, mutate) => {
  const value = receipt(); mutate(value); expect(() => viewReportReceipt(value, report)).toThrow();
});
