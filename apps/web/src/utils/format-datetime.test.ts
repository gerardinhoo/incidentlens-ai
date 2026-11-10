import { describe, expect, it } from 'vitest';
import { formatDateTime, formatRelativeTime } from './format-datetime';

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

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-08-10T15:30:00.000Z');

  it('uses compact units within a week', () => {
    expect(formatRelativeTime('2026-08-10T15:29:30.000Z', now)).toBe(
      'just now',
    );
    expect(formatRelativeTime('2026-08-10T15:28:00.000Z', now)).toBe('2m ago');
    expect(formatRelativeTime('2026-08-10T13:30:00.000Z', now)).toBe('2h ago');
    expect(formatRelativeTime('2026-08-08T15:30:00.000Z', now)).toBe('2d ago');
  });

  it('falls back to absolute time when older than a week or invalid', () => {
    expect(formatRelativeTime('2026-08-01T15:30:00.000Z', now)).toBe(
      formatDateTime('2026-08-01T15:30:00.000Z'),
    );
    expect(formatRelativeTime('not-a-date', now)).toBe('not-a-date');
  });
});
