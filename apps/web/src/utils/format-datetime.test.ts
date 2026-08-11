import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format-datetime';

describe('formatDateTime', () => {
  it('formats a valid ISO timestamp', () => {
    const formatted = formatDateTime('2026-08-10T15:30:00.000Z');
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).not.toBe('2026-08-10T15:30:00.000Z');
  });

  it('returns the original string when invalid', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });
});
