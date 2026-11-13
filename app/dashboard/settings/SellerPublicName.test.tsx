// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSellerPublicProfile, updateSellerPublicProfile, SellerProfileError, type SellerPublicProfile } from '@/api/sellerProfile';
import SellerPublicName from './SellerPublicName';

vi.mock('@/api/sellerProfile', async (original) => ({
  ...await original<typeof import('@/api/sellerProfile')>(), getSellerPublicProfile: vi.fn(), updateSellerPublicProfile: vi.fn(),
}));
const getProfile = vi.mocked(getSellerPublicProfile);
const updateProfile = vi.mocked(updateSellerPublicProfile);
const anonymous = { public_display_name: null, show_public_display_name: false };
let current = true;
const ownOperation = () => () => current;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function mount(strict = false) {
  const child = <SellerPublicName ownOperation={ownOperation} />;
  const view = render(strict ? <StrictMode>{child}</StrictMode> : child);
  await waitFor(() => expect((screen.getByLabelText('Public business name') as HTMLInputElement).disabled).toBe(false));
  return view;
}
function edit(name = 'Synthetic Co') {
  fireEvent.change(screen.getByLabelText('Public business name'), { target: { value: name } });
}
function save() { fireEvent.click(screen.getByRole('button', { name: 'Save public business name' })); }
beforeEach(() => {
  vi.resetAllMocks(); current = true;
  getProfile.mockResolvedValue(anonymous);
  updateProfile.mockImplementation(async (profile) => profile);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('public business name settings', () => {
  it('starts private with one bounded input, one switch and truthful copy', async () => {
    await mount(true);
    const input = screen.getByRole('textbox', { name: 'Public business name' }) as HTMLInputElement;
    expect(input.value).toBe(''); expect(input.maxLength).toBe(255);
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Business name supplied by the seller. ai.market does not certify company affiliation.')).toBeTruthy();
    expect(screen.getByText('Saving with visibility off stops ai.market showing your business name from now on. It cannot recall copies others already saved.')).toBeTruthy();
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it('saves an opt-in immediately and displays the server-normalized name', async () => {
    updateProfile.mockResolvedValue({ public_display_name: 'Synthetic Co', show_public_display_name: true });
    await mount(); edit('  Synthetic   Co  '); fireEvent.click(screen.getByRole('switch')); save();
    await screen.findByText('Public business name saved.');
    expect(updateProfile).toHaveBeenCalledWith({ public_display_name: 'Synthetic   Co', show_public_display_name: true }, expect.any(AbortSignal));
    expect((screen.getByLabelText('Public business name') as HTMLInputElement).value).toBe('Synthetic Co');
    expect((screen.getByRole('button', { name: 'Save public business name' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('saves opt-out and retains the name for a future ordinary edit', async () => {
    getProfile.mockResolvedValue({ public_display_name: 'Synthetic Co', show_public_display_name: true });
    await mount(); fireEvent.click(screen.getByRole('switch')); save();
    await screen.findByText('Public business name saved.');
    expect(updateProfile).toHaveBeenCalledWith({ public_display_name: 'Synthetic Co', show_public_display_name: false }, expect.any(AbortSignal));
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
  });
  it('requires a nonempty enabled name at the name input', async () => {
    await mount(); fireEvent.click(screen.getByRole('switch')); save();
    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('Enter a name before turning visibility on.');
    expect(screen.getByLabelText('Public business name').getAttribute('aria-describedby')).toContain(error.id);
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it.each([422, 503])('places backend validation guidance beside the name on HTTP %s without a success state', async (status) => {
    const message = status === 422 ? 'Remove contact information from your business name.' : 'Validation unavailable. Please retry.';
    updateProfile.mockRejectedValue(new SellerProfileError(message, status, { public_display_name: message }));
    await mount(); edit(); save();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(screen.getByLabelText('Public business name').getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText('Public business name saved.')).toBeNull();
    edit('Corrected Co');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('renders visibility validation next to the switch', async () => {
    updateProfile.mockRejectedValue(new SellerProfileError('Invalid visibility', 422, { show_public_display_name: 'Invalid visibility' }));
    await mount(); edit(); save();
    const alert = await screen.findByRole('alert');
    expect(screen.getByRole('switch').getAttribute('aria-describedby')).toContain(alert.id);
  });
  it.each([401, 403, 404, 400])('hides the optional panel without an alert on load HTTP %s', async (status) => {
    getProfile.mockRejectedValueOnce(new SellerProfileError('Unavailable', status));
    const { container } = render(<SellerPublicName ownOperation={ownOperation} />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it.each([500, 503, undefined])('quietly retries load status %s once and shows a recovered profile', async (status) => {
    vi.useFakeTimers();
    getProfile.mockRejectedValueOnce(new SellerProfileError('Unavailable', status));
    render(<SellerPublicName ownOperation={ownOperation} />);
    await act(async () => {});
    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(getProfile).toHaveBeenCalledTimes(2);
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it.each([500, undefined])('hides the panel after load status %s fails twice', async (status) => {
    vi.useFakeTimers();
    getProfile.mockRejectedValue(new SellerProfileError('Unavailable', status));
    const { container } = render(<SellerPublicName ownOperation={ownOperation} />);
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(getProfile).toHaveBeenCalledTimes(2);
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it.each(['unmount', 'retire'] as const)('cancels a pending load retry on %s', async (action) => {
    vi.useFakeTimers();
    getProfile.mockRejectedValueOnce(new SellerProfileError('Unavailable', 500));
    const view = render(<SellerPublicName ownOperation={ownOperation} />);
    await act(async () => {});
    if (action === 'unmount') view.unmount();
    else current = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it.each([
    [undefined, 'Please try again.'],
    [503, 'Business name validation is unavailable. Please try again.'],
  ] as const)('shows general save failures on status %s and keeps the draft retryable', async (status, message) => {
    updateProfile.mockRejectedValue(new SellerProfileError(message, status));
    await mount(); edit(); save(); await screen.findByText(message);
    expect((screen.getByLabelText('Public business name') as HTMLInputElement).value).toBe('Synthetic Co');
    expect((screen.getByRole('button', { name: 'Save public business name' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('locks the controls and prevents duplicate writes during save', async () => {
    const request = deferred<SellerPublicProfile>(); updateProfile.mockReturnValue(request.promise);
    await mount(); edit(); save();
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
    fireEvent.submit(screen.getByRole('form')); expect(updateProfile).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve({ public_display_name: 'Synthetic Co', show_public_display_name: false }));
  });
  it('ignores retired-account load results', async () => {
    const request = deferred<SellerPublicProfile>(); getProfile.mockReturnValue(request.promise);
    render(<SellerPublicName ownOperation={ownOperation} />); current = false;
    await act(async () => request.resolve({ public_display_name: 'Private previous account', show_public_display_name: true }));
    expect((screen.getByLabelText('Public business name') as HTMLInputElement).value).toBe('');
  });
  it.each(['resolve', 'reject'] as const)('ignores a retired-account save %s', async (outcome) => {
    const request = deferred<SellerPublicProfile>(); updateProfile.mockReturnValue(request.promise);
    await mount(); edit(); save(); current = false;
    await act(async () => {
      if (outcome === 'resolve') request.resolve({ public_display_name: 'Private previous account', show_public_display_name: true });
      else request.reject(new SellerProfileError('Previous account failure', 422));
    });
    expect(screen.queryByText('Public business name saved.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('aborts outstanding writes on unmount', async () => {
    const request = deferred<SellerPublicProfile>(); updateProfile.mockReturnValue(request.promise);
    const view = await mount(); edit(); save();
    const signal = updateProfile.mock.calls[0][1]!; view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => request.resolve(anonymous));
  });
});
