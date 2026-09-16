// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AxiosError} from 'axios';
import * as api from '@/lib/api';
import {preview} from '@/tests/summaryFixture';
import AtAGlance from './AtAGlance';
import SellerAtAGlance from './SellerAtAGlance';
vi.mock('@/lib/api', () => ({fetchSummaryPreview: vi.fn(), regenerateSummary: vi.fn(), approveSummary: vi.fn(), withdrawSummary: vi.fn()}));
beforeEach(() => {vi.resetAllMocks(); vi.mocked(api.fetchSummaryPreview).mockResolvedValue(preview);});
afterEach(cleanup);
it.each(['pending', 'invalidated'] as const)('treats %s as neutral pending and renders the exact buyer component', async state => {
  vi.mocked(api.fetchSummaryPreview).mockResolvedValue({...preview, state});
  render(<SellerAtAGlance listingId="listing" />);
  await screen.findByText('Review the summary and approve it to show it to buyers');
  expect(screen.queryByText(/changed since you approved/)).toBeNull();
  const buyer = screen.getByRole('region', {name: 'At a glance'});
  expect(buyer.outerHTML).toBe(renderToStaticMarkup(<AtAGlance audience="seller" summary={preview.at_a_glance} />));
  for (const label of ['from AIM Data', 'entered by you', 'generated and checked']) expect(within(buyer).getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', {name: 'Approve At a glance'})).toBeTruthy();
  expect(screen.queryByRole('button', {name: 'Withdraw'})).toBeNull();
});
it('approves the exact preview identifiers with a new UUID and no sample permission', async () => {
  render(<SellerAtAGlance listingId="listing" />);
  fireEvent.click(await screen.findByRole('button', {name: 'Approve At a glance'}));
  await waitFor(() => expect(api.approveSummary).toHaveBeenCalledTimes(1));
  const [id, payload] = vi.mocked(api.approveSummary).mock.calls[0];
  expect(id).toBe('listing');
  expect(payload).toEqual({summary_id: preview.summary_id, source_revision: preview.source_revision, summary_hash: preview.summary_hash, render_hash: preview.render_hash, sample_decision: 'none', request_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)});
  await waitFor(() => expect(api.fetchSummaryPreview).toHaveBeenCalledTimes(2));
});
it('shows approved state and withdraws using the same exact identifiers', async () => {
  vi.mocked(api.fetchSummaryPreview).mockResolvedValueOnce({...preview, state: 'approved'}).mockResolvedValue(preview);
  render(<SellerAtAGlance listingId="listing" />);
  fireEvent.click(await screen.findByRole('button', {name: 'Withdraw'}));
  await screen.findByText(/Summary withdrawn/);
  expect(api.withdrawSummary).toHaveBeenCalledWith('listing', expect.objectContaining({summary_id: preview.summary_id, source_revision: preview.source_revision, summary_hash: preview.summary_hash, render_hash: preview.render_hash, sample_decision: 'none'}), expect.any(AbortSignal));
  expect(screen.queryByRole('button', {name: 'Withdraw'})).toBeNull();
});
it('regenerates in the preview locale and uses the returned generation for approval', async () => {
  const changed = {...preview, render_hash: 'd'.repeat(64)};
  vi.mocked(api.regenerateSummary).mockResolvedValue(changed);
  render(<SellerAtAGlance listingId="listing" />);
  fireEvent.click(await screen.findByRole('button', {name: 'Regenerate'}));
  await waitFor(() => expect(api.regenerateSummary).toHaveBeenCalledWith('listing', 'en', expect.any(AbortSignal)));
  await waitFor(() => expect(screen.getByRole('button', {name: 'Approve At a glance'}).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', {name: 'Approve At a glance'}));
  await waitFor(() => expect(api.approveSummary).toHaveBeenCalledWith('listing', expect.objectContaining({render_hash: changed.render_hash}), expect.any(AbortSignal)));
});
it('reloads on 409 and requires a fresh explicit approval of the new identifiers', async () => {
  vi.mocked(api.approveSummary).mockRejectedValueOnce(new AxiosError('stale', '409', undefined, undefined, {status: 409} as never));
  const changed = {...preview, summary_id: '22222222-2222-4222-8222-222222222222', source_revision: 'd'.repeat(64), summary_hash: 'e'.repeat(64), render_hash: 'f'.repeat(64)};
  vi.mocked(api.fetchSummaryPreview).mockResolvedValueOnce(preview).mockResolvedValue(changed);
  render(<SellerAtAGlance listingId="listing" />);
  fireEvent.click(await screen.findByRole('button', {name: 'Approve At a glance'}));
  await screen.findByText('Summary changed, reloaded. Review it before approving.');
  expect(api.approveSummary).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', {name: 'Approve At a glance'}));
  await waitFor(() => expect(api.approveSummary).toHaveBeenCalledTimes(2));
  const first = vi.mocked(api.approveSummary).mock.calls[0][1];
  const second = vi.mocked(api.approveSummary).mock.calls[1][1];
  expect(second).toEqual({summary_id: changed.summary_id, source_revision: changed.source_revision, summary_hash: changed.summary_hash, render_hash: changed.render_hash, request_id: expect.any(String), sample_decision: 'none'});
  expect(first.request_id).not.toBe(second.request_id);
});
it('removes stale approval controls if reload fails', async () => {
  vi.mocked(api.approveSummary).mockRejectedValueOnce(new AxiosError('stale', '409', undefined, undefined, {status: 409} as never));
  vi.mocked(api.fetchSummaryPreview).mockResolvedValueOnce(preview).mockRejectedValue(new Error('offline'));
  render(<SellerAtAGlance listingId="listing" />);
  fireEvent.click(await screen.findByRole('button', {name: 'Approve At a glance'}));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', {name: 'Approve At a glance'})).toBeNull();
  expect(screen.getByRole('button', {name: 'Reload summary'})).toBeTruthy();
});
it('disables actions during a request and discards a late response after a listing change', async () => {
  let finish!: (value: api.SummaryPreview) => void;
  vi.mocked(api.regenerateSummary).mockReturnValue(new Promise(resolve => {finish = resolve;}));
  const {rerender} = render(<SellerAtAGlance listingId="one" />);
  fireEvent.click(await screen.findByRole('button', {name: 'Regenerate'}));
  expect(screen.getByRole('button', {name: 'Approve At a glance'}).hasAttribute('disabled')).toBe(true);
  rerender(<SellerAtAGlance listingId="two" />);
  await act(async () => {finish({...preview, state: 'approved'});});
  expect(screen.queryByRole('button', {name: 'Withdraw'})).toBeNull();
});
