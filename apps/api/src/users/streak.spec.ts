import { nextStreak } from './users.service';

const at = (iso: string) => new Date(iso);

describe('nextStreak (UTC calendar days)', () => {
  it('starts at 1 with no previous activity', () => {
    expect(nextStreak(0, null, at('2026-11-03T10:00:00Z'))).toBe(1);
  });

  it('grows when the last activity was the previous calendar day, even < 24h ago', () => {
    // 20:00 Monday → 08:00 Tuesday: 12 hours apart, but a new day
    expect(nextStreak(3, at('2026-11-02T20:00:00Z'), at('2026-11-03T08:00:00Z'))).toBe(4);
  });

  it('does not change on a second play the same day', () => {
    expect(nextStreak(4, at('2026-11-03T00:05:00Z'), at('2026-11-03T23:55:00Z'))).toBe(4);
  });

  it('resets after a missed day, even if < 48h ago', () => {
    expect(nextStreak(9, at('2026-11-01T23:00:00Z'), at('2026-11-03T01:00:00Z'))).toBe(1);
  });
});
