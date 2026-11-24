import { expect, it } from 'vitest';
import { requestUrgencyLabel } from './request-urgency';

it.each([
  ['low', 'Low'],
  ['normal', 'Normal'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
] as const)('displays %s as %s', (urgency, label) => {
  expect(requestUrgencyLabel(urgency)).toBe(label);
});
