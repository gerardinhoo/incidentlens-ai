import { describe, expect, it } from 'vitest';

import { operatorFromAuthorizationHeader } from './operator-from-authorization.js';

function bearerToken(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `Bearer hdr.${encoded}.sig`;
}

describe('operatorFromAuthorizationHeader', () => {
  it('reads sub and email from a Bearer ID token', () => {
    expect(
      operatorFromAuthorizationHeader(
        bearerToken({ sub: 'sub-1', email: 'ops@example.com' }),
      ),
    ).toEqual({ id: 'sub-1', email: 'ops@example.com' });
  });

  it('omits email when the claim is absent', () => {
    expect(
      operatorFromAuthorizationHeader(bearerToken({ sub: 'sub-1' })),
    ).toEqual({ id: 'sub-1' });
  });

  it('returns undefined without a usable sub', () => {
    expect(operatorFromAuthorizationHeader(undefined)).toBeUndefined();
    expect(operatorFromAuthorizationHeader('Basic abc')).toBeUndefined();
    expect(
      operatorFromAuthorizationHeader(
        bearerToken({ email: 'ops@example.com' }),
      ),
    ).toBeUndefined();
  });
});
