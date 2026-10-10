// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkspaceBatchSigning from './WorkspaceBatchSigning';
import { readSigningInstruments, signInstruments } from '@/api/seller-batch-signing';
import { nativeClient } from '@/api/connector-seller-settings';
import { useSellerSwitches } from '@/hooks/useSellerSwitches';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
import { id, instrument, hash } from '@/tests/fixtures/seller-authority';
vi.mock('@/hooks/useSellerSwitches', () => ({ useSellerSwitches: vi.fn() }));
vi.mock('@/api/seller-batch-signing', async original => ({ ...await original<typeof import('@/api/seller-batch-signing')>(), readSigningInstruments: vi.fn(), signInstruments: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks(); useAuthStore.setState({ user: { id: id(99), totp_enabled: true } as User, token: 'retained-session' });
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, effects: true, bulk: true });
  vi.mocked(readSigningInstruments).mockResolvedValue([instrument(1), instrument(2)]);
  vi.mocked(signInstruments).mockResolvedValue([]);
  vi.spyOn(nativeClient, 'get').mockResolvedValue({ data: { full_text: 'The complete fixture contract <script>safe text</script>' } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function load() {
  render(<WorkspaceBatchSigning />);
  fireEvent.change(screen.getByLabelText(/Prepared instrument IDs/), { target: { value: `${id(1)}\n${id(2)}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Load complete licence batch' }));
  await waitFor(() => expect(screen.getAllByText(/The complete fixture contract/)).toHaveLength(4));
}
it.each([null, { seller: false, effects: true, bulk: true }, { seller: true, effects: true, bulk: false }])('hides the entire signing entry without seller and bulk reporting %j', report => {
  vi.mocked(useSellerSwitches).mockReturnValue(report); render(<WorkspaceBatchSigning />); expect(screen.queryByRole('region')).toBeNull(); expect(readSigningInstruments).not.toHaveBeenCalled();
});
it('displays all exact instruments, revisions, coverage and full terms before one separate signing submission', async () => {
  await load(); expect(screen.getAllByRole('region', { name: /^Instrument/ })).toHaveLength(2); expect(document.querySelector('script')).toBeNull();
  const checkbox = screen.getByRole('checkbox'); expect((checkbox as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole('button', { name: 'Sign 2 licences' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  fireEvent.click(checkbox); fireEvent.click(screen.getByRole('button', { name: 'Sign 2 licences' }));
  await screen.findByText(/Licences signed. Nothing was published/);
  const body = vi.mocked(signInstruments).mock.calls[0][0];
  expect(body.csrf).toHaveLength(64); expect(body.instruments).toEqual([1, 2].map(n => ({ preparation_id: id(n), coverage_hash: hash, selection: instrument(n).license_selection })));
  expect(signInstruments).toHaveBeenCalledTimes(1);
});
it('invalidates the display and confirmation when the target set changes', async () => {
  await load(); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText(/Prepared instrument IDs/), { target: { value: id(3) } });
  expect(screen.queryByRole('region', { name: /^Instrument/ })).toBeNull();
  expect((screen.getByRole('button', { name: 'Sign 0 licences' }) as HTMLButtonElement).disabled).toBe(true); expect(signInstruments).not.toHaveBeenCalled();
});
it('refuses the whole batch if saved custom licence text and rider cannot be displayed', async () => {
  const custom = instrument(2); custom.license_selection.kind = 'custom'; custom.license_selection.license_document_id = id(8); custom.license_selection.rider_sha256 = hash;
  vi.mocked(readSigningInstruments).mockResolvedValue([instrument(1), custom]);
  render(<WorkspaceBatchSigning />); fireEvent.change(screen.getByLabelText(/Prepared instrument IDs/), { target: { value: id(2) } }); fireEvent.click(screen.getByRole('button', { name: 'Load complete licence batch' }));
  await screen.findByText(/saved custom licence and rider/); fireEvent.click(screen.getByRole('checkbox'));
  expect((screen.getByRole('button', { name: 'Sign 2 licences' }) as HTMLButtonElement).disabled).toBe(true); expect(signInstruments).not.toHaveBeenCalled();
});
it('cannot sign after stale prepared coverage and offers fresh review', async () => {
  await load(); vi.mocked(signInstruments).mockRejectedValue({ response: { status: 409, data: { detail: 'DISPLAYED_INSTRUMENT_STALE' } } });
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Sign 2 licences' })); await screen.findByRole('alert');
  expect((screen.getByRole('button', { name: 'Sign 2 licences' }) as HTMLButtonElement).disabled).toBe(true);
});
it('keeps effect-off signing disabled', () => {
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, effects: false, bulk: true }); render(<WorkspaceBatchSigning />);
  expect(screen.queryByRole('region')).toBeNull(); expect(signInstruments).not.toHaveBeenCalled();
});
