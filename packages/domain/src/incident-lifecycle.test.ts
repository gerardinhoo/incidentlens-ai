import { describe, expect, it } from 'vitest';

import { createIncident } from './create-incident.js';
import type { Incident } from './incident.js';
import {
  assertValidTransition,
  canTransition,
  transitionIncident,
} from './incident-lifecycle.js';
import { MAX_INCIDENT_STATUS_HISTORY } from './incident-status-history.js';
import type { IncidentStatus } from './incident-status.js';

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function buildOpenIncident(): Incident {
  return createIncident({
    title: 'API latency spike',
    description: 'p95 latency exceeded',
    source: 'demo-api',
    severity: 'high',
    errorType: 'TimeoutError',
    requestId: 'req-123',
    metadata: { service: 'checkout' },
  });
}

describe('incident lifecycle', () => {
  const allowed: Array<[IncidentStatus, IncidentStatus]> = [
    ['open', 'investigating'],
    ['open', 'resolved'],
    ['investigating', 'resolved'],
  ];

  const rejected: Array<[IncidentStatus, IncidentStatus]> = [
    ['investigating', 'open'],
    ['resolved', 'open'],
    ['resolved', 'investigating'],
  ];

  const sameState: Array<[IncidentStatus, IncidentStatus]> = [
    ['open', 'open'],
    ['investigating', 'investigating'],
    ['resolved', 'resolved'],
  ];

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertValidTransition(from, to)).not.toThrow();
  });

  it.each(rejected)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertValidTransition(from, to)).toThrow(
      `Invalid incident status transition: ${from} -> ${to}`,
    );
  });

  it.each(sameState)('rejects same-state transition %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertValidTransition(from, to)).toThrow(
      `Invalid incident status transition: ${from} -> ${to}`,
    );
  });

  it('transitionIncident returns a new object without mutating the original', () => {
    const incident = buildOpenIncident();
    const originalStatus = incident.status;
    const originalUpdatedAt = incident.updatedAt;

    const next = transitionIncident(incident, 'investigating');

    expect(next).not.toBe(incident);
    expect(incident.status).toBe(originalStatus);
    expect(incident.updatedAt).toBe(originalUpdatedAt);
    expect(next.status).toBe('investigating');
    expect(incident.statusHistory).toBeUndefined();
    expect(next.statusHistory).toHaveLength(1);
    expect(next.statusHistory?.[0]).toMatchObject({
      from: 'open',
      to: 'investigating',
      actorId: 'anonymous',
    });
    expect(next.statusHistory?.[0]?.at).toMatch(ISO_UTC_PATTERN);
  });

  it('transitionIncident preserves all fields except status and updatedAt', () => {
    const incident: Incident = {
      ...buildOpenIncident(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const next = transitionIncident(incident, 'resolved');

    expect(next.id).toBe(incident.id);
    expect(next.title).toBe(incident.title);
    expect(next.description).toBe(incident.description);
    expect(next.source).toBe(incident.source);
    expect(next.severity).toBe(incident.severity);
    expect(next.errorType).toBe(incident.errorType);
    expect(next.requestId).toBe(incident.requestId);
    expect(next.assigneeId).toBe(incident.assigneeId);
    expect(next.assigneeEmail).toBe(incident.assigneeEmail);
    expect(next.metadata).toEqual(incident.metadata);
    expect(next.createdAt).toBe(incident.createdAt);
    expect(next.status).toBe('resolved');
    expect(next.updatedAt).not.toBe(incident.updatedAt);
    expect(next.updatedAt).toMatch(ISO_UTC_PATTERN);
    expect(Number.isNaN(Date.parse(next.updatedAt))).toBe(false);
    expect(next.statusHistory).toEqual([
      expect.objectContaining({
        from: 'open',
        to: 'resolved',
        actorId: 'anonymous',
      }),
    ]);
  });

  it('appends history with the operator identity and does not mutate prior entries', () => {
    const incident = {
      ...buildOpenIncident(),
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const investigating = transitionIncident(incident, 'investigating', {
      id: 'sub-1',
      email: 'ops@example.com',
    });
    const firstEntry = investigating.statusHistory?.[0];
    expect(firstEntry).toBeDefined();

    const resolved = transitionIncident(investigating, 'resolved', {
      id: 'sub-2',
      email: 'other@example.com',
    });

    expect(investigating.statusHistory).toHaveLength(1);
    expect(resolved.statusHistory).toHaveLength(2);
    expect(resolved.statusHistory?.[0]).toEqual(firstEntry);
    expect(resolved.statusHistory?.[1]).toMatchObject({
      from: 'investigating',
      to: 'resolved',
      actorId: 'sub-2',
      actorEmail: 'other@example.com',
    });
  });

  it('caps status history at MAX_INCIDENT_STATUS_HISTORY', () => {
    const oldest = {
      from: 'open' as const,
      to: 'investigating' as const,
      at: '2026-01-01T00:00:00.000Z',
      actorId: 'sub-oldest',
    };
    const rest = Array.from(
      { length: MAX_INCIDENT_STATUS_HISTORY - 1 },
      () => ({
        from: 'open' as const,
        to: 'investigating' as const,
        at: '2026-01-01T00:00:00.000Z',
        actorId: 'sub-old',
      }),
    );

    const next = transitionIncident(
      {
        ...buildOpenIncident(),
        statusHistory: [oldest, ...rest],
        status: 'open',
      },
      'investigating',
      { id: 'sub-new' },
    );

    expect(next.statusHistory).toHaveLength(MAX_INCIDENT_STATUS_HISTORY);
    expect(next.statusHistory?.[0]?.actorId).toBe('sub-old');
    expect(next.statusHistory?.[MAX_INCIDENT_STATUS_HISTORY - 1]?.actorId).toBe(
      'sub-new',
    );
  });

  it('transitionIncident throws for an invalid transition', () => {
    const resolved = transitionIncident(buildOpenIncident(), 'resolved');

    expect(() => transitionIncident(resolved, 'open')).toThrow(
      'Invalid incident status transition: resolved -> open',
    );
  });
});
