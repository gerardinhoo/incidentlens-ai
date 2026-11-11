export type OperatorIdentity = {
  id: string;
  email?: string;
};

type JwtPayload = {
  sub?: unknown;
  email?: unknown;
};

function decodeJwtPayload(token: string): JwtPayload | undefined {
  const parts = token.split('.');
  if (parts.length < 2) {
    return undefined;
  }
  const payloadPart = parts[1];
  if (payloadPart === undefined) {
    return undefined;
  }

  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    return JSON.parse(
      Buffer.from(padded, 'base64').toString('utf8'),
    ) as JwtPayload;
  } catch {
    return undefined;
  }
}

/**
 * Read the signed-in operator from Authorization Bearer.
 * API Gateway JWT is the trust boundary on the shared stack; the payload
 * is not re-verified here. Local Vite forwards the same ID token.
 */
export function operatorFromAuthorizationHeader(
  authorization: string | string[] | undefined,
): OperatorIdentity | undefined {
  const header = Array.isArray(authorization)
    ? authorization[0]
    : authorization;
  if (header === undefined) {
    return undefined;
  }

  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  if (match?.[1] === undefined) {
    return undefined;
  }

  const payload = decodeJwtPayload(match[1]);
  if (payload === undefined || typeof payload.sub !== 'string') {
    return undefined;
  }
  const id = payload.sub.trim();
  if (id.length === 0) {
    return undefined;
  }

  const identity: OperatorIdentity = { id };
  if (typeof payload.email === 'string' && payload.email.trim().length > 0) {
    identity.email = payload.email.trim();
  }
  return identity;
}
