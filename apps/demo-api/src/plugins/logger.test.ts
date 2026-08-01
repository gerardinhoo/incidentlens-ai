import { describe, expect, it } from 'vitest';

import { isSafeRequestId, resolveIncomingRequestId } from './logger.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('request ID safety', () => {
  it('accepts a safe client-supplied request id', () => {
    expect(isSafeRequestId('incident-test-request-id')).toBe(true);
    expect(resolveIncomingRequestId('incident-test-request-id')).toBe(
      'incident-test-request-id',
    );
  });

  it('rejects oversized request ids', () => {
    const oversized = `id-${'a'.repeat(200)}`;
    expect(isSafeRequestId(oversized)).toBe(false);
    expect(resolveIncomingRequestId(oversized)).toMatch(UUID_PATTERN);
  });

  it('rejects malformed request ids', () => {
    expect(isSafeRequestId('bad id with spaces')).toBe(false);
    expect(isSafeRequestId('id\nwith-newline')).toBe(false);
    expect(resolveIncomingRequestId('bad id with spaces')).toMatch(
      UUID_PATTERN,
    );
  });

  it('generates an id when the header is missing', () => {
    expect(resolveIncomingRequestId(undefined)).toMatch(UUID_PATTERN);
  });
});
