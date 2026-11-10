/**
 * Format an ISO-8601 timestamp for display.
 * Returns the original string if parsing fails.
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Compact relative time for the incident list (`2m ago`).
 * Falls back to `formatDateTime` for invalid, future, or older-than-a-week values.
 */
export function formatRelativeTime(
  iso: string,
  nowMs: number = Date.now(),
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const deltaMs = nowMs - date.getTime();
  if (deltaMs < 0 || deltaMs >= WEEK_MS) {
    return formatDateTime(iso);
  }
  if (deltaMs < MINUTE_MS) {
    return 'just now';
  }
  if (deltaMs < HOUR_MS) {
    return `${Math.floor(deltaMs / MINUTE_MS)}m ago`;
  }
  if (deltaMs < DAY_MS) {
    return `${Math.floor(deltaMs / HOUR_MS)}h ago`;
  }
  return `${Math.floor(deltaMs / DAY_MS)}d ago`;
}
