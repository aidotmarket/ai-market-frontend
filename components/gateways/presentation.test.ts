import { expect, it } from 'vitest';
import { statusReason } from './presentation';

it('explains an unknown egress status', () => {
  expect(statusReason('egress_unknown')).toBe('ai.market has not yet verified the network restriction.');
});
