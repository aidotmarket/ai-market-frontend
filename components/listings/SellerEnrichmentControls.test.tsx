// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
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
  expect(screen.getByText(/Republish the dictionary through AIM Data/)).toBeTruthy();
  unit.removeAttribute('disabled');
  fireEvent.change(unit, {target: {value: 'cents'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save optional details'}));
  expect(screen.getByRole('alert').textContent).toBe('Units cannot be changed here because this dictionary is missing required write fields. Republish the dictionary through AIM Data, then reload the optional details.');
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
  ['dictionary_must_match_committed_dataset_schema_republish_through_aim_data', 'The dictionary must match the committed dataset schema. Republish through AIM Data to restore agreement.'],
  ['dictionary_field_unknown', 'A dictionary field no longer matches the listing. Reload the optional details; if it still differs, republish the dictionary through AIM Data.'],
  ['dictionary_removal_forbidden', 'Dictionary fields cannot be removed here. Restore the field, or republish schema changes through AIM Data.'],
  ['aggregate_column_unknown', 'An aggregate column no longer matches the listing. Republish the aggregate statistics through AIM Data, then reload the optional details.'],
  ['generated_statement_not_guarded', 'This generated statement cannot be changed from this form. Regenerate or replace it through AIM Data, then reload the optional details.'],
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
  expect((await screen.findByRole('alert')).textContent).toBe('The optional details do not match the current listing contract. Reload them; if the problem remains, republish the affected metadata through AIM Data.');
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
