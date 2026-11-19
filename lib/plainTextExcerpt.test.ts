import { describe, expect, it } from 'vitest';
import { plainTextExcerpt } from './plainTextExcerpt';

describe('plainTextExcerpt', () => {
  it('bounds input to 600 characters before stripping Markdown', () => {
    expect(plainTextExcerpt(' '.repeat(600) + '**hidden**')).toBe('');
    expect(plainTextExcerpt('x'.repeat(601))).toBe('x'.repeat(600));
  });
  it.each([
    ['**Title: Request for retail data**', 'Request for retail data'],
    ['### **Title:** Request for _retail_ data', 'Request for retail data'],
    ['# Heading\n\n- **Bold** and *italic*\n+ __More__ and _text_\n1. [Source](https://example.com)', 'Heading Bold and italic More and text Source'],
    ['## Sources ##\n* [Licensed data](https://example.com)\n2) `CSV` files', 'Sources Licensed data CSV files'],
    ['Title: Plain title', 'Plain title'],
    ['Ordinary data_set with 10% growth', 'Ordinary data_set with 10% growth'],
    ['2024. Sales data for EU', '2024. Sales data for EU'],
    ['5 * 3 pricing, 2*2 grid', '5 * 3 pricing, 2*2 grid'],
    ['Need *.csv files and SELECT * exports', 'Need *.csv files and SELECT * exports'],
    ['données_été', 'données_été'],
    ['__init__', 'init'],
    ['**', ''],
    ['99. Sales data', 'Sales data'],
    ['99) Sales data', 'Sales data'],
    ['100) Sales data', '100) Sales data'],
    ['', ''],
    [undefined, ''],
  ])('converts %j to plain card text', (source, expected) => {
    expect(plainTextExcerpt(source)).toBe(expected);
  });
});
