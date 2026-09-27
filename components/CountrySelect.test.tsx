// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CountrySelect from './CountrySelect';
import { SELLER_COUNTRIES } from '@/api/sellerLegalIdentityCountries';

afterEach(cleanup);

it('lists every assigned country by name and submits only an alpha-2 option', () => {
  const onChange = vi.fn();
  render(<CountrySelect aria-label="Country" value="us" onChange={onChange} />);
  const select = screen.getByRole('combobox', { name: 'Country' }) as HTMLSelectElement;
  const options = Array.from(select.options).slice(1);
  expect(options).toHaveLength(SELLER_COUNTRIES.length);
  expect(options.map((option) => option.textContent)).toEqual(SELLER_COUNTRIES.map(({ code, name }) => `${name} (${code})`));
  expect(select.value).toBe('US');
  expect(options.find((option) => option.value === 'US')?.textContent).toBe('United States (US)');
  expect(select.querySelector('input')).toBeNull();
  fireEvent.change(select, { target: { value: 'US' } });
  expect(onChange).toHaveBeenCalledWith('US');
});
