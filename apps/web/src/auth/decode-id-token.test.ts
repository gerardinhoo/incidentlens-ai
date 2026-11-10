import { describe, expect, it } from 'vitest';
import { emailFromIdToken, isIdTokenExpired } from './decode-id-token';

function encodePayload(payload: object): string {
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('id token helpers', () => {
  it('reads email from the payload', () => {
    const token = `h.${encodePayload({ email: 'ops@example.com', exp: 1 })}.s`;
    expect(emailFromIdToken(token)).toBe('ops@example.com');
  });

  it('treats missing or past exp as expired', () => {
    expect(isIdTokenExpired('not-a-jwt')).toBe(true);
    const expired = `h.${encodePayload({ exp: 100 })}.s`;
    expect(isIdTokenExpired(expired, 101)).toBe(true);
    const fresh = `h.${encodePayload({ exp: 200 })}.s`;
    expect(isIdTokenExpired(fresh, 150)).toBe(false);
  });
});
