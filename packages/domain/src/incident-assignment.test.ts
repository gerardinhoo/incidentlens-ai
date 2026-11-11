import { describe, expect, it } from 'vitest';

import { createIncident } from './create-incident.js';
import { assignIncident } from './incident-assignment.js';

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function buildOpenIncident() {
  return createIncident({
    title: 'API latency spike',
    source: 'demo-api',
    severity: 'high',
    errorType: 'TimeoutError',
  });
}

describe('assignIncident', () => {
  it('sets assigneeId and assigneeEmail without mutating the original', () => {
    const incident = buildOpenIncident();
    const originalUpdatedAt = incident.updatedAt;

    const next = assignIncident(incident, {
      id: 'sub-1',
      email: 'ops@example.com',
    });

    expect(next).not.toBe(incident);
    expect(incident.assigneeId).toBeUndefined();
    expect(next.assigneeId).toBe('sub-1');
    expect(next.assigneeEmail).toBe('ops@example.com');
    expect(next.updatedAt).not.toBe(originalUpdatedAt);
    expect(next.updatedAt).toMatch(ISO_UTC_PATTERN);
    expect(next.title).toBe(incident.title);
    expect(next.status).toBe(incident.status);
  });

  it('replaces a previous owner', () => {
    const owned = assignIncident(buildOpenIncident(), {
      id: 'sub-1',
      email: 'first@example.com',
    });

    const next = assignIncident(owned, {
      id: 'sub-2',
      email: 'second@example.com',
    });

    expect(next.assigneeId).toBe('sub-2');
    expect(next.assigneeEmail).toBe('second@example.com');
  });

  it('omits assigneeEmail when the operator has no email', () => {
    const withEmail = assignIncident(buildOpenIncident(), {
      id: 'sub-1',
      email: 'ops@example.com',
    });

    const next = assignIncident(withEmail, { id: 'sub-2' });

    expect(next.assigneeId).toBe('sub-2');
    expect(next).not.toHaveProperty('assigneeEmail');
  });

  it('rejects a blank operator id', () => {
    expect(() => assignIncident(buildOpenIncident(), { id: '  ' })).toThrow(
      'assignIncident operator.id must be a non-empty string',
    );
  });
});
