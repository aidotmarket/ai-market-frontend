// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from '@/tests/fixtures/s1735_license_record.json';
import { useAuthStore } from '@/store/auth';
import type { LicenseRecord, User } from '@/types';
import LicenseRecordView from './LicenseRecordView';

const mocks = vi.hoisted(() => ({ id: 'order-a', getLicenseRecord: vi.fn(), downloadLicenseRecordPdf: vi.fn(), confirmLicenseRecordDeletion: vi.fn() }));
vi.mock('@/api/licenseRecords', () => mocks);
vi.mock('next/navigation', () => ({ useParams: () => ({ id: mocks.id }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function record(title: string, status: 'active' | 'terminated' = 'terminated'): LicenseRecord {
  return { ...fixture, status, listing: { ...fixture.listing, title }, lifecycle_events: status === 'active' ? [] : [{ event_type: 'terminated', occurred_at: '2026-10-01T00:00:00Z', deletion_due_at: '2026-11-01T00:00:00Z', reason: null, actor_type: 'system', metadata: null }] } as LicenseRecord;
}
const ack = { occurred_at: '2026-10-02T00:00:00Z' };
const pdf = () => screen.getByRole('button', { name: 'Download PDF' });
const confirm = () => screen.getByRole('button', { name: 'Confirm deletion' });
const account = (id: string | null) => useAuthStore.setState({ user: id ? { id } as User : null, token: id ? 'fake-session' : null });
let createUrl: ReturnType<typeof vi.fn>, revokeUrl: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks(); mocks.id = 'order-a'; account('account-a');
  mocks.getLicenseRecord.mockImplementation((id: string) => Promise.resolve(record(id)));
  mocks.confirmLicenseRecordDeletion.mockResolvedValue(ack);
  createUrl = vi.fn(() => 'blob:fixture'); revokeUrl = vi.fn();
  vi.stubGlobal('URL', { ...URL, createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('removes A record and controls while B read is pending', async () => {
  const next = deferred<LicenseRecord>();
  const view = render(<LicenseRecordView party="buyer" />); await screen.findByText('order-a');
  const old = confirm();
  mocks.getLicenseRecord.mockReturnValue(next.promise); mocks.id = 'order-b'; view.rerender(<LicenseRecordView party="buyer" />);
  const stale = screen.queryByRole('button', { name: 'Confirm deletion' });
  if (stale) fireEvent.click(stale);
  expect(mocks.confirmLicenseRecordDeletion).not.toHaveBeenCalled();
  expect(screen.queryByText('order-a')).toBeNull(); expect(screen.queryByRole('button', { name: 'Confirm deletion' })).toBeNull();
  fireEvent.click(old); expect(mocks.confirmLicenseRecordDeletion).not.toHaveBeenCalled();
  await act(async () => next.resolve(record('order-b')));
  fireEvent.click(confirm()); expect(mocks.confirmLicenseRecordDeletion).toHaveBeenCalledWith('order-b');
});

it.each(['success', 'error'] as const)('isolates late A confirmation %s and finally from busy B', async outcome => {
  const old = deferred<typeof ack>(), current = deferred<typeof ack>();
  mocks.confirmLicenseRecordDeletion.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const view = render(<LicenseRecordView party="buyer" />); await screen.findByText('order-a'); fireEvent.click(confirm());
  mocks.id = 'order-b'; view.rerender(<LicenseRecordView party="buyer" />); await screen.findByText('order-b'); fireEvent.click(confirm());
  await act(async () => { if (outcome === 'success') old.resolve(ack); else old.reject({ private: 'not renderable' }); });
  expect(screen.queryByText(/^Deletion confirmed/)).toBeNull(); expect(screen.queryByRole('alert')).toBeNull(); expect((confirm() as HTMLButtonElement).disabled).toBe(true);
  await act(async () => current.resolve(ack)); expect(screen.getByText(/^Deletion confirmed/)).toBeTruthy();
  expect(mocks.confirmLicenseRecordDeletion.mock.calls).toEqual([['order-a'], ['order-b']]);
});

it.each(['route', 'party', 'account', 'logout', 'unmount'] as const)('retires pending PDF on %s without browser activation', async change => {
  const flight = deferred<Blob>(); mocks.downloadLicenseRecordPdf.mockReturnValue(flight.promise);
  const view = render(<LicenseRecordView party="buyer" />); await screen.findByText('order-a'); fireEvent.click(pdf());
  if (change === 'route') { mocks.id = 'order-b'; view.rerender(<LicenseRecordView party="buyer" />); }
  if (change === 'party') view.rerender(<LicenseRecordView party="seller" />);
  if (change === 'account') act(() => account('account-b'));
  if (change === 'logout') act(() => account(null));
  if (change === 'unmount') view.unmount();
  await act(async () => flight.resolve(new Blob(['fake pdf'])));
  expect(createUrl).not.toHaveBeenCalled(); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled(); expect(revokeUrl).not.toHaveBeenCalled();
});

it.each(['route', 'party', 'account'] as const)('does not revive old read after %s A → B → A', async change => {
  const old = deferred<LicenseRecord>(), fresh = deferred<LicenseRecord>();
  mocks.getLicenseRecord.mockReturnValueOnce(old.promise).mockResolvedValueOnce(record('middle')).mockReturnValueOnce(fresh.promise);
  const view = render(<LicenseRecordView party="buyer" />);
  const move = (back: boolean) => {
    if (change === 'route') { mocks.id = back ? 'order-a' : 'order-b'; view.rerender(<LicenseRecordView party="buyer" />); }
    if (change === 'party') view.rerender(<LicenseRecordView party={back ? 'buyer' : 'seller'} />);
    if (change === 'account') act(() => account(back ? 'account-a' : 'account-b'));
  };
  move(false); await screen.findByText('middle'); move(true);
  await act(async () => old.resolve(record('obsolete'))); expect(screen.queryByText('obsolete')).toBeNull();
  await act(async () => fresh.resolve(record('fresh'))); expect(screen.getByText('fresh')).toBeTruthy();
});

it('retires a confirmation even across batched account A → B → A', async () => {
  const old = deferred<typeof ack>(); mocks.confirmLicenseRecordDeletion.mockReturnValue(old.promise);
  render(<LicenseRecordView party="buyer" />); await screen.findByText('order-a'); fireEvent.click(confirm());
  mocks.getLicenseRecord.mockResolvedValue(record('new visit'));
  act(() => { account('account-b'); account('account-a'); }); await screen.findByText('new visit');
  await act(async () => old.resolve(ack)); expect(screen.queryByText(/^Deletion confirmed/)).toBeNull(); expect((confirm() as HTMLButtonElement).disabled).toBe(false);
});

it.each(['route', 'party', 'account', 'unmount'] as const)('keeps late confirmation inert after %s retirement and return', async change => {
  const old = deferred<typeof ack>(); mocks.confirmLicenseRecordDeletion.mockReturnValueOnce(old.promise).mockResolvedValue(ack);
  const view = render(<LicenseRecordView party="buyer" />); await screen.findByText('order-a'); fireEvent.click(confirm());
  if (change === 'route') { mocks.id = 'order-b'; view.rerender(<LicenseRecordView party="buyer" />); }
  if (change === 'party') view.rerender(<LicenseRecordView party="seller" />);
  if (change === 'account') act(() => account('account-b'));
  if (change === 'unmount') view.unmount();
  if (change !== 'unmount') await screen.findByText('order-' + (change === 'route' ? 'b' : 'a'));
  mocks.getLicenseRecord.mockResolvedValue(record('returned'));
  if (change === 'route') { mocks.id = 'order-a'; view.rerender(<LicenseRecordView party="buyer" />); }
  if (change === 'party') view.rerender(<LicenseRecordView party="buyer" />);
  if (change === 'account') act(() => account('account-a'));
  if (change === 'unmount') render(<LicenseRecordView party="buyer" />);
  await screen.findByText('returned');
  await act(async () => old.resolve(ack)); expect(screen.queryByText(/^Deletion confirmed/)).toBeNull();
  fireEvent.click(confirm()); await screen.findByText(/^Deletion confirmed/);
  expect(mocks.confirmLicenseRecordDeletion.mock.calls).toEqual([['order-a'], ['order-a']]);
});

it.each(['route', 'party', 'account', 'unmount'] as const)('ignores late read refusal after %s retirement', async change => {
  const old = deferred<LicenseRecord>(); mocks.getLicenseRecord.mockReturnValueOnce(old.promise).mockResolvedValue(record('replacement'));
  const view = render(<LicenseRecordView party="buyer" />);
  if (change === 'route') { mocks.id = 'order-b'; view.rerender(<LicenseRecordView party="buyer" />); }
  if (change === 'party') view.rerender(<LicenseRecordView party="seller" />);
  if (change === 'account') act(() => account('account-b'));
  if (change === 'unmount') view.unmount();
  if (change !== 'unmount') await screen.findByText('replacement');
  await act(async () => old.reject({ private: 'obsolete refusal' }));
  expect(screen.queryByRole('alert')).toBeNull();
  if (change !== 'unmount') expect(pdf()).toBeTruthy();
});

it('ignores old PDF error/finally while the replacement PDF is busy', async () => {
  const old = deferred<Blob>(), current = deferred<Blob>(); mocks.downloadLicenseRecordPdf.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const view = render(<LicenseRecordView party="buyer" />); await screen.findByText('order-a'); fireEvent.click(pdf());
  mocks.id = 'order-b'; view.rerender(<LicenseRecordView party="buyer" />); await screen.findByText('order-b'); fireEvent.click(pdf());
  await act(async () => old.reject({ private: 'obsolete PDF refusal' }));
  expect(screen.queryByRole('alert')).toBeNull(); expect((pdf() as HTMLButtonElement).disabled).toBe(true);
  await act(async () => current.resolve(new Blob(['fixture']))); expect(createUrl).toHaveBeenCalledTimes(1);
  expect(mocks.downloadLicenseRecordPdf.mock.calls).toEqual([['order-a'], ['order-b']]);
});

it('survives StrictMode read setup/cleanup and confirms only the displayed visit', async () => {
  const obsolete = deferred<LicenseRecord>(); mocks.getLicenseRecord.mockReturnValueOnce(obsolete.promise).mockResolvedValue(record('strict current'));
  render(<StrictMode><LicenseRecordView party="buyer" /></StrictMode>); await screen.findByText('strict current');
  await act(async () => obsolete.resolve(record('strict obsolete'))); expect(screen.queryByText('strict obsolete')).toBeNull();
  fireEvent.click(confirm()); await screen.findByText(/^Deletion confirmed/); expect(mocks.confirmLicenseRecordDeletion).toHaveBeenCalledTimes(1);
});

it('catches read refusals with a fixed persistent error and deliberate read retry only', async () => {
  mocks.getLicenseRecord.mockRejectedValueOnce({ private: 'never expose' }).mockResolvedValueOnce(record('retried'));
  render(<LicenseRecordView party="buyer" />); expect((await screen.findByRole('alert')).textContent).toBe('The licence record is unavailable.');
  expect(mocks.getLicenseRecord).toHaveBeenCalledTimes(1); expect(mocks.confirmLicenseRecordDeletion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry licence record' })); await screen.findByText('retried'); expect(screen.queryByRole('alert')).toBeNull();
});

it('guards duplicate confirmation synchronously, catches refusal and permits a deliberate retry', async () => {
  const first = deferred<typeof ack>(); mocks.confirmLicenseRecordDeletion.mockReturnValueOnce(first.promise).mockResolvedValueOnce(ack);
  render(<LicenseRecordView party="buyer" />); await screen.findByText('order-a'); const button = confirm();
  act(() => { fireEvent.click(button); fireEvent.click(button); }); expect(mocks.confirmLicenseRecordDeletion).toHaveBeenCalledTimes(1);
  await act(async () => first.reject({ detail: { private: 'never expose' } }));
  expect(screen.getByRole('alert').textContent).toBe('The deletion confirmation could not be recorded. Please try again.');
  fireEvent.click(confirm()); await screen.findByText(/^Deletion confirmed/); expect(mocks.confirmLicenseRecordDeletion).toHaveBeenCalledTimes(2);
  fireEvent.click(button); expect(mocks.confirmLicenseRecordDeletion).toHaveBeenCalledTimes(2);
});

it('downloads once, preserves pending and activated PDF on ordinary token refresh, cleans the URL and permits another download', async () => {
  const flight = deferred<Blob>(); const blob = new Blob(['fixture']); mocks.downloadLicenseRecordPdf.mockReturnValueOnce(flight.promise).mockResolvedValue(blob);
  render(<LicenseRecordView party="buyer" />); await screen.findByText('order-a');
  act(() => { fireEvent.click(pdf()); fireEvent.click(pdf()); }); act(() => useAuthStore.setState({ token: 'fake-refresh' }));
  expect(screen.getByText('order-a')).toBeTruthy(); expect(mocks.getLicenseRecord).toHaveBeenCalledTimes(1); expect(mocks.downloadLicenseRecordPdf).toHaveBeenCalledTimes(1);
  await act(async () => flight.resolve(blob)); expect(createUrl).toHaveBeenCalledWith(blob); expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1); expect(revokeUrl).toHaveBeenCalledWith('blob:fixture');
  act(() => useAuthStore.setState({ token: 'fake-refresh-again' })); expect(revokeUrl).toHaveBeenCalledTimes(1);
  fireEvent.click(pdf()); await act(async () => {}); expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2);
});

it('contains PDF refusal and allows explicit retry', async () => {
  mocks.downloadLicenseRecordPdf.mockRejectedValueOnce({ private: 'secret' }).mockResolvedValueOnce(new Blob(['fixture']));
  render(<LicenseRecordView party="buyer" />); await screen.findByText('order-a'); fireEvent.click(pdf());
  expect((await screen.findByRole('alert')).textContent).toBe('The licence record PDF could not be downloaded. Please try again.');
  fireEvent.click(pdf()); await act(async () => {}); expect(screen.queryByRole('alert')).toBeNull(); expect(createUrl).toHaveBeenCalledTimes(1);
});

it.each(['seller', 'active', 'confirmed'] as const)('preserves %s eligibility and normal frozen record rendering', async mode => {
  const value = record('normal', mode === 'active' ? 'active' : 'terminated');
  if (mode === 'confirmed') value.lifecycle_events.push({ event_type: 'deletion_confirmed', occurred_at: ack.occurred_at, actor_type: 'buyer', reason: null, metadata: null, deletion_due_at: null });
  mocks.getLicenseRecord.mockResolvedValue(value); render(<LicenseRecordView party={mode === 'seller' ? 'seller' : 'buyer'} />); await screen.findByText('normal');
  expect(screen.queryByRole('button', { name: 'Confirm deletion' })).toBeNull(); expect(pdf()).toBeTruthy();
  expect(screen.getByText(`SHA-256: ${fixture.license.sha256}`)).toBeTruthy(); expect(document.querySelector('pre')!.textContent).toBe(fixture.license.text);
  expect(screen.getByText(fixture.identity_notice)).toBeTruthy();
});
