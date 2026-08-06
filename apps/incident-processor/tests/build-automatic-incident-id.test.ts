import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  AUTOMATIC_INCIDENT_ID_HASH_HEX_LENGTH,
  AUTOMATIC_INCIDENT_ID_MAX_LENGTH,
  AUTOMATIC_INCIDENT_ID_PREFIX,
  buildAutomaticIncidentId,
} from '../src/incidents/build-automatic-incident-id.js';

describe('buildAutomaticIncidentId', () => {
  it('returns the same id for the same sourceEventId', () => {
    expect(buildAutomaticIncidentId('cw-event-1')).toBe(
      buildAutomaticIncidentId('cw-event-1'),
    );
  });

  it('returns different ids for different sourceEventIds', () => {
    expect(buildAutomaticIncidentId('cw-event-1')).not.toBe(
      buildAutomaticIncidentId('cw-event-2'),
    );
  });

  it('uses the auto_ prefix and truncated sha256 hex', () => {
    const id = buildAutomaticIncidentId('cw-event-1');
    const expected =
      AUTOMATIC_INCIDENT_ID_PREFIX +
      createHash('sha256')
        .update('cw-event-1', 'utf8')
        .digest('hex')
        .slice(0, AUTOMATIC_INCIDENT_ID_HASH_HEX_LENGTH);

    expect(id).toBe(expected);
    expect(id.startsWith(AUTOMATIC_INCIDENT_ID_PREFIX)).toBe(true);
    expect(id).toMatch(/^auto_[0-9a-f]+$/);
    expect(id.length).toBe(AUTOMATIC_INCIDENT_ID_MAX_LENGTH);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it('rejects empty sourceEventId', () => {
    expect(() => buildAutomaticIncidentId('')).toThrow(/non-empty/);
    expect(() => buildAutomaticIncidentId('   ')).toThrow(/non-empty/);
  });
});
