// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TermsAcceptanceForm from './TermsAcceptanceForm';
import { AxiosError } from 'axios';

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
  await screen.findByLabelText(/Country/);
  fillForm();
  fireEvent.change(screen.getByLabelText(/Country/), { target: { value: 'GB' } });
  fireEvent.click(screen.getByLabelText('I am authorized to bind this business'));
  fireEvent.click(screen.getByRole('button', { name: 'Accept and sign' }));
  await waitFor(() => expect(legal.acceptTerms).toHaveBeenCalledWith(expect.objectContaining({ context: 'buyer', jurisdiction: 'GB', authority_ack: true })));
});

it('shows the approved Box 2 checkbox wording', async () => {
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.1' });
  render(<TermsAcceptanceForm context={{ scope: 'individual', party_id: 'buyer-1' }} />);
  expect(screen.getByLabelText('I understand that if I am introduced to a counterparty through ai.market, I must complete that transaction on ai.market. Taking it off the platform within 24 months is a breach of these Terms, and ai.market may pursue the remedies available to it under these Terms and the law.')).not.toBeNull();
});

it('keeps flag-off terms 1.0 acceptance without jurisdiction', async () => {
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.0' });
  render(<TermsAcceptanceForm context={{ scope: 'individual', party_id: 'seller-1' }} />);
  await waitFor(() => expect(legal.getCurrentTerms).toHaveBeenCalled());
  fillForm();
  expect(screen.queryByLabelText(/Country/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Accept and sign' }));
  await waitFor(() => expect(legal.acceptTerms).toHaveBeenCalledWith(expect.not.objectContaining({ jurisdiction: expect.anything() })));
});

it('sends seller context only when explicitly requested', async () => {
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.1' });
  render(<TermsAcceptanceForm context={{ scope: 'individual', party_id: 'seller-1' }} acceptanceContext="seller" />);
  await screen.findByLabelText(/Country/);
  fillForm();
  fireEvent.change(screen.getByLabelText(/Country/), { target: { value: 'US' } });
  fireEvent.click(screen.getByLabelText('I am authorized to bind this business'));
  fireEvent.click(screen.getByRole('button', { name: 'Accept and sign' }));
  await waitFor(() => expect(legal.acceptTerms).toHaveBeenCalledWith(expect.objectContaining({ context: 'seller', jurisdiction: 'US' })));
});

it.each([
  ['SELLER_ACCESS_REQUIRED', 403, 'Only sellers can accept these terms as a seller.', null],
  ['LEGAL_IDENTITY_REQUIRED', 409, 'Enter your business legal name and choose a country to continue.', null],
  ['LEGAL_IDENTITY_REQUIRED', 422, 'Enter your business legal name and choose a country to continue.', null],
  ['SELLER_LEGAL_IDENTITY_REQUIRED', 409, 'Add your legal name in Seller Workspace before accepting as a seller.', '/dashboard/seller-workspace'],
  ['LEGAL_IDENTITY_CONFLICT', 409, "Your legal name doesn't match our records. Contact support.", '/seller-workspace/support/legal-identity'],
  ['LEGAL_IDENTITY_INVALID', 422, 'Check the name and country and try again.', null],
  ['OTHER', 422, 'Could not record acceptance. Please try again.', null],
  ['OTHER', 500, 'Could not record acceptance. Please try again.', null],
])('shows the server failure reason for %s / %s', async (code, status, message, href) => {
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.1' });
  const error = new AxiosError('failure');
  error.response = { data: { detail: { code } }, status } as never;
  legal.acceptTerms.mockRejectedValue(error);
  render(<TermsAcceptanceForm context={{ scope: 'individual', party_id: 'buyer-1' }} />);
  await screen.findByLabelText(/Country/);
  fillForm();
  fireEvent.change(screen.getByLabelText(/Country/), { target: { value: 'US' } });
  fireEvent.click(screen.getByLabelText('I am authorized to bind this business'));
  fireEvent.click(screen.getByRole('button', { name: 'Accept and sign' }));
  expect(await screen.findByText(message, { exact: false })).toBeTruthy();
  expect(screen.queryByText(code)).toBeNull();
  if (href) expect(screen.getByRole('link', { name: href.includes('dashboard') ? 'Open Seller Workspace' : 'Contact support' }).getAttribute('href')).toBe(href);
});

it.each([
  [403, { code: 'SELLER_ACCESS_REQUIRED' }, 'Only sellers can accept these terms as a seller.'],
  [409, { detail: 'Internal identity provider diagnostics' }, 'Could not record acceptance. Please try again.'],
  [422, { detail: 'Unmapped validation diagnostics' }, 'Could not record acceptance. Please try again.'],
])('uses approved copy for response %s / %j', async (status, data, message) => {
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.1' });
  const error = new AxiosError('failure');
  error.response = { data, status } as never;
  legal.acceptTerms.mockRejectedValue(error);
  render(<TermsAcceptanceForm context={{ scope: 'individual', party_id: 'buyer-1' }} />);
  await screen.findByLabelText(/Country/);
  fillForm();
  fireEvent.change(screen.getByLabelText(/Country/), { target: { value: 'US' } });
  fireEvent.click(screen.getByLabelText('I am authorized to bind this business'));
  fireEvent.click(screen.getByRole('button', { name: 'Accept and sign' }));
  expect(await screen.findByText(message)).toBeTruthy();
  expect(screen.queryByText(/diagnostics/)).toBeNull();
});
