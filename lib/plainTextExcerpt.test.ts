import { describe, expect, it } from 'vitest';
import { plainTextExcerpt } from './plainTextExcerpt';

describe('plainTextExcerpt', () => {
  it.each([
    ['**Title: Request for retail data**', 'Request for retail data'],
    ['### **Title:** Request for _retail_ data', 'Request for retail data'],
    ['# Heading\n\n- **Bold** and *italic*\n+ __More__ and _text_\n1. [Source](https://example.com)', 'Heading Bold and italic More and text Source'],
    ['## Sources ##\n* [Licensed data](https://example.com)\n2) `CSV` files', 'Sources Licensed data CSV files'],
    ['Title: Plain title', 'Plain title'],
    ['Ordinary data_set with 10% growth', 'Ordinary data_set with 10% growth'],
    ['', ''],
    [undefined, ''],
  ])('converts %j to plain card text', (source, expected) => {
    expect(plainTextExcerpt(source)).toBe(expected);
  });
});
