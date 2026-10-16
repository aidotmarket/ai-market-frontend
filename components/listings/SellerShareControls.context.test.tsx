/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SellerShareControls from '@/components/listings/SellerShareControls';
const api = vi.hoisted(() => ({ fetchListingShare: vi.fn(), updateListingShareCaption: vi.fn() }));
vi.mock('@/api/share', () => api);
vi.mock('@/components/listings/ShareKitModal', () => ({ default: ({ share }: {
    share: {
      share_url: string;
    };
  }) => <div role="dialog">{share.share_url}</div> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const share = (id: string) => ({ listing_id: id, short_code: id, share_url: `https://ai.market/l/${id}`, card_url: `https://ai.market/l/${id}/card.png`, locale: 'en_US', caption: { locale: 'en_US', og_title: `Title ${id}`, og_description: `Description ${id}`, caption_text: `Caption ${id}`, status: 'seller_edited' } });
it('loads the initial listing and saves its own caption (control)', async () => {
  api.fetchListingShare.mockResolvedValue(share('A'));
  api.updateListingShareCaption.mockResolvedValue({ caption: share('A').caption });
  render(<SellerShareControls listingId="A"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  await screen.findByDisplayValue('Title A');
  fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));
  await waitFor(() => expect(api.updateListingShareCaption).toHaveBeenCalledWith('A', expect.objectContaining({ caption_text: 'Caption A' })));
});
it('does not retain listing A share controls after the mounted listing changes to B', async () => {
  api.fetchListingShare.mockImplementation(async (id: string) => share(id));
  const ui = render(<SellerShareControls listingId="A"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  await screen.findByDisplayValue('Title A');
  ui.rerender(<SellerShareControls listingId="B"/>);
  await waitFor(() => expect(screen.queryByDisplayValue('Title A')).toBeNull());
});
it('does not submit listing A caption under B after a context switch', async () => {
  api.fetchListingShare.mockImplementation(async (id: string) => share(id));
  api.updateListingShareCaption.mockImplementation(async (id: string) => ({ caption: share(id).caption }));
  const ui = render(<SellerShareControls listingId="A"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  await screen.findByDisplayValue('Title A');
  ui.rerender(<SellerShareControls listingId="B"/>);
  const save = screen.queryByRole('button', { name: 'Save edit' });
  if (save)
    fireEvent.click(save);
  await Promise.resolve();
  expect(api.updateListingShareCaption.mock.calls.some(([id, body]) => id === 'B' && body.caption_text === 'Caption A')).toBe(false);
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
async function settle(work: () => void) { await act(async () => { work(); }); }
async function open() { click('Share'); await screen.findByLabelText('OG title'); }
function clipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  return writeText;
}
function expectClosed() {
  expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
  expect(screen.queryByLabelText('OG title')).toBeNull();
  expect(screen.queryByAltText('Share card preview')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByText('Copied')).toBeNull();
  expect(screen.queryByText(/Fallback caption used/)).toBeNull();
}
it.each(['listing', 'locale'])('resets all loaded UI on a %s switch and requires explicit opening', async (context) => {
  clipboard();
  api.fetchListingShare.mockImplementation(async (id: string, locale: string) => ({ ...share(`${id}:${locale}`), listing_id: id, locale }));
  api.updateListingShareCaption.mockResolvedValue({ captions: [share('draft').caption], fallback_used: true });
  const ui = render(<SellerShareControls listingId="A" locale="en_US"/>);
  await open();
  click('Regenerate');
  await screen.findByText('Fallback caption used. Review before posting.');
  click('Copy link');
  await screen.findByText('Copied');
  click('Share kit');
  expect(screen.getByRole('dialog').textContent).toContain('/A');
  fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'unsaved A' } });
  const id = context === 'listing' ? 'B' : 'A';
  const locale = context === 'locale' ? 'es_ES' : 'en_US';
  ui.rerender(<SellerShareControls listingId={id} locale={locale}/>);
  expectClosed();
  expect(api.fetchListingShare).toHaveBeenCalledTimes(1);
  expect(api.updateListingShareCaption).toHaveBeenCalledTimes(1);
  await open();
  expect(api.fetchListingShare).toHaveBeenLastCalledWith(id, locale);
  expect((screen.getByLabelText('Caption') as HTMLTextAreaElement).value).toBe(`Caption ${id}:${locale}`);
  fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'current edit' } });
  api.updateListingShareCaption.mockResolvedValue({ caption: { ...share(id).caption, caption_text: 'current edit' } });
  click('Save edit');
  await waitFor(() => expect(api.updateListingShareCaption).toHaveBeenLastCalledWith(id, {
    mode: 'accept_edit', locale, og_title: `Title ${id}:${locale}`, og_description: `Description ${id}:${locale}`, caption_text: 'current edit'
  }));
  await screen.findByDisplayValue('current edit');
  expect(screen.queryByText(/Fallback caption used/)).toBeNull();
});
it.each(['resolve', 'reject'])('ignores a superseded read %s without clearing the new read pending state', async (outcome) => {
  const old = deferred<ReturnType<typeof share>>();
  const current = deferred<ReturnType<typeof share>>();
  api.fetchListingShare.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const ui = render(<SellerShareControls listingId="A"/>);
  click('Share');
  ui.rerender(<SellerShareControls listingId="B"/>);
  expectClosed();
  expect(api.fetchListingShare).toHaveBeenCalledTimes(1);
  click('Share');
  await settle(() => outcome === 'resolve' ? old.resolve(share('A')) : old.reject(new Error('old read')));
  expect(screen.getByRole('status').textContent).toContain('Loading');
  expect(screen.queryByDisplayValue('Title A')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  await settle(() => current.resolve(share('B')));
  expect(screen.getByDisplayValue('Title B')).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
});
it.each(['save', 'regenerate'] as const)('ignores deferred %s success and failure across switches, preserving current edits and pending mutation', async (mode) => {
  const old = deferred<unknown>();
  const current = deferred<unknown>();
  api.fetchListingShare.mockImplementation(async (id: string) => share(id));
  api.updateListingShareCaption.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const ui = render(<SellerShareControls listingId="A" locale="en_US"/>);
  await open();
  click(mode === 'save' ? 'Save edit' : 'Regenerate');
  expect(api.updateListingShareCaption).toHaveBeenCalledWith('A', expect.objectContaining({ mode: mode === 'save' ? 'accept_edit' : 'regenerate', locale: 'en_US' }));
  ui.rerender(<SellerShareControls listingId="B" locale="es_ES"/>);
  expectClosed();
  await open();
  fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'B working edit' } });
  click('Save edit');
  await settle(() => old.resolve(mode === 'save' ? { caption: share('old result').caption } : { captions: [share('old result').caption], fallback_used: true }));
  expect(screen.getByDisplayValue('B working edit')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Save edit' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText(/Fallback caption used/)).toBeNull();
  await settle(() => current.resolve({ caption: { ...share('B').caption, caption_text: 'B working edit' } }));
  expect((screen.getByRole('button', { name: 'Save edit' }) as HTMLButtonElement).disabled).toBe(false);
  const late = deferred<unknown>();
  api.updateListingShareCaption.mockReturnValueOnce(late.promise);
  click(mode === 'save' ? 'Save edit' : 'Regenerate');
  ui.rerender(<SellerShareControls listingId="B" locale="fr_FR"/>);
  await open();
  await settle(() => late.reject(new Error('superseded mutation')));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByDisplayValue('Title B')).toBeTruthy();
  expect(api.updateListingShareCaption).toHaveBeenCalledTimes(3);
});
it.each(['resolve', 'reject'])('ignores late clipboard %s and never copies an old native-share fallback', async (outcome) => {
  const copy = deferred<void>();
  const write = clipboard(vi.fn().mockReturnValueOnce(copy.promise).mockResolvedValue(undefined));
  const native = deferred<void>();
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockReturnValue(native.promise) });
  api.fetchListingShare.mockImplementation(async (id: string) => share(id));
  const ui = render(<SellerShareControls listingId="A"/>);
  await open();
  click('Copy link');
  click('Native share');
  expect(navigator.share).toHaveBeenCalledWith({ url: share('A').share_url, title: 'Title A', text: 'Caption A' });
  ui.rerender(<SellerShareControls listingId="B"/>);
  await open();
  await settle(() => { outcome === 'resolve' ? copy.resolve() : copy.reject(new Error('copy')); native.reject(new Error('native rejected')); });
  expect(write).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Copied')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  click('Native share');
  await waitFor(() => expect(write).toHaveBeenLastCalledWith(share('B').share_url));
  await screen.findByText('Copied');
});
it.each(['read', 'save', 'regenerate', 'copy', 'native'] as const)('discards pending %s after unmount and a fresh mount of the same context', async (operation) => {
  const pending = deferred<unknown>();
  const write = clipboard();
  api.fetchListingShare.mockResolvedValue(share('A'));
  if (operation === 'read')
    api.fetchListingShare.mockReturnValueOnce(pending.promise);
  if (operation === 'save' || operation === 'regenerate')
    api.updateListingShareCaption.mockReturnValueOnce(pending.promise);
  if (operation === 'copy')
    write.mockReturnValueOnce(pending.promise);
  if (operation === 'native')
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockReturnValue(pending.promise) });
  const ui = render(<SellerShareControls listingId="A"/>);
  if (operation === 'read')
    click('Share');
  else {
    await open();
    click({ save: 'Save edit', regenerate: 'Regenerate', copy: 'Copy link', native: 'Native share' }[operation]);
  }
  ui.unmount();
  render(<SellerShareControls listingId="A"/>);
  expectClosed();
  await open();
  await settle(() => operation === 'native' ? pending.reject(new Error('late rejection')) : pending.resolve(operation === 'read' ? share('stale') : operation === 'save' ? { caption: share('stale').caption } : operation === 'regenerate' ? { captions: [share('stale').caption], fallback_used: true } : undefined));
  expect(screen.getByDisplayValue('Title A')).toBeTruthy();
  expect(screen.queryByDisplayValue('Title stale')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText('Copied')).toBeNull();
  expect(screen.queryByText(/Fallback caption used/)).toBeNull();
  expect(write).toHaveBeenCalledTimes(operation === 'copy' ? 1 : 0);
});
it('clears an old error when locale changes', async () => {
  api.fetchListingShare.mockRejectedValue(new Error('unavailable'));
  const ui = render(<SellerShareControls listingId="A" locale="en_US"/>);
  click('Share');
  await screen.findByRole('alert');
  ui.rerender(<SellerShareControls listingId="A" locale="es_ES"/>);
  expectClosed();
  expect(api.fetchListingShare).toHaveBeenCalledTimes(1);
});
it('uses current edited fields for native share, honors cancellation, and falls back only for a current rejection', async () => {
  const write = clipboard();
  const native = vi.fn().mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
    .mockRejectedValueOnce(new Error('unsupported'));
  Object.defineProperty(navigator, 'share', { configurable: true, value: native });
  api.fetchListingShare.mockResolvedValue(share('A'));
  render(<SellerShareControls listingId="A"/>);
  await open();
  fireEvent.change(screen.getByLabelText('OG title'), { target: { value: 'Edited title' } });
  fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Edited caption' } });
  await act(async () => { click('Native share'); });
  expect(native).toHaveBeenCalledWith({ url: share('A').share_url, title: 'Edited title', text: 'Edited caption' });
  expect(write).not.toHaveBeenCalled();
  await act(async () => { click('Native share'); });
  expect(write).not.toHaveBeenCalled();
  await act(async () => { click('Native share'); });
  expect(write).toHaveBeenCalledWith(share('A').share_url);
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
});

it('keeps unsaved edits usable on a same-context rerender', async () => {
  api.fetchListingShare.mockResolvedValue(share('A'));
  api.updateListingShareCaption.mockResolvedValue({caption: share('A').caption});
  const ui = render(<SellerShareControls listingId="A" locale="en_US"/>);
  await open();
  fireEvent.change(screen.getByLabelText('Caption'), {target: {value: 'unsaved current edit'}});
  ui.rerender(<SellerShareControls listingId="A" locale="en_US" compact/>);
  expect(screen.getByDisplayValue('unsaved current edit')).toBeTruthy();
  expect(api.fetchListingShare).toHaveBeenCalledTimes(1);
  click('Save edit');
  expect(api.updateListingShareCaption).toHaveBeenCalledWith('A', {
    mode: 'accept_edit', locale: 'en_US', og_title: 'Title A',
    og_description: 'Description A', caption_text: 'unsaved current edit',
  });
  await screen.findByDisplayValue('Caption A');
});
