/**
 * Read email from an ID token payload. The SPA does not verify the signature;
 * API Gateway JWT authorizer (US-011) is the trust boundary.
 */
export function emailFromIdToken(idToken: string): string {
  const parts = idToken.split('.');
  if (parts.length < 2) {
    return '';
  }

  try {
    const payloadPart = parts[1];
    if (payloadPart === undefined) {
      return '';
    }
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    const payload = JSON.parse(atob(padded)) as {
      email?: unknown;
      'cognito:username'?: unknown;
    };
    if (typeof payload.email === 'string' && payload.email.length > 0) {
      return payload.email;
    }
    if (
      typeof payload['cognito:username'] === 'string' &&
      payload['cognito:username'].length > 0
    ) {
      return payload['cognito:username'];
    }
  } catch {
    return '';
  }

  return '';
}
