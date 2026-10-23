import { expect, it } from 'vitest';
import { DESCRIPTION_CONFIRMATION, blockerMessage, descriptionFailure, statusReason } from './presentation';

it('explains an unknown egress status', () => {
  expect(statusReason('egress_unknown')).toBe('ai.market has not yet verified the network restriction.');
});

it('discloses table metadata, opaque fingerprints and the first-line recognition risk before describing', () => {
  expect(DESCRIPTION_CONFIRMATION).toContain('For tables, ai.market receives column names');
  expect(DESCRIPTION_CONFIRMATION).toContain('their types and counts');
  expect(DESCRIPTION_CONFIRMATION).toContain('For other files, ai.market receives only a SHA-256 fingerprint and the size.');
  expect(DESCRIPTION_CONFIRMATION).toContain('someone who already holds the same public file recognise it');
  expect(DESCRIPTION_CONFIRMATION).toContain('first-line values would be sent as column names');
  expect(DESCRIPTION_CONFIRMATION).toContain('Leave such files out before describing.');
  expect(DESCRIPTION_CONFIRMATION).not.toContain('It will not receive any values');
});

it('uses the generic fallback for the removed unsupported_format refusal', () => {
  expect(descriptionFailure('unsupported_format')).toBe(descriptionFailure('future_code'));
  expect(descriptionFailure('unsupported_format')).not.toContain('format cannot be described');
});

it('explains how to recover from a listing data format mismatch', () => {
  expect(blockerMessage({ code: 'data_format_mismatch' }, [])).toBe(
    "This listing's format doesn't match all of its table files. Create a new listing from this gateway and leave the format empty.",
  );
});
