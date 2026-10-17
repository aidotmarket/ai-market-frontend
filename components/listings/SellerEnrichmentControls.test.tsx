// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {AxiosError} from 'axios';
import * as api from '@/lib/api';
import SellerEnrichmentControls from './SellerEnrichmentControls';

vi.mock('@/lib/api', () => ({fetchListingEnrichment: vi.fn(), saveListingEnrichment: vi.fn()}));

const aggregate: api.AggregateStatistics = {
  profile: 'aim-aggregate-statistics-v1', row_count: 100, row_count_source: 'locally_derived',
  row_count_derived_at: '2026-09-19T08:00:00Z', columns: [],
};
const view: api.EnrichmentView = {
  profile: 'aim-listing-enrichment-profile-v2', source_revision: 'a'.repeat(64), source_language: 'en',
  summary_id: '11111111-1111-4111-8111-111111111111', state: 'approved', drafts: [],
  values: {}, aggregate_statistics: aggregate,
  schema_info: {profile: 'aim-data-dictionary-v2', fields: [{
    name: 'amount', type: 'decimal', type_parameters: {precision: 12, scale: 2},
    description: 'Sale amount', cardinality: 90, nullable: false, unit: 'EUR',
  }]},
};

beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(api.fetchListingEnrichment).mockResolvedValue(view);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(api.saveListingEnrichment).mockResolvedValue({profile: view.profile, request_id: crypto.randomUUID(), summary_id: view.summary_id, source_revision: 'b'.repeat(64), changed: true});
});
afterEach(() => {cleanup(); vi.restoreAllMocks();});

it('keeps all controls optional and sends one partial revision-bound update', async () => {
  const saved = vi.fn(); render(<SellerEnrichmentControls listingId="listing" onSaved={saved} />);
  const details = await screen.findByText('Optional listing details');
  expect(details.closest('details')?.open).toBe(false);
  fireEvent.click(details);
  fireEvent.change(await screen.findByLabelText('Unit for amount'), {target: {value: 'cents'}});
  fireEvent.change(screen.getByLabelText(/^Dataset origin statement/), {target: {value: 'Seller collected at checkout.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Add a limitation'}));
  fireEvent.change(screen.getByLabelText('Limitation 1'), {target: {value: 'Seasonal coverage.'}});
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  await waitFor(() => expect(api.saveListingEnrichment).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.saveListingEnrichment).mock.calls[0][1]).toEqual({
    profile: view.profile, source_revision: view.source_revision,
    request_id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    dataset_origin_statement: {text: 'Seller collected at checkout.', attribution: 'seller_entered'},
    dataset_limitations: {statements: ['Seasonal coverage.'], attribution: 'seller_entered'},
    schema_info: {profile: 'aim-data-dictionary-v2', fields: [{...view.schema_info!.fields![0], unit: 'cents'}]},
    aggregate_statistics: null,
  });
  await screen.findByText('Optional details saved. The buyer bundle now needs a fresh approval.');
  expect(saved).toHaveBeenCalledOnce();
});

