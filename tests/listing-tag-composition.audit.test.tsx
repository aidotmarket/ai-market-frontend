// @vitest-environment jsdom
import React from 'react';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditPage from '@/app/dashboard/listings/[id]/edit/page';

const api = vi.hoisted(() => ({
  getListing: vi.fn(), updateListing: vi.fn(), publishListing: vi.fn(),
  unpublishListing: vi.fn(), toast: vi.fn(), router: { push: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'listing' }), useRouter: () => api.router }));
vi.mock('@/api/listings', () => api);
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: api.toast }) }));
vi.mock('@/api/sellerWorkspace', () => ({ getSellerWorkspaceCapabilities: async () => ({}) }));
vi.mock('@/api/sellerLegalIdentity', () => ({ getSellerLegalIdentity: vi.fn(), refreshSellerLegalIdentity: vi.fn(), legalIdentityFailure: () => null, LEGAL_IDENTITY_SUPPORT_PATH: '/support' }));
vi.mock('@/components/listings/SellerAtAGlance', () => ({ default: () => null }));
vi.mock('@/components/listings/SellerShareControls', () => ({ default: () => null }));
vi.mock('@/components/seller-workspace/SellerLicenseSelection', () => ({ default: () => null }));
vi.mock('@/components/gateways/ListingGatewaySource', () => ({ default: () => null }));
vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({ notifyCapabilitiesChanged: vi.fn() }));
const draft = '  candidate tag  ';
const networkDenied = vi.fn(() => { throw new Error('Network forbidden'); });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', networkDenied);
  vi.stubGlobal('XMLHttpRequest', networkDenied);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
  api.getListing.mockResolvedValue({ title: 'Synthetic listing', description: 'Description', category: 'Technology', tags: [], pricing: { price: 25, pricing_type: 'one_time' }, status: 'published' });
});
afterEach(() => {
  cleanup();
  expect(api.updateListing).not.toHaveBeenCalled();
  expect(api.publishListing).not.toHaveBeenCalled();
  expect(api.unpublishListing).not.toHaveBeenCalled();
  expect(networkDenied).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(text = draft) {
  render(<EditPage />);
  const box = await screen.findByPlaceholderText<HTMLInputElement>('Add a tag');
  fireEvent.change(box, { target: { value: text } });
  return box;
}
function enter(box: HTMLInputElement, flags: KeyboardEventInit = {}) {
  const event = createEvent.keyDown(box, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ...flags }) as KeyboardEvent;
  fireEvent(box, event);
  return event;
}
// Only local tag state is exercised; no listing save or native OS/IME acceptance.
it.each([
  { name: 'native composing', isComposing: true, keyCode: 13 },
  { name: 'legacy229', keyCode: 229, isComposing: false },
])('preserves browser confirmation and adds once after $name ends', async (flags) => {
  const box = await mount();
  fireEvent.compositionStart(box);
  const event = enter(box, flags);
  expect(event.isComposing).toBe(flags.isComposing);
  expect(event.keyCode).toBe(flags.keyCode);
  expect(event.defaultPrevented).toBe(false);
  expect(box.value).toBe(draft);
  expect(screen.queryByText('candidate tag')).toBeNull();
  fireEvent.compositionEnd(box);
  expect(box.value).toBe(draft);
  expect(screen.queryByText('candidate tag')).toBeNull();
  expect(enter(box, { keyCode: 13, isComposing: false }).defaultPrevented).toBe(true);
  expect(screen.getAllByText('candidate tag')).toHaveLength(1);
  expect(box.value).toBe('');
});
it.each(['Enter', 'Shift Enter', 'Add'])('%s adds one trimmed tag', async (action) => {
  const box = await mount();
  if (action === 'Add')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  else
    expect(enter(box, { shiftKey: action === 'Shift Enter' }).defaultPrevented).toBe(true);
  expect(screen.getAllByText('candidate tag')).toHaveLength(1);
  expect(box.value).toBe('');
});
it.each(['', '   '])('does not add a blank tag %j', async (text) => {
  const box = await mount(text);
  enter(box);
  expect(box.value).toBe('');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(box.value).toBe('');
  expect(screen.queryByRole('button', { name: '×' })).toBeNull();
});
it('clears duplicate input without adding a duplicate for Enter or Add', async () => {
  const box = await mount();
  enter(box);
  for (const action of ['Enter', 'Add']) {
    fireEvent.change(box, { target: { value: draft } });
    if (action === 'Enter')
      enter(box);
    else
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByText('candidate tag')).toHaveLength(1);
    expect(box.value).toBe('');
  }
});
