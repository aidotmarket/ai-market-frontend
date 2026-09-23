// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TermsAcceptanceForm from './TermsAcceptanceForm';

const legal = vi.hoisted(() => ({ getCurrentTerms: vi.fn(), acceptTerms: vi.fn() }));
vi.mock('@/api/legal', () => legal);
vi.mock('@/store/auth', () => ({ useAuthStore: (select: (state: { user: null }) => unknown) => select({ user: null }) }));

beforeEach(() => legal.acceptTerms.mockResolvedValue({ terms_version: '1.1' }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function fillForm() {
  for (const id of ['ack-box-1', 'ack-box-2', 'ack-box-3']) {
    fireEvent.click(document.getElementById(id)!);
  }
  fireEvent.change(screen.getByLabelText(/Full legal name/), { target: { value: 'Ada Seller' } });
  fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Director' } });
  fireEvent.change(screen.getByLabelText(/Business legal name/), { target: { value: 'Seller Ltd' } });
}

it('sends the required jurisdiction and authority for terms 1.1', async () => {
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.1' });
  render(<TermsAcceptanceForm context={{ scope: 'individual', party_id: 'seller-1' }} />);
  await screen.findByLabelText(/Jurisdiction/);
  fillForm();
  fireEvent.change(screen.getByLabelText(/Jurisdiction/), { target: { value: 'gb' } });
  fireEvent.click(screen.getByLabelText('I am authorized to bind this business'));
  fireEvent.click(screen.getByRole('button', { name: 'Accept and sign' }));
  await waitFor(() => expect(legal.acceptTerms).toHaveBeenCalledWith(expect.objectContaining({ jurisdiction: 'GB', authority_ack: true })));
});

it('keeps flag-off terms 1.0 acceptance without jurisdiction', async () => {
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.0' });
  render(<TermsAcceptanceForm context={{ scope: 'individual', party_id: 'seller-1' }} />);
  await waitFor(() => expect(legal.getCurrentTerms).toHaveBeenCalled());
  fillForm();
  expect(screen.queryByLabelText(/Jurisdiction/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Accept and sign' }));
  await waitFor(() => expect(legal.acceptTerms).toHaveBeenCalledWith(expect.not.objectContaining({ jurisdiction: expect.anything() })));
});
