import {describe, expect, it} from 'vitest';
import {formatBytes} from './formatBytes';

describe('decimal SI byte formatting', () => {
  it.each([
    [0, '0 B'], [1, '1 B'], [999, '999 B'], [1000, '1 KB'],
    [1536, '1.54 KB'], [12345, '12.35 KB'], [999999, '1,000 KB'],
    [1000000, '1 MB'], [2500000, '2.5 MB'], [1000000000, '1 GB'],
    [14140000000, '14.14 GB'], [1000000000000, '1 TB'],
    [1234567890000000, '1,234.57 TB'],
    [-1, '0 B'], [NaN, '0 B'], [Infinity, '0 B'],
  ])('formats %s as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
