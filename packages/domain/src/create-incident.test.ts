import { describe, expect, it } from 'vitest';

import { createIncident } from './create-incident.js';

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('createIncident', () => {
  it('creates an incident with caller-controlled fields', () => {
    const incident = createIncident({
      title: 'API latency spike',
      description: 'p95 latency exceeded',
      source: 'demo-api',
      severity: 'high',
      errorType: 'TimeoutError',
      requestId: 'req-123',
      metadata: { service: 'checkout' },
    });

    expect(incident.title).toBe('API latency spike');
    expect(incident.description).toBe('p95 latency exceeded');
    expect(incident.source).toBe('demo-api');
    expect(incident.severity).toBe('high');
    expect(incident.errorType).toBe('TimeoutError');
    expect(incident.requestId).toBe('req-123');
    expect(incident.metadata).toEqual({ service: 'checkout' });
  });

  it('generates a non-empty UUID id', () => {
    const incident = createIncident({
      title: 'API latency spike',
      source: 'demo-api',
      severity: 'high',
      errorType: 'TimeoutError',
    });

    expect(incident.id.length).toBeGreaterThan(0);
    expect(incident.id).toMatch(UUID_PATTERN);
  });

  it('defaults status to open', () => {
    const incident = createIncident({
      title: 'API latency spike',
      source: 'demo-api',
      severity: 'high',
      errorType: 'TimeoutError',
    });

    expect(incident.status).toBe('open');
  });

  it('sets matching ISO 8601 UTC createdAt and updatedAt', () => {
    const incident = createIncident({
      title: 'API latency spike',
      source: 'demo-api',
      severity: 'high',
      errorType: 'TimeoutError',
    });

    expect(incident.createdAt).toMatch(ISO_UTC_PATTERN);
    expect(incident.updatedAt).toMatch(ISO_UTC_PATTERN);
    expect(incident.createdAt).toBe(incident.updatedAt);
    expect(Number.isNaN(Date.parse(incident.createdAt))).toBe(false);
  });

  it('defaults missing metadata to an empty object', () => {
    const incident = createIncident({
      title: 'API latency spike',
      source: 'demo-api',
      severity: 'high',
      errorType: 'TimeoutError',
    });

    expect(incident.metadata).toEqual({});
  });

  it('omits optional fields when they are not provided', () => {
    const incident = createIncident({
      title: 'API latency spike',
      source: 'demo-api',
      severity: 'high',
      errorType: 'TimeoutError',
    });

    expect(incident).not.toHaveProperty('description');
    expect(incident).not.toHaveProperty('requestId');
  });

  it('does not mutate the input metadata object', () => {
    const metadata = { region: 'us-east-1' };
    const incident = createIncident({
      title: 'API latency spike',
      source: 'demo-api',
      severity: 'high',
      errorType: 'TimeoutError',
      metadata,
    });

    metadata.region = 'changed';
    expect(incident.metadata).toEqual({ region: 'us-east-1' });
  });
});
