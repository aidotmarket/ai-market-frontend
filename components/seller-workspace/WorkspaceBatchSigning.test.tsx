// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkspaceBatchSigning from './WorkspaceBatchSigning';
import { readSigningInstruments, signInstruments } from '@/api/seller-batch-signing';
import { nativeClient } from '@/api/connector-seller-settings';
import { useSellerSwitches, type SellerProfileSwitches } from '@/hooks/useSellerSwitches';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
import {LICENSE_HASHES_1_0} from '@/api/listingLicenses';
import { id, instrument, hash } from '@/tests/fixtures/seller-authority';
vi.mock('@/hooks/useSellerSwitches', async original => ({ ...await original<typeof import('@/hooks/useSellerSwitches')>(), useSellerSwitches: vi.fn() }));
vi.mock('@/api/seller-batch-signing', async original => ({ ...await original<typeof import('@/api/seller-batch-signing')>(), readSigningInstruments: vi.fn(), signInstruments: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks(); useAuthStore.setState({ user: { id: id(99), totp_enabled: true } as User, token: 'retained-session' });
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, effects: true, bulk: true });
  vi.mocked(readSigningInstruments).mockResolvedValue([instrument(1), instrument(2)]);
  vi.mocked(signInstruments).mockResolvedValue([]);
  vi.spyOn(nativeClient, 'get').mockResolvedValue({ data: { full_text: 'The complete fixture contract <script>safe text</script>' } });
});
afterEach(() => {
  expect(screen.queryByRole('dialog', { name: 'Re-authenticate' })).toBeNull();
  expect(screen.queryByPlaceholderText('Enter code')).toBeNull();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function load() {
  render(<WorkspaceBatchSigning />);
  fireEvent.change(screen.getByLabelText(/Listing preparation IDs/), { target: { value: `${id(1)}\n${id(2)}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Load licences' }));
  await waitFor(() => expect(screen.getAllByText(/The complete fixture contract/)).toHaveLength(4));
}
it.each([null, { seller: false, effects: true, bulk: true }, { seller: true, effects: true, bulk: false }])('hides the entire signing entry without seller and bulk reporting %j', report => {
  vi.mocked(useSellerSwitches).mockReturnValue(report); render(<WorkspaceBatchSigning />); expect(screen.queryByRole('region')).toBeNull(); expect(readSigningInstruments).not.toHaveBeenCalled();
});
it('presents primary action buttons and enables signing only after consent', async () => {
  render(<WorkspaceBatchSigning preparation={instrument(1)} />);
  await screen.findAllByText(/The complete fixture contract/);
  const signButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Sign licence' });
  expect(signButton.tagName).toBe('BUTTON');
  expect(signButton.type).toBe('button');
  expect(signButton.classList.contains('bg-indigo-700')).toBe(true);
  expect(signButton.disabled).toBe(true);
  expect(screen.getByText('Tick the box above to sign.')).toBeTruthy();

  fireEvent.click(screen.getByRole('checkbox'));
  expect(signButton.disabled).toBe(false);
  expect(screen.queryByText('Tick the box above to sign.')).toBeNull();

  fireEvent.click(signButton);
  await screen.findByText(/Licence signed. Your listing is not published yet/);
  expect(screen.queryByText('Tick the box above to sign.')).toBeNull();
});
it('styles the load licences button as a primary action and waits for loaded instruments to show the hint', () => {
  render(<WorkspaceBatchSigning />);
  const loadButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Load licences' });
  expect(loadButton.type).toBe('button');
  expect(loadButton.classList.contains('bg-indigo-700')).toBe(true);
  expect(screen.queryByText('Tick the box above to sign.')).toBeNull();
});
it('displays all exact instruments, revisions, coverage and full terms before one separate signing submission', async () => {
  await load(); expect(screen.getAllByRole('region', { name: /^Licence \d/ })).toHaveLength(2); expect(document.querySelector('script')).toBeNull();
  const checkbox = screen.getByRole('checkbox'); expect((checkbox as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole('button', { name: 'Sign 2 licences' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  fireEvent.click(checkbox); fireEvent.click(screen.getByRole('button', { name: 'Sign 2 licences' }));
  await screen.findByText(/Licence signed. Your listing is not published yet/);
  const body = vi.mocked(signInstruments).mock.calls[0][0];
  expect(body.csrf).toHaveLength(64); expect(body.instruments).toEqual([1, 2].map(n => ({ preparation_id: id(n), coverage_hash: hash, selection: instrument(n).license_selection })));
  expect(signInstruments).toHaveBeenCalledTimes(1);
});
it('invalidates the display and confirmation when the target set changes', async () => {
  await load(); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText(/Listing preparation IDs/), { target: { value: id(3) } });
  expect(screen.queryByRole('region', { name: /^Licence \d/ })).toBeNull();
  expect((screen.getByRole('button', { name: 'Sign 0 licences' }) as HTMLButtonElement).disabled).toBe(true); expect(signInstruments).not.toHaveBeenCalled();
});
it('refuses the whole batch if saved custom licence text and rider cannot be displayed', async () => {
  const custom = instrument(2); custom.license_selection.kind = 'custom'; custom.license_selection.license_document_id = id(8); custom.license_selection.rider_sha256 = hash;
  vi.mocked(readSigningInstruments).mockResolvedValue([instrument(1), custom]);
  render(<WorkspaceBatchSigning />); fireEvent.change(screen.getByLabelText(/Listing preparation IDs/), { target: { value: id(2) } }); fireEvent.click(screen.getByRole('button', { name: 'Load licences' }));
  await screen.findByText(/saved custom licence and rider/); fireEvent.click(screen.getByRole('checkbox'));
  expect((screen.getByRole('button', { name: 'Sign 2 licences' }) as HTMLButtonElement).disabled).toBe(true); expect(signInstruments).not.toHaveBeenCalled();
});
it('cannot sign after stale prepared coverage and offers fresh review', async () => {
  await load(); vi.mocked(signInstruments).mockRejectedValue({ response: { status: 409, data: { detail: 'DISPLAYED_INSTRUMENT_STALE' } } });
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Sign 2 licences' })); await screen.findByRole('alert');
  expect((screen.getByRole('button', { name: 'Sign 2 licences' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByText('Tick the box above to sign.')).toBeNull();
});
it('keeps effect-off signing disabled', () => {
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, effects: false, bulk: true }); render(<WorkspaceBatchSigning />);
  expect(screen.queryByRole('region')).toBeNull(); expect(signInstruments).not.toHaveBeenCalled();
});

it.each([true, false])('keeps Claude-only signing markup unchanged (effects: %s)', effects => {
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, bulk: true, effects });
  const legacy = render(<WorkspaceBatchSigning />);
  const markup = legacy.container.innerHTML; legacy.unmount();
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, bulk: true, effects, profiles: { claude: { floors: effects, seller_mode: 'full' } } });
  const current = render(<WorkspaceBatchSigning />);
  expect(current.container.innerHTML).toBe(markup);
});

it.each([
  ['full', true, false, true], ['full', false, true, false],
  ['fallback', true, true, false], ['fallback', false, true, false],
  ['off', true, true, false], ['off', false, true, false],
] as const)('gates ChatGPT-only %s using its own floors %s, regardless of Claude floors %s', (seller_mode, floors, effects, available) => {
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, bulk: true, effects, profiles: { openai: { floors, seller_mode } } });
  render(<WorkspaceBatchSigning />);
  expect(!!screen.queryByRole('region', { name: 'Workspace batch licence signing' })).toBe(available);
  expect(screen.getByText(`ChatGPT seller mode: ${seller_mode === 'full' ? 'Full' : seller_mode === 'fallback' ? 'Limited mode' : 'Off'}.`)).toBeTruthy();
  if (!available) {
    expect(screen.getByRole('status').textContent).toContain(seller_mode === 'fallback' ? 'ChatGPT seller tools are in limited mode' : 'ChatGPT seller tools are paused');
    expect(readSigningInstruments).not.toHaveBeenCalled();
    expect(nativeClient.get).not.toHaveBeenCalled();
    expect(signInstruments).not.toHaveBeenCalled();
  }
  expect(screen.queryByRole('switch')).toBeNull();
  expect(document.body.textContent).not.toMatch(/seller_mode|openai:commercial|floors/);
});

it.each(['seller', 'bulk'] as const)('still requires the top-level %s flag for ChatGPT-only full mode', flag => {
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, bulk: true, effects: true, [flag]: false, profiles: { openai: { floors: true, seller_mode: 'full' } } });
  render(<WorkspaceBatchSigning preparation={instrument(1)} />);
  expect(screen.queryByRole('region')).toBeNull();
  expect(nativeClient.get).not.toHaveBeenCalled();
});

it('lets a ChatGPT-only full-mode seller load and sign while Claude floors are off', async () => {
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, bulk: true, effects: false, profiles: { openai: { floors: true, seller_mode: 'full' } } });
  await load();
  fireEvent.click(screen.getByRole('checkbox'));
  expect((screen.getByRole('button', { name: 'Sign 2 licences' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Sign 2 licences' }));
  await screen.findByText(/Licence signed. Your listing is not published yet/);
  expect(signInstruments).toHaveBeenCalledTimes(1);
});

it.each(['full', 'fallback', 'off'] as SellerProfileSwitches['seller_mode'][])('keeps the website Claude gate with both grants even when ChatGPT is %s', seller_mode => {
  const profiles = { claude: { floors: true, seller_mode: 'full' as const }, openai: { floors: false, seller_mode } };
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, bulk: true, effects: true, profiles });
  const view = render(<WorkspaceBatchSigning />);
  expect(screen.getByRole('button', { name: 'Load licences' })).toBeTruthy();
  expect(screen.getByText(/ChatGPT seller mode:/)).toBeTruthy();
  // Enabling ChatGPT must not bypass a paused Claude website path.
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, bulk: true, effects: false, profiles: { ...profiles, openai: { floors: true, seller_mode } } });
  view.rerender(<WorkspaceBatchSigning />);
  expect(screen.queryByRole('region')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Licence signing is currently unavailable.');
});

it.each(['fallback', 'off', 'floors'] as const)('stops a loaded ChatGPT-only signing action when polling reports %s', async pause => {
  const report = { seller: true, bulk: true, effects: true, profiles: { openai: { floors: true, seller_mode: 'full' as const } } };
  vi.mocked(useSellerSwitches).mockReturnValue(report);
  const preparation = instrument(1);
  const view = render(<WorkspaceBatchSigning preparation={preparation} />);
  await screen.findAllByText(/The complete fixture contract/);
  fireEvent.click(screen.getByRole('checkbox'));
  const sign = screen.getByRole<HTMLButtonElement>('button', { name: 'Sign licence' });
  expect(sign.disabled).toBe(false);
  vi.mocked(useSellerSwitches).mockReturnValue({ ...report, profiles: { openai: { floors: pause !== 'floors', seller_mode: pause === 'floors' ? 'full' : pause } } });
  view.rerender(<WorkspaceBatchSigning preparation={preparation} />);
  expect(screen.queryByRole('button', { name: 'Sign licence' })).toBeNull();
  fireEvent.click(sign);
  expect(signInstruments).not.toHaveBeenCalled();
});

it.each(['standard', 'covenant', 'both'] as const)('blocks a whole batch containing a stale %s selection',async part=>{
 const old=instrument(1);
 if(part!=='covenant') Object.assign(old.license_selection,{version:'1.0',license_sha256:LICENSE_HASHES_1_0.standard.true});
 if(part!=='standard') Object.assign(old.license_selection,{covenant_version:'1.0',covenant_sha256:LICENSE_HASHES_1_0.covenant});
 vi.mocked(readSigningInstruments).mockResolvedValue([old,instrument(2)]);
 render(<WorkspaceBatchSigning />);
 fireEvent.change(screen.getByLabelText(/Listing preparation IDs/),{target:{value:id(1)}});
 fireEvent.click(screen.getByRole('button',{name:'Load licences'}));
 await screen.findByText(/choose the current licence and covenant, then prepare and sign again/);
 expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Sign 2 licences'}) as HTMLButtonElement).disabled).toBe(true);
 expect(nativeClient.get).not.toHaveBeenCalled();
 expect(signInstruments).not.toHaveBeenCalled();
});

it('blocks a preloaded historical preparation and requests re-selection',async()=>{
 const old=instrument(1);Object.assign(old.license_selection,{covenant_version:'1.0',covenant_sha256:LICENSE_HASHES_1_0.covenant});
 render(<WorkspaceBatchSigning preparation={old}/>);
 await screen.findByText(/choose the current licence and covenant, then prepare and sign again/);
 expect((screen.getByRole('button',{name:'Sign licence'}) as HTMLButtonElement).disabled).toBe(true);
 expect(signInstruments).not.toHaveBeenCalled();
});

it.each(['LICENSE_ACCEPTANCE_STALE',{code:'LICENSE_ACCEPTANCE_STALE'}])('explains a backend stale acceptance response %j',async detail=>{
 await load();
 vi.mocked(signInstruments).mockRejectedValue({response:{status:409,data:{detail}}});
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Sign 2 licences'}));
 await screen.findByText(/choose the current licence and covenant, then prepare and sign again/);
 expect((screen.getByRole('button',{name:'Sign 2 licences'}) as HTMLButtonElement).disabled).toBe(true);
});
it('shows seller terms and identity without internal IDs, hashes or jargon in the Workspace flow', async () => {
  const row=instrument(1);
  const view=render(<WorkspaceBatchSigning preparation={row}/>);
  await screen.findAllByText(/The complete fixture contract/);
  const text=view.container.textContent??'';
  for(const value of Object.values(row.binding)) {
    if(typeof value==='string')expect(text).not.toContain(value);
  }
  for(const value of ['seller_id','preparation_id','coverage_hash','{','instruments','Generic Confirm','action-batch'])expect(text).not.toContain(value);
  expect(text).not.toMatch(/[a-f0-9]{64}/i);
  expect(view.container.innerHTML).not.toContain(row.id);
  expect(screen.getByRole('heading',{name:'Sign your licence'})).toBeTruthy();
  expect(screen.getByRole('heading',{name:'Standard licence'})).toBeTruthy();
  expect(screen.getByText('Signer: Fixture Seller · Owner')).toBeTruthy();
  expect(screen.getByText('AI/ML training: Allowed')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Sign licence'})).toBeTruthy();
  expect(screen.queryByLabelText(/Listing preparation IDs/)).toBeNull();
});
it('shows training permission and plural consent for multiple listings',async()=>{
  const training=instrument(1);
  const {createStandardSelection}=await import('@/api/listingLicenses');
  training.license_selection={...createStandardSelection(true),seller_acceptance:training.license_selection.seller_acceptance};
  const noTraining=instrument(2);
  noTraining.license_selection={...createStandardSelection(false),seller_acceptance:noTraining.license_selection.seller_acceptance};
  vi.mocked(readSigningInstruments).mockResolvedValue([training,noTraining]);
  await load();
  expect(screen.getByText('AI/ML training: Allowed')).toBeTruthy();
  expect(screen.getByRole('checkbox').parentElement?.textContent).toContain('all 2 licences');
});
it('explains the cap in plain words and keeps signing disabled for more than 50 loaded listings',async()=>{
  vi.mocked(readSigningInstruments).mockResolvedValue(Array.from({length:51},(_,index)=>instrument(index+1)));
  render(<WorkspaceBatchSigning/>);
  fireEvent.change(screen.getByLabelText(/Listing preparation IDs/),{target:{value:id(1)}});
  fireEvent.click(screen.getByRole('button',{name:'Load licences'}));
  await screen.findByText('You can sign up to 50 listings at once.');
  fireEvent.click(screen.getByRole('checkbox'));
  expect((screen.getByRole('button',{name:'Sign 51 licences'}) as HTMLButtonElement).disabled).toBe(true);
  expect(signInstruments).not.toHaveBeenCalled();
});

it('shows licence 1.1 and covenant 1.1 and loads their exact documents', async () => {
  render(<WorkspaceBatchSigning preparation={instrument(1)} />);
  await screen.findAllByText(/The complete fixture contract/);
  expect(screen.getByRole('heading', { name: 'Full licence (version 1.1)' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Marketplace Listing Covenant (version 1.1)' })).toBeTruthy();
  expect(vi.mocked(nativeClient.get).mock.calls.map(([path]) => path)).toEqual([
    '/licenses/standard/1.1/ai-training?format=json', '/licenses/marketplace-listing/1.1?format=json',
  ]);
});
it('allows signing again after a stale acceptance is replaced by a current preparation', async () => {
  const old = instrument(1);
  Object.assign(old.license_selection, { version: '1.0', license_sha256: LICENSE_HASHES_1_0.standard.true });
  const view = render(<WorkspaceBatchSigning preparation={old} />);
  await screen.findByText(/choose the current licence and covenant, then prepare and sign again/);
  expect((screen.getByRole('button', { name: 'Sign licence' }) as HTMLButtonElement).disabled).toBe(true);
  const current = instrument(2);
  view.rerender(<WorkspaceBatchSigning preparation={current} />);
  await screen.findAllByText(/The complete fixture contract/);
  expect(screen.queryByText(/This saved licence choice is out of date/)).toBeNull();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Sign licence' }));
  await screen.findByText(/Licence signed. Your listing is not published yet/);
  expect(signInstruments).toHaveBeenCalledTimes(1);
  expect(vi.mocked(signInstruments).mock.calls[0][0].instruments).toEqual([
    { preparation_id: current.id, coverage_hash: current.coverage_hash, selection: current.license_selection },
  ]);
  expect(vi.mocked(signInstruments).mock.calls[0][0]).not.toHaveProperty('reauth_token');
});
it.each(['LOGIN_REQUIRED', 'SECOND_FACTOR_REQUIRED', 'TOTP_REQUIRED'])('never starts re-authentication after a signing refusal: %s', async detail => {
  await load();
  vi.mocked(signInstruments).mockRejectedValue({ response: { status: 403, data: { detail } } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Sign 2 licences' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: /sign in|verify|authenticate|code/i })).toBeNull();
  expect(signInstruments).toHaveBeenCalledTimes(1);
});
