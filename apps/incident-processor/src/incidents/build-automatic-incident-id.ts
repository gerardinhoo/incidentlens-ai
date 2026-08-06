import { createHash } from 'node:crypto';

/**
 * Hex chars taken from SHA-256(sourceEventId).
 * 128 bits (32 hex) keeps IDs short for DynamoDB partition keys while
 * collision risk remains negligible for CloudWatch log event volumes.
 * Full SHA-256 hex is 64 chars; we deliberately truncate with documentation.
 */
export const AUTOMATIC_INCIDENT_ID_HASH_HEX_LENGTH = 32;

export const AUTOMATIC_INCIDENT_ID_PREFIX = 'auto_';

/** Max length: prefix + truncated hex. */
export const AUTOMATIC_INCIDENT_ID_MAX_LENGTH =
  AUTOMATIC_INCIDENT_ID_PREFIX.length + AUTOMATIC_INCIDENT_ID_HASH_HEX_LENGTH;

const SAFE_ID_PATTERN = /^auto_[0-9a-f]+$/;

/**
 * Derive a deterministic DynamoDB-safe incident id from CloudWatch sourceEventId.
 * Same sourceEventId → same id; different ids → different hashes (practically).
 */
export function buildAutomaticIncidentId(sourceEventId: string): string {
  const trimmed = sourceEventId.trim();
  if (trimmed.length === 0) {
    throw new Error('sourceEventId must be a non-empty string');
  }

  const digest = createHash('sha256')
    .update(trimmed, 'utf8')
    .digest('hex')
    .slice(0, AUTOMATIC_INCIDENT_ID_HASH_HEX_LENGTH);

  const id = `${AUTOMATIC_INCIDENT_ID_PREFIX}${digest}`;
  if (
    !SAFE_ID_PATTERN.test(id) ||
    id.length > AUTOMATIC_INCIDENT_ID_MAX_LENGTH
  ) {
    throw new Error('failed to build a safe automatic incident id');
  }
  return id;
}
