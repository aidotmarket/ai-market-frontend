// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSellerPublicProfile, updateSellerPublicProfile, updateSellerCompanyName, SellerProfileError, type SellerPublicProfile } from '@/api/sellerProfile';
import SellerPublicName from './SellerPublicName';
import { COMPANY_NAME_FORM_LABEL, COMPANY_NAME_TOGGLE_LABEL, COMPANY_NAME_TOGGLE_NOTE, COMPANY_NAME_SAVE, COMPANY_NAME_SAVING, COMPANY_NAME_SAVED, COMPANY_NAME_SAVE_FAILED } from '@/components/listings/publisherStrings';
const updateCompany = vi.mocked(updateSellerCompanyName);
import { useAuthStore } from '@/store/auth';

vi.mock('@/api/sellerProfile', async (original) => ({
  ...await original<typeof import('@/api/sellerProfile')>(), getSellerPublicProfile: vi.fn(), updateSellerPublicProfile: vi.fn(), updateSellerCompanyName: vi.fn(),
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
afterEach(cleanup);

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
  it('allows a retry after load failure and never overwrites an unread profile', async () => {
    getProfile.mockRejectedValueOnce(new SellerProfileError('Unavailable', 503));
    render(<SellerPublicName ownOperation={ownOperation} />);
    await screen.findByRole('alert');
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Try again: public business name settings' }));
    await waitFor(() => expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(false));
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it('renders nothing when the account has no seller profile yet (HTTP 404)', async () => {
    getProfile.mockRejectedValueOnce(new SellerProfileError('Not found', 404));
    const { container } = render(<SellerPublicName ownOperation={ownOperation} />);
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Could not load public business name settings. Please try again.')).toBeNull();
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it('shows general save failures and keeps the draft retryable', async () => {
    updateProfile.mockRejectedValue(new SellerProfileError('Please try again.', undefined));
    await mount(); edit(); save(); await screen.findByText('Please try again.');
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

it('recovers a failed public name read when the same session rotates, without a manual reload', async () => {
  useAuthStore.setState({ token: 'before-recovery' });
  getProfile.mockRejectedValueOnce(new SellerProfileError('Temporarily unavailable', 503));
  render(<SellerPublicName ownOperation={ownOperation} />);
  await screen.findByRole('alert');
  act(() => useAuthStore.setState({ token: 'valid-after-recovery' }));
  await waitFor(() => expect((screen.getByLabelText('Public business name') as HTMLInputElement).disabled).toBe(false));
  expect(screen.queryByRole('alert')).toBeNull(); expect(getProfile).toHaveBeenCalledTimes(2);
  expect(updateProfile).not.toHaveBeenCalled();
});
it('keeps a loaded public name draft through healthy token rotation', async () => {
  await mount(); edit('Retained unsaved name');
  act(() => useAuthStore.setState({ token: 'another-valid-token' }));
  expect((screen.getByLabelText('Public business name') as HTMLInputElement).value).toBe('Retained unsaved name');
  expect(getProfile).toHaveBeenCalledOnce(); expect(updateProfile).not.toHaveBeenCalled();
});
it('hides the field when the trust flag turns off during save (404)', async () => {
  updateProfile.mockRejectedValueOnce(new SellerProfileError('Not found', 404));
  const { container } = await mount(); edit(); save();
  await waitFor(() => expect(container.innerHTML).toBe(''));
  expect(screen.queryByRole('alert')).toBeNull();
});

const companyProfile = { ...anonymous, show_company_name: false };
const companySwitch = () => screen.getByRole('switch', { name: COMPANY_NAME_TOGGLE_LABEL }) as HTMLInputElement;
const companyForm = () => screen.getByRole('form', { name: COMPANY_NAME_FORM_LABEL });
const nameForm = () => screen.getByRole('form', { name: 'Public business name settings' });
const companyButton = () => within(companyForm()).getByRole('button') as HTMLButtonElement;
const nameButton = () => within(nameForm()).getByRole('button') as HTMLButtonElement;
const submitCompany = () => fireEvent.click(screen.getByRole('button', { name: COMPANY_NAME_SAVE }));

describe('company name setting', () => {
  beforeEach(() => {
    getProfile.mockResolvedValue(companyProfile);
    updateCompany.mockImplementation(async show => ({ ...companyProfile, show_company_name: show }));
  });
  it('adds nothing until the existing GET reports a boolean setting', async () => {
    getProfile.mockResolvedValue(anonymous);
    const view = await mount();
    expect(view.container.innerHTML).toMatchInlineSnapshot(`"<form class="mt-6 border-t border-gray-200 pt-6 space-y-3" aria-label="Public business name settings"><div><label for="publicBusinessName" class="block text-sm font-medium text-gray-700 mb-1">Public business name</label><input id="publicBusinessName" maxlength="255" aria-invalid="false" aria-describedby="publicNameExplanation" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50" type="text" value=""></div><p id="publicNameExplanation" class="text-sm text-gray-600">Business name supplied by the seller. ai.market does not certify company affiliation.</p><label class="flex items-center gap-2 text-sm text-gray-700"><input role="switch" aria-invalid="false" aria-describedby="publicNameOptOut" type="checkbox">Show public business name</label><p id="publicNameOptOut" class="text-sm text-gray-600">Saving with visibility off stops ai.market showing your business name from now on. It cannot recall copies others already saved.</p><button type="submit" disabled="" class="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed">Save public business name</button></form>"`);
    expect(screen.queryByRole('form', { name: COMPANY_NAME_FORM_LABEL })).toBeNull();
    expect(screen.queryByRole('switch', { name: COMPANY_NAME_TOGGLE_LABEL })).toBeNull();
    expect(screen.getAllByRole('form')).toHaveLength(1);
    expect(getProfile).toHaveBeenCalledOnce();
  });
  it('shows the accessible switch and note, and saves only company consent', async () => {
    await mount();
    expect(companySwitch().checked).toBe(false);
    expect(companyButton().disabled).toBe(true);
    expect(companySwitch().getAttribute('aria-describedby')).toBe(screen.getByText(COMPANY_NAME_TOGGLE_NOTE).id);
    fireEvent.click(companySwitch()); submitCompany();
    await screen.findByText(COMPANY_NAME_SAVED);
    expect(updateCompany).toHaveBeenCalledExactlyOnceWith(true, expect.any(AbortSignal));
    expect(updateProfile).not.toHaveBeenCalled();
    expect(companySwitch().checked).toBe(true);
    expect(companyButton().disabled).toBe(true);
    expect(getProfile).toHaveBeenCalledOnce();
  });
  it.each([422, undefined, 503])('isolates failure %s and resets only validation failures', async status => {
    updateCompany.mockRejectedValue(new SellerProfileError(COMPANY_NAME_SAVE_FAILED, status));
    await mount(); edit('Dirty name draft');
    fireEvent.click(companySwitch()); submitCompany();
    const alert = await within(companyForm()).findByRole('alert');
    expect(alert.textContent).toBe(COMPANY_NAME_SAVE_FAILED);
    expect(within(nameForm()).queryByRole('alert')).toBeNull();
    expect(companySwitch().checked).toBe(status !== 422);
    expect(companyButton().disabled).toBe(status === 422);
    expect((screen.getByRole('textbox', { name: 'Public business name' }) as HTMLInputElement).value).toBe('Dirty name draft');
  });
  it('preserves the dirty name draft and its error across a company save', async () => {
    updateProfile.mockRejectedValueOnce(new SellerProfileError('Name validation error', 422));
    await mount(); edit('Dirty name draft'); save();
    await within(nameForm()).findByRole('alert');
    fireEvent.click(companySwitch()); submitCompany();
    await within(companyForm()).findByText(COMPANY_NAME_SAVED);
    expect((screen.getByRole('textbox', { name: 'Public business name' }) as HTMLInputElement).value).toBe('Dirty name draft');
    expect(within(nameForm()).getByRole('alert').textContent).toBe('Name validation error');
    expect(nameButton().disabled).toBe(false);
  });
  it('keeps company errors and drafts through a name save', async () => {
    updateCompany.mockRejectedValueOnce(new SellerProfileError(COMPANY_NAME_SAVE_FAILED, undefined));
    await mount(); fireEvent.click(companySwitch()); submitCompany();
    await within(companyForm()).findByRole('alert');
    edit(); save(); await within(nameForm()).findByRole('status');
    expect(companySwitch().checked).toBe(true);
    expect(within(companyForm()).getByRole('alert').textContent).toBe(COMPANY_NAME_SAVE_FAILED);
    expect(companyButton().disabled).toBe(false);
  });
  it.each(['name', 'company'] as const)('disables both buttons during the %s save', async which => {
    const request = deferred<SellerPublicProfile>();
    if (which === 'name') updateProfile.mockReturnValue(request.promise);
    else updateCompany.mockReturnValue(request.promise);
    await mount(); edit(); fireEvent.click(companySwitch());
    if (which === 'name') save(); else submitCompany();
    expect(nameButton().disabled).toBe(true);
    expect(companyButton().disabled).toBe(true);
    if (which === 'company') expect(companyButton().textContent).toBe(COMPANY_NAME_SAVING);
    await act(async () => request.resolve({ public_display_name: 'Synthetic Co', show_public_display_name: false, show_company_name: true }));
  });
  it.each(['name', 'company'] as const)('merges only owned fields when %s completes first', async first => {
    const nameRequest = deferred<SellerPublicProfile>();
    const companyRequest = deferred<SellerPublicProfile>();
    updateProfile.mockReturnValue(nameRequest.promise);
    updateCompany.mockReturnValue(companyRequest.promise);
    await mount(); edit('Normalized Co');
    fireEvent.click(screen.getByRole('switch', { name: 'Show public business name' }));
    fireEvent.click(companySwitch());
    // Direct submissions exercise response races even though both buttons lock.
    fireEvent.submit(nameForm()); fireEvent.submit(companyForm());
    const finishName = () => act(async () => nameRequest.resolve({ public_display_name: 'Normalized Co', show_public_display_name: true, show_company_name: false }));
    const finishCompany = () => act(async () => companyRequest.resolve({ ...anonymous, show_company_name: true }));
    if (first === 'name') { await finishName(); await finishCompany(); }
    else { await finishCompany(); await finishName(); }
    expect((screen.getByRole('textbox', { name: 'Public business name' }) as HTMLInputElement).value).toBe('Normalized Co');
    expect((screen.getByRole('switch', { name: 'Show public business name' }) as HTMLInputElement).checked).toBe(true);
    expect(companySwitch().checked).toBe(true);
    expect(nameButton().disabled).toBe(true);
    expect(companyButton().disabled).toBe(true);
    expect(within(nameForm()).getByRole('status').textContent).toBe('Public business name saved.');
    expect(within(companyForm()).getByRole('status').textContent).toBe(COMPANY_NAME_SAVED);
    expect(updateProfile).toHaveBeenCalledExactlyOnceWith({ public_display_name: 'Normalized Co', show_public_display_name: true }, expect.any(AbortSignal));
    expect(updateCompany).toHaveBeenCalledExactlyOnceWith(true, expect.any(AbortSignal));
  });
  it('hides the entire panel after a toggle 404', async () => {
    updateCompany.mockRejectedValueOnce(new SellerProfileError(COMPANY_NAME_SAVE_FAILED, 404));
    const { container } = await mount(); fireEvent.click(companySwitch()); submitCompany();
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
  it.each(['resolve', 'reject'] as const)('ignores a retired-account company save %s', async outcome => {
    const request = deferred<SellerPublicProfile>(); updateCompany.mockReturnValue(request.promise);
    await mount(); fireEvent.click(companySwitch()); submitCompany(); current = false;
    await act(async () => {
      if (outcome === 'resolve') request.resolve({ ...companyProfile, show_company_name: true });
      else request.reject(new SellerProfileError(COMPANY_NAME_SAVE_FAILED, 422));
    });
    expect(screen.queryByText(COMPANY_NAME_SAVED)).toBeNull();
    expect(within(companyForm()).queryByRole('alert')).toBeNull();
  });
  it('aborts the company write on unmount', async () => {
    const request = deferred<SellerPublicProfile>(); updateCompany.mockReturnValue(request.promise);
    const view = await mount(); fireEvent.click(companySwitch()); submitCompany();
    const signal = updateCompany.mock.calls[0][1]!; view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => request.resolve(companyProfile));
  });
});