it('reloads stale state without retrying the write', async () => {
  vi.mocked(api.saveListingEnrichment).mockRejectedValueOnce(new AxiosError('stale', '409', undefined, undefined, {status: 409, data: {detail: 'stale_source_revision'}} as never));
  render(<SellerEnrichmentControls listingId="listing" />);
  fireEvent.click(await screen.findByText('Optional listing details'));
  fireEvent.change(await screen.findByLabelText(/^Dataset origin statement/), {target: {value: 'Changed.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  await screen.findByText('The source changed. Current optional details were reloaded for review; your edit was not retried.');
  expect(api.saveListingEnrichment).toHaveBeenCalledOnce();
  expect(api.fetchListingEnrichment).toHaveBeenCalledTimes(2);
});

it('reuses the request ID for an identical retry after an uncertain outcome', async () => {
  vi.mocked(api.saveListingEnrichment).mockRejectedValueOnce(new Error('offline'));
  render(<SellerEnrichmentControls listingId="listing" />);
  fireEvent.click(await screen.findByText('Optional listing details'));
  fireEvent.change(await screen.findByLabelText(/^Dataset origin statement/), {target: {value: 'Changed.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  await screen.findByText('The optional detail save could not be confirmed. Try again to send the identical save safely.');
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  await waitFor(() => expect(api.saveListingEnrichment).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.saveListingEnrichment).mock.calls[1][1].request_id).toBe(vi.mocked(api.saveListingEnrichment).mock.calls[0][1].request_id);
});

it.each([
  ['description', {...view.schema_info!.fields![0], description: undefined}],
  ['nullable', {...view.schema_info!.fields![0], nullable: undefined}],
])('does not offer a units write when %s is absent from the read projection', async (_missing, field) => {
  vi.mocked(api.fetchListingEnrichment).mockResolvedValue({...view, schema_info: {...view.schema_info!, fields: [field]}});
  render(<SellerEnrichmentControls listingId="listing" />);
  fireEvent.click(await screen.findByText('Optional listing details'));
  const unit = await screen.findByLabelText('Unit for amount');
  expect(unit.hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/Publish a new listing version with an updated dictionary/)).toBeTruthy();
  unit.removeAttribute('disabled');
  fireEvent.change(unit, {target: {value: 'cents'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  expect(screen.getByRole('alert').textContent).toBe('Units cannot be changed here because this dictionary is missing required write fields. Publish a new listing version with an updated dictionary, then reload the optional details.');
  expect(api.saveListingEnrichment).not.toHaveBeenCalled();
});

it('replaces stale save success when aggregate removal is declined', async () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  render(<SellerEnrichmentControls listingId="listing" />);
  fireEvent.click(await screen.findByText('Optional listing details'));
  fireEvent.change(await screen.findByLabelText(/^Dataset origin statement/), {target: {value: 'Changed.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  await screen.findByText('Optional details saved. The buyer bundle now needs a fresh approval.');
  expect(screen.getByText(/Unchecking removes them for all readers/)).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('They will disappear for all readers'));
  expect(screen.getByRole('status').textContent).toBe('Aggregate statistics were not removed. Nothing was sent.');
  expect(api.saveListingEnrichment).toHaveBeenCalledOnce();
});

it.each([
  ['verified_sample_unavailable_above_25_column_cap', 'A verified sample is not available for a dataset above the approved 25-column cap. This is a product limit, not an error in your dataset.'],
  ['dictionary_must_match_committed_dataset_schema_republish_through_aim_data', 'The dictionary must match the committed dataset schema. Update the source file and publish a new listing version to restore agreement.'],
  ['dictionary_field_unknown', 'A dictionary field no longer matches the listing. Reload the optional details; if it still differs, publish a new listing version from the source file.'],
  ['dictionary_removal_forbidden', 'Dictionary fields cannot be removed here. Restore the field, or publish a new listing version with the changed schema.'],
  ['aggregate_column_unknown', 'An aggregate column no longer matches the listing. Publish a new listing version with updated statistics, then reload the optional details.'],
  ['generated_statement_not_guarded', 'This generated statement cannot be changed from this form. Update the source listing, then reload the optional details.'],
])('shows the actionable %s refusal', async (detail, message) => {
  vi.mocked(api.saveListingEnrichment).mockRejectedValueOnce(new AxiosError(detail, '409', undefined, undefined, {status: 409, data: {detail}} as never));
  render(<SellerEnrichmentControls listingId="listing" />);
  fireEvent.click(await screen.findByText('Optional listing details'));
  fireEvent.change(await screen.findByLabelText(/^Dataset origin statement/), {target: {value: 'Changed.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  expect((await screen.findByRole('alert')).textContent).toBe(message);
});

it('turns a structured 422 validation refusal into a next action instead of an identical retry', async () => {
  vi.mocked(api.saveListingEnrichment).mockRejectedValueOnce(new AxiosError('validation', '422', undefined, undefined, {status: 422, data: {detail: [{loc: ['body', 'schema_info'], msg: 'Field required'}]}} as never));
  render(<SellerEnrichmentControls listingId="listing" />);
  fireEvent.click(await screen.findByText('Optional listing details'));
  fireEvent.change(await screen.findByLabelText(/^Dataset origin statement/), {target: {value: 'Changed.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  expect((await screen.findByRole('alert')).textContent).toBe('The optional details do not match the current listing. Reload them; if the problem remains, publish a new listing version with updated source metadata.');
  expect(screen.queryByText(/identical save/)).toBeNull();
});

it('counts Unicode characters like the backend instead of UTF-16 units', async () => {
  render(<SellerEnrichmentControls listingId="listing" />);
  fireEvent.click(await screen.findByText('Optional listing details'));
  const statement = '😀'.repeat(2_000);
  fireEvent.change(await screen.findByLabelText(/^Dataset origin statement/), {target: {value: statement}});
  expect(screen.getByText('Optional seller statement. 2,000 / 2,000 characters.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  await waitFor(() => expect(api.saveListingEnrichment).toHaveBeenCalledOnce());
});


it('recovers an initial load failure through retry without saving or remounting', async () => {
  vi.mocked(api.fetchListingEnrichment).mockRejectedValueOnce(new Error('offline'));
  render(<SellerEnrichmentControls listingId="listing" />);
  const summary = screen.getByText('Optional listing details');
  fireEvent.click(summary);
  await screen.findByRole('alert');
  fireEvent.click(summary);
  fireEvent.click(summary);
  expect(api.fetchListingEnrichment).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText(/^Dataset origin statement/)).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Retry optional details'}));
  expect(await screen.findByLabelText(/^Dataset origin statement/)).toBeTruthy();
  expect(api.fetchListingEnrichment).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button', {name: 'Retry optional details'})).toBeNull();
  expect(api.saveListingEnrichment).not.toHaveBeenCalled();
});

it('keeps initial load retry usable after another failure', async () => {
  vi.mocked(api.fetchListingEnrichment)
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new Error('still offline'));
  render(<SellerEnrichmentControls listingId="listing" />);
  fireEvent.click(screen.getByText('Optional listing details'));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', {name: 'Retry optional details'}));
  await screen.findByRole('alert');
  const retryButton = screen.getByRole('button', {name: 'Retry optional details'});
  expect(retryButton.hasAttribute('disabled')).toBe(false);
  fireEvent.click(retryButton);
  await screen.findByLabelText(/^Dataset origin statement/);
  expect(api.fetchListingEnrichment).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(api.saveListingEnrichment).not.toHaveBeenCalled();
});

it('prevents duplicate requests while an initial load retry is pending', async () => {
  let resolveRetry!: (result: api.EnrichmentView) => void;
  vi.mocked(api.fetchListingEnrichment)
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(() => new Promise(resolve => {resolveRetry = resolve;}));
  render(<SellerEnrichmentControls listingId="listing" />);
  fireEvent.click(screen.getByText('Optional listing details'));
  await screen.findByRole('alert');
  const retryButton = screen.getByRole('button', {name: 'Retry optional details'});
  act(() => {fireEvent.click(retryButton); fireEvent.click(retryButton);});
  expect(api.fetchListingEnrichment).toHaveBeenCalledTimes(2);
  expect(retryButton.hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('status').textContent).toBe('Loading optional details…');
  fireEvent.click(retryButton);
  expect(api.fetchListingEnrichment).toHaveBeenCalledTimes(2);
  await act(async () => {resolveRetry(view);});
  expect(screen.getByLabelText(/^Dataset origin statement/)).toBeTruthy();
  expect(api.saveListingEnrichment).not.toHaveBeenCalled();
});

it('does not retry an initial load failure while inactive', async () => {
  vi.mocked(api.fetchListingEnrichment).mockRejectedValueOnce(new Error('offline'));
  const {rerender} = render(<SellerEnrichmentControls listingId="listing" active={false} />);
  fireEvent.click(screen.getByText('Optional listing details'));
  expect(api.fetchListingEnrichment).not.toHaveBeenCalled();
  rerender(<SellerEnrichmentControls listingId="listing" />);
  await screen.findByRole('alert');
  rerender(<SellerEnrichmentControls listingId="listing" active={false} />);
  const retryButton = screen.getByRole('button', {name: 'Retry optional details'});
  expect(retryButton.hasAttribute('disabled')).toBe(true);
  fireEvent.click(retryButton);
  expect(api.fetchListingEnrichment).toHaveBeenCalledTimes(1);
  expect(api.saveListingEnrichment).not.toHaveBeenCalled();
});

it.each(['inactive', 'unmount', 'listing change'] as const)('cancels a pending initial load retry on %s', async transition => {
  let resolveRetry!: (result: api.EnrichmentView) => void;
  vi.mocked(api.fetchListingEnrichment)
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(() => new Promise(resolve => {resolveRetry = resolve;}))
    .mockResolvedValueOnce({...view, values: {dataset_origin_statement: {value: 'New listing'}}} as api.EnrichmentView);
  const {rerender, unmount} = render(<SellerEnrichmentControls listingId="listing" />);
  fireEvent.click(screen.getByText('Optional listing details'));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', {name: 'Retry optional details'}));
  const signal = vi.mocked(api.fetchListingEnrichment).mock.calls[1][1];
  expect(signal?.aborted).toBe(false);
  if (transition === 'unmount') unmount();
  else rerender(<SellerEnrichmentControls listingId={transition === 'listing change' ? 'new-listing' : 'listing'} active={transition !== 'inactive'} />);
  expect(signal?.aborted).toBe(true);
  await act(async () => {resolveRetry({...view, values: {dataset_origin_statement: {value: 'Cancelled result'}}} as api.EnrichmentView);});
  if (transition === 'listing change') {
    expect((screen.getByLabelText(/^Dataset origin statement/) as HTMLTextAreaElement).value).toBe('New listing');
    expect(vi.mocked(api.fetchListingEnrichment).mock.calls[2][0]).toBe('new-listing');
  } else expect(screen.queryByLabelText(/^Dataset origin statement/)).toBeNull();
  expect(api.fetchListingEnrichment).toHaveBeenCalledTimes(transition === 'listing change' ? 3 : 2);
  expect(api.saveListingEnrichment).not.toHaveBeenCalled();
});
