// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BrowseRequestsPage from './page';

const { fetchDataRequests } = vi.hoisted(() => ({ fetchDataRequests: vi.fn() }));
vi.mock('@/lib/api', () => ({ fetchDataRequests }));

// Public browse payloads can omit response_count despite the shared type.
function request(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, slug: `request-${id}`, title: `Request ${id}`, description: `Data needed for ${id}`,
    categories: ['healthcare'], urgency: 'normal', price_range_min: 1000,
    price_range_max: 2000, currency: 'USD', status: 'open', buyer_display_name: null,
    created_at: '2026-10-01T12:00:00Z', updated_at: null, ...extra,
  };
}

async function renderPage(params: { page?: string; category?: string } = {}) {
  return render(await BrowseRequestsPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => fetchDataRequests.mockReset());
afterEach(cleanup);

describe('public request browsing', () => {
  it.each([true, false, undefined, 'true', 1, null])('tags only an explicit sample flag (%s) beside the card title', async is_sample => {
    const extra = is_sample === undefined ? {} : { is_sample };
    fetchDataRequests.mockResolvedValue({ items: [request('sample', extra), request('ordinary', { title: 'Synthetic data request' })] });
    await renderPage();
    const heading = screen.getByRole('heading', { name: 'Request sample' });
    const header = within(heading.parentElement!);
    expect(header.queryByText('(SAMPLE)') !== null).toBe(is_sample === true);
    expect(header.getByText('normal')).toBeTruthy();
    expect(screen.queryAllByText('(SAMPLE)')).toHaveLength(is_sample === true ? 1 : 0);
    expect(screen.getByRole('link', { name: /Synthetic data request/ }).getAttribute('href')).toBe('/requests/request-ordinary');
  });

  it('renders newest requests first with existing detail, budget and post links', async () => {
    fetchDataRequests.mockResolvedValue({ items: [
      request('older'), request('newer', { created_at: '2026-10-02T12:00:00Z' }),
    ] });
    await renderPage();
    expect(fetchDataRequests).toHaveBeenCalledExactlyOnceWith({ page: 1, per_page: 20, category: undefined });
    const cards = screen.getAllByRole('link', { name: /Request (older|newer)/ });
    expect(cards.map(card => card.getAttribute('href'))).toEqual(['/requests/request-newer', '/requests/request-older']);
    expect(within(cards[0]).getByText('Data needed for newer')).toBeTruthy();
    expect(within(cards[0]).getByText('$1,000 – $2,000 USD')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Post a Data Request' }).getAttribute('href')).toBe('/requests/new');
    expect(screen.queryByText(/No data requests|Requests are unavailable/)).toBeNull();
  });

  it.each(['', 'finance'])('shows null failure separately from empty results (category=%s)', async category => {
    fetchDataRequests.mockResolvedValue(null);
    await renderPage({ category });
    expect(screen.getByText('Requests are unavailable')).toBeTruthy();
    expect(screen.getByText('Please try again later.')).toBeTruthy();
    expect(screen.queryByText(/No data requests|No requests match|Be the first/)).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Post a Data Request' })).toHaveLength(1);
    expect((screen.getByRole('combobox', { name: 'Category' }) as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Apply filter' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([{ items: [], total: 0 }, { items: [] }, []])('keeps the unfiltered valid-empty invitation for %j', async payload => {
    fetchDataRequests.mockResolvedValue(payload);
    await renderPage();
    expect(screen.getByText('No data requests yet')).toBeTruthy();
    expect(screen.getByText('Be the first to tell the market what you need.')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Post a Data Request' })).toHaveLength(2);
    expect(screen.queryByText('Requests are unavailable')).toBeNull();
  });

  it('helps a buyer recover from a valid filtered empty result', async () => {
    fetchDataRequests.mockResolvedValue({ items: [], total: 0 });
    await renderPage({ category: 'finance' });
    expect(screen.getByText('No requests match this category')).toBeTruthy();
    expect(screen.getByText('Try another category.')).toBeTruthy();
    expect(screen.queryByText(/No data requests|Be the first|Requests are unavailable/)).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Post a Data Request' })).toHaveLength(1);
  });

  it.each(['healthcare', 'finance', ''])('submits a native GET preserving category %s and resetting pagination', async chosen => {
    fetchDataRequests.mockResolvedValue({ items: [] });
    await renderPage({ page: '4', category: 'technology' });
    const select = screen.getByRole('combobox', { name: 'Category' }) as HTMLSelectElement;
    expect(select.id).toBe('request-category');
    expect(select.value).toBe('technology');
    expect(Array.from(select.options, option => option.value)).toEqual([
      '', 'healthcare', 'finance', 'technology', 'retail', 'real-estate', 'marketing', 'government', 'other',
    ]);
    fireEvent.change(select, { target: { value: chosen } });
    const button = screen.getByRole('button', { name: 'Apply filter' }) as HTMLButtonElement;
    const form = button.form!;
    expect(button.type).toBe('submit');
    expect(select.form).toBe(form);
    expect(form.method).toBe('get');
    expect(form.getAttribute('action')).toBe('/requests');
    const submitted = new FormData(form);
    expect(Array.from(submitted.entries())).toEqual([['category', chosen]]);
    const destination = new URL(form.action);
    destination.search = new URLSearchParams(Array.from(submitted, ([key, value]) => [key, String(value)])).toString();
    expect(destination.pathname).toBe('/requests');
    expect(destination.searchParams.has('page')).toBe(false);
    cleanup();
    await renderPage(Object.fromEntries(destination.searchParams));
    expect(fetchDataRequests).toHaveBeenLastCalledWith({ page: 1, per_page: 20, category: chosen || undefined });
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe(chosen);
  });

  it('preserves category in pagination and handles the legacy array payload', async () => {
    fetchDataRequests.mockResolvedValue(Array.from({ length: 20 }, (_, index) => request(String(index))));
    await renderPage({ page: '2', category: 'healthcare' });
    expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe('/requests?page=1&category=healthcare');
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe('/requests?page=3&category=healthcare');
  });

  it.each([20, 40])('omits Next on a full final page (total=%s)', async total => {
    fetchDataRequests.mockResolvedValue({ items: Array.from({ length: 20 }, (_, i) => request(String(i))), total });
    await renderPage({ page: String(total / 20), category: 'healthcare' });
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
    if (total === 40) {
      expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe('/requests?page=1&category=healthcare');
    }
  });

  it.each([1, 20])('uses total to offer Next on a nonfinal page with %s items', async count => {
    fetchDataRequests.mockResolvedValue({ items: Array.from({ length: count }, (_, i) => request(String(i))), total: 41 });
    await renderPage({ page: '2', category: 'finance' });
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe('/requests?page=3&category=finance');
  });

  it.each([undefined, null, -1, 1.5, NaN, Infinity, '40', Number.MAX_SAFE_INTEGER + 1])(
    'falls back to full-page paging for an untrustworthy total (%s)', async total => {
      fetchDataRequests.mockResolvedValue({ items: Array.from({ length: 20 }, (_, i) => request(String(i))), total });
      await renderPage();
      expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe('/requests?page=2');
      cleanup();
      fetchDataRequests.mockResolvedValue({ items: [request('short')], total });
      await renderPage();
      expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
    }
  );

  it.each([0, 1])('trusts a valid total (%s) instead of the full-page fallback', async total => {
    fetchDataRequests.mockResolvedValue({ items: Array.from({ length: 20 }, (_, i) => request(String(i))), total });
    await renderPage();
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  });

  it.each([
    ['', { items: [], total: 40 }], ['finance', { items: [], total: 40 }],
    ['finance', []], ['finance', { items: [] }],
  ])('offers category-preserving recovery on an empty later page (category=%s, payload=%j)', async (category, payload) => {
    fetchDataRequests.mockResolvedValue(payload);
    await renderPage({ page: '4', category });
    expect(screen.getByText('No requests on this page')).toBeTruthy();
    expect(screen.queryByText(/No data requests yet|No requests match this category|Be the first/)).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Post a Data Request' })).toHaveLength(1);
    const suffix = category ? '&category=finance' : '';
    expect(screen.getByRole('link', { name: 'First page' }).getAttribute('href')).toBe(`/requests?page=1${suffix}`);
    expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe(`/requests?page=3${suffix}`);
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  });

  it.each(['', 'finance'])('keeps later-page failures separate from empty-page recovery (category=%s)', async category => {
    fetchDataRequests.mockResolvedValue(null);
    await renderPage({ page: '3', category });
    expect(screen.getByText('Requests are unavailable')).toBeTruthy();
    expect(screen.queryByText('No requests on this page')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
  });

  it.each(['', 'abc', '2junk', '1.5', '0', '-2', 'Infinity', '9007199254740992', '1e2', '0x10', ' 2 '])(
    'normalizes invalid page %j to the first page before fetching and linking', async page => {
      fetchDataRequests.mockResolvedValue({ items: Array.from({ length: 20 }, (_, i) => request(String(i))), total: 40 });
      await renderPage({ page, category: 'finance' });
      expect(fetchDataRequests).toHaveBeenCalledExactlyOnceWith({ page: 1, per_page: 20, category: 'finance' });
      expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe('/requests?page=2&category=finance');
    }
  );

  it.each([
    ['absent', {}, null], ['zero', { response_count: 0 }, '0 responses'],
    ['one', { response_count: 1 }, '1 response'], ['plural', { response_count: 3 }, '3 responses'],
    ['negative', { response_count: -1 }, null], ['NaN', { response_count: NaN }, null],
    ['infinity', { response_count: Infinity }, null], ['string', { response_count: '2' }, null],
    ['null', { response_count: null }, null],
  ])('renders only known valid response counts: %s', async (_name, extra, expected) => {
    fetchDataRequests.mockResolvedValue({ items: [request('count', extra)] });
    await renderPage();
    const card = screen.getByRole('link', { name: /Request count/ });
    if (expected) expect(within(card).getByText(expected)).toBeTruthy();
    else expect(card.textContent).not.toMatch(/response/);
  });
});
