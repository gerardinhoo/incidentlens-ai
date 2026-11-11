type IdTokenPayload = {
  sub?: unknown;
  email?: unknown;
  exp?: unknown;
  'cognito:username'?: unknown;
};

/**
 * Decode a JWT payload without verifying the signature.
 * API Gateway JWT authorizer (US-011) is the trust boundary.
 */
export function parseIdTokenPayload(
  idToken: string,
): IdTokenPayload | undefined {
  const parts = idToken.split('.');
  if (parts.length < 2) {
    return undefined;
  }

  try {
    const payloadPart = parts[1];
    if (payloadPart === undefined) {
      return undefined;
    }
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    return JSON.parse(atob(padded)) as IdTokenPayload;
  } catch {
    return undefined;
  }
}

/**
 * Read email from an ID token payload. The SPA does not verify the signature.
 */
export function subFromIdToken(idToken: string): string {
  const payload = parseIdTokenPayload(idToken);
  if (payload === undefined) {
    return '';
  }
  if (typeof payload.sub === 'string' && payload.sub.trim().length > 0) {
    return payload.sub.trim();
  }
  return '';
}

export function emailFromIdToken(idToken: string): string {
  const payload = parseIdTokenPayload(idToken);
  if (payload === undefined) {
    return '';
  }
  if (typeof payload.email === 'string' && payload.email.length > 0) {
    return payload.email;
  }
  if (
    typeof payload['cognito:username'] === 'string' &&
    payload['cognito:username'].length > 0
  ) {
    return payload['cognito:username'];
  }
  return '';
}

/** True when the ID token `exp` is missing or already in the past. */
export function isIdTokenExpired(
  idToken: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const payload = parseIdTokenPayload(idToken);
  return (
    payload === undefined ||
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSeconds
  );
}
