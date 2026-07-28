import { describe, expect, it } from 'vitest';

import { createIncident } from './create-incident.js';
import type { Incident } from './incident.js';
import {
  assertValidTransition,
  canTransition,
  transitionIncident,
} from './incident-lifecycle.js';
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
    expect(next.metadata).toEqual(incident.metadata);
    expect(next.createdAt).toBe(incident.createdAt);
    expect(next.status).toBe('resolved');
    expect(next.updatedAt).not.toBe(incident.updatedAt);
    expect(next.updatedAt).toMatch(ISO_UTC_PATTERN);
    expect(Number.isNaN(Date.parse(next.updatedAt))).toBe(false);
  });

  it('transitionIncident throws for an invalid transition', () => {
    const resolved = transitionIncident(buildOpenIncident(), 'resolved');

    expect(() => transitionIncident(resolved, 'open')).toThrow(
      'Invalid incident status transition: resolved -> open',
    );
  });
});
