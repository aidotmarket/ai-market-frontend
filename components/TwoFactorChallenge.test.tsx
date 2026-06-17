import { describe, expect, it } from 'vitest';
import { formatTwoFactorRemaining, getTwoFactorRemainingMs } from './TwoFactorChallenge';

describe('TwoFactorChallenge countdown helpers', () => {
  it('computes remaining time from an absolute expiry timestamp', () => {
    const expiresAt = Date.parse('2026-06-17T12:05:00Z');
    const now = Date.parse('2026-06-17T12:04:17Z');

    expect(getTwoFactorRemainingMs(expiresAt, now)).toBe(43_000);
  });

  it('clamps expired sessions to 0 and formats mm:ss', () => {
    const expiresAt = Date.parse('2026-06-17T12:05:00Z');
    const now = Date.parse('2026-06-17T12:05:01Z');

    expect(getTwoFactorRemainingMs(expiresAt, now)).toBe(0);
    expect(formatTwoFactorRemaining(43_000)).toBe('0:43');
    expect(formatTwoFactorRemaining(300_000)).toBe('5:00');
  });
});
