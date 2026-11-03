// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ListingPreview from './ListingPreview';
afterEach(cleanup);
it('renders only public fields as text, with a valid zero price', () => {
  const draft = { title: '<script>not executable</script>', description: 'Weekly regional totals', category: 'Retail', tags: 'retail, retail, weekly', price: '0', license: 'Research', brief: 'Private planning note' };
  render(<ListingPreview draft={draft} />);
  expect(screen.getByRole('heading', {name: draft.title})).toBeTruthy();
  expect(screen.queryByText(draft.brief)).toBeNull();
  expect(screen.getByText('$0.00')).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.queryByRole('button', {name: /publish/i})).toBeNull();
});
it('does not present missing or invalid fields as a complete offer', () => {
  render(<ListingPreview draft={{ title: '', description: '', category: '', tags: '', price: '-10', license: '' }} />);
  expect(screen.getByText('Add a listing title')).toBeTruthy();
  expect(screen.getByText('Set a valid price')).toBeTruthy();
  expect(screen.getByText('Choose your license')).toBeTruthy();
});

it.each([' \t\n', '\u0085', '\u001c\u001d\u001e\u001f'])('shows the description placeholder for Python whitespace %j', description => {
  render(<ListingPreview draft={{ title: '', description, category: '', tags: '', price: '', license: '' }} />);
  expect(screen.getByText('Add a description for buyers.')).toBeTruthy();
});

it('retains a BOM description as content, matching Python strip', () => {
  const {container}=render(<ListingPreview draft={{ title: '', description: '\ufeff', category: '', tags: '', price: '', license: '' }} />);
  expect(screen.queryByText('Add a description for buyers.')).toBeNull();
  expect(container.querySelector('article div p')?.textContent).toBe('\ufeff');
});
