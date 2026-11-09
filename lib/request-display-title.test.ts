import { describe, expect, it } from 'vitest';
import { requestDisplayTitle } from './request-display-title';

describe('requestDisplayTitle', () => {
  it('preserves an absent title', () => {
    expect(requestDisplayTitle(undefined, '**Title: Licensed retail data**.')).toBeUndefined();
  });

  it.each([
    ['**Title: Licensed retail data**', '**Title: Licensed retail data**. Buyer description.', 'Licensed retail data'],
    ['**Title:** Licensed retail data', '**Title:** Licensed retail data. Buyer description.', 'Licensed retail data'],
    ['**Title: Licensed retail transaction data for regional demand forecasting...', '**Title: Licensed retail transaction data for regional demand forecasting and inventory planning**. Buyer description.', 'Licensed retail transaction data for regional demand forecasting...'],
    ['**Title: ' + 'x'.repeat(71), '**Title: ' + 'x'.repeat(71), 'x'.repeat(71)],
    ['**Title:...', '**Title: ' + 'x'.repeat(72), '**Title:...'],
    ['**Title: ' + '😀'.repeat(60) + '...', '**Title: ' + '😀'.repeat(60) + ' ' + 'x'.repeat(20), '😀'.repeat(60) + '...'],
  ])('formats only a matching generated title %s', (title, description, expected) => {
    expect(requestDisplayTitle(title, description)).toBe(expected);
  });

  it.each([
    ['Ordinary explicit title', '**Title: Licensed retail data**. Buyer description.'],
    ['**Title: Explicit title**', '**Title: Different title**. Buyer description.'],
    ['**Title: Licensed retail data...', '**Title: Licensed retail data**. Buyer description.'],
    ['**Title: Literal prefix**', 'Unrelated description.'],
    ['Title: Literal label', 'Title: Literal label. Buyer description.'],
    ['**Title: **', '**Title: **. Buyer description.'],
  ])('preserves nonmatching or literal title %s', (title, description) => {
    expect(requestDisplayTitle(title, description)).toBe(title);
  });
});
