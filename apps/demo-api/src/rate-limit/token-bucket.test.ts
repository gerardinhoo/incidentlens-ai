import { describe, expect, it } from 'vitest';
import {
  clientIpFromHeaders,
  createTokenBucketLimiter,
} from './token-bucket.js';

describe('createTokenBucketLimiter', () => {
  it('allows up to capacity immediately, then rejects until refill', () => {
    const limiter = createTokenBucketLimiter({
      capacity: 2,
      refillPerMinute: 60,
    });
    const t0 = 1_000_000;

    expect(limiter.take('10.0.0.1', t0).ok).toBe(true);
    expect(limiter.take('10.0.0.1', t0).ok).toBe(true);
    const denied = limiter.take('10.0.0.1', t0);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
    }
  });

  it('isolates keys and refills over time', () => {
    const limiter = createTokenBucketLimiter({
      capacity: 1,
      refillPerMinute: 60,
    });
    const t0 = 1_000_000;

    expect(limiter.take('a', t0).ok).toBe(true);
    expect(limiter.take('b', t0).ok).toBe(true);
    expect(limiter.take('a', t0).ok).toBe(false);
    expect(limiter.take('a', t0 + 1_000).ok).toBe(true);
  });
});

describe('clientIpFromHeaders', () => {
  it('uses the first X-Forwarded-For hop', () => {
    expect(
      clientIpFromHeaders(
        { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
        '127.0.0.1',
      ),
    ).toBe('203.0.113.9');
    expect(clientIpFromHeaders({}, '127.0.0.1')).toBe('127.0.0.1');
  });
});
