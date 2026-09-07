// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SellerListingEditor from './SellerListingEditor';
afterEach(cleanup);

describe('Allai seller listing review', () => {
  it('preserves edits across sections and ignores a cancelled response after returning', async () => {
    let finish!: (value: { message: string; proposals: never[] }) => void;
    let signal!: AbortSignal;
    const assistant = vi.fn().mockImplementationOnce((_request, requestSignal) => {
      signal = requestSignal;
      return new Promise((resolve) => { finish = resolve; });
    }).mockResolvedValue({ message: 'Fresh response', proposals: [] });
    const { rerender } = render(<SellerListingEditor assistant={assistant} active />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Keep my title' } });
    fireEvent.change(screen.getByLabelText('Give Allai a starting point'), { target: { value: 'Retail sales' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask Allai to draft my listing' }));
    rerender(<SellerListingEditor assistant={assistant} active={false} />);
    expect(signal.aborted).toBe(true);
    rerender(<SellerListingEditor assistant={assistant} active />);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Keep my title');
    fireEvent.click(screen.getByRole('button', { name: 'Ask Allai to draft my listing' }));
    await screen.findByText('Fresh response');
    await act(async () => finish({ message: 'Old response', proposals: [] }));
    expect(screen.queryByText('Old response')).toBeNull();
  });
  it('does not send seller content when the listing assistant is unavailable', () => {
    render(<SellerListingEditor />);
    fireEvent.change(screen.getByLabelText('Give Allai a starting point'), { target: { value: 'Retail sales by region' } });
    expect((screen.getByRole('button', { name: 'Ask Allai to draft my listing' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Allai listing assistance is not connected yet/)).toBeTruthy();
  });

  it('requires seller acceptance and ignores proposed price or ownership changes', async () => {
    const assistant = vi.fn().mockResolvedValue({ message: 'Here is a draft for your review.', proposals: [
      { field: 'title', value: 'Regional retail sales', reasoning: 'Describes your offering.' },
      { field: 'tags', value: 'retail, sales, regions', reasoning: 'Supports discovery.' },
      { field: 'price', value: '999', reasoning: '' },
      { field: 'ownership', value: 'confirmed', reasoning: '' },
    ] });
    render(<SellerListingEditor assistant={assistant} />);
    fireEvent.change(screen.getByLabelText('Give Allai a starting point'), { target: { value: 'Retail sales by region' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask Allai to draft my listing' }));
    await screen.findByText('Here is a draft for your review.');
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Use all Allai suggestions' }));
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Regional retail sales');
    expect((screen.getByLabelText('Tags') as HTMLInputElement).value).toBe('retail, sales, regions');
    expect((screen.getByLabelText('Your price (USD)') as HTMLInputElement).value).toBe('');
    expect(assistant.mock.calls[0][0]).not.toHaveProperty('price');
  });

  it('keeps edits when a request fails and aborts a pending request on leaving', async () => {
    let signal!: AbortSignal;
    const assistant = vi.fn().mockRejectedValueOnce(new Error('failure')).mockImplementationOnce((_request, requestSignal) => { signal = requestSignal; return new Promise(() => {}); });
    const { unmount } = render(<SellerListingEditor assistant={assistant} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My title' } });
    fireEvent.change(screen.getByLabelText('Give Allai a starting point'), { target: { value: 'Retail sales' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask Allai to draft my listing' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('My title');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask Allai to draft my listing' })));
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
