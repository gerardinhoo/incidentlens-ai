import { afterAll, describe, expect, it, vi } from 'vitest';

import type { Incident } from '../../../../packages/domain/src/index.js';
import {
  MemoryIncidentRepository,
  type IncidentRepository,
} from '../../../../packages/repository/src/index.js';
import { buildApp } from '../app.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const validMinimal = {
  title: 'API down',
  source: 'demo-api',
  severity: 'high',
  errorType: 'TimeoutError',
} as const;

const validComplete = {
  title: 'API latency spike',
  description: 'p95 latency exceeded SLO',
  source: 'demo-api',
  severity: 'critical',
  errorType: 'TimeoutError',
  requestId: 'client-req-123',
  metadata: {
    service: 'checkout',
    region: 'us-east-1',
  },
} as const;

describe('POST /incidents', () => {
  const incidentRepository = new MemoryIncidentRepository();
  const appPromise = buildApp({
    logger: false,
    incidentRepository,
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('returns 201 for a valid minimal payload', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(validMinimal),
    });

    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body) as Incident;

    expect(body.title).toBe(validMinimal.title);
    expect(body.source).toBe(validMinimal.source);
    expect(body.severity).toBe(validMinimal.severity);
    expect(body.errorType).toBe(validMinimal.errorType);
    expect(body.status).toBe('open');
    expect(body.id).toMatch(UUID_PATTERN);
    expect(body.createdAt).toMatch(ISO_UTC_PATTERN);
    expect(body.updatedAt).toMatch(ISO_UTC_PATTERN);
    expect(body.createdAt).toBe(body.updatedAt);
    expect(body.metadata).toEqual({});
  });

  it('returns 201 for a valid complete payload and preserves caller fields', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(validComplete),
    });

    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body) as Incident;

    expect(body.title).toBe(validComplete.title);
    expect(body.description).toBe(validComplete.description);
    expect(body.source).toBe(validComplete.source);
    expect(body.severity).toBe(validComplete.severity);
    expect(body.errorType).toBe(validComplete.errorType);
    expect(body.requestId).toBe(validComplete.requestId);
    expect(body.metadata).toEqual(validComplete.metadata);
    expect(body.status).toBe('open');
    expect(body.id.length).toBeGreaterThan(0);
    expect(body.id).toMatch(UUID_PATTERN);
    expect(body.createdAt).toMatch(ISO_UTC_PATTERN);
    expect(body.updatedAt).toMatch(ISO_UTC_PATTERN);
  });

  it('persists the created incident in the repository', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        title: 'Persisted incident',
        source: 'demo-api',
        severity: 'medium',
        errorType: 'ConnectionError',
        metadata: { check: 'persistence' },
      }),
    });

    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body) as Incident;
    const stored = await incidentRepository.findById(body.id);

    expect(stored).toEqual(body);

    const all = await incidentRepository.findAll();
    expect(all.some((incident) => incident.id === body.id)).toBe(true);
  });

  it('returns 400 for an invalid payload missing required fields', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'API down' }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for an unsupported severity', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        ...validMinimal,
        severity: 'urgent',
      }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for an unknown top-level field', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        ...validMinimal,
        unexpected: 'nope',
      }),
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /incidents repository failures', () => {
  it('does not hide repository save failures', async () => {
    const repository: IncidentRepository = {
      save: vi.fn(() =>
        Promise.reject(new Error('Incident repository save failed')),
      ),
      findById: vi.fn(),
      findAll: vi.fn(),
    };

    const app = await buildApp({
      logger: false,
      incidentRepository: repository,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/incidents',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify(validMinimal),
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(500);
      expect(response.body).not.toMatch(/DynamoDB|UnrecognizedClient|AWS/i);
    } finally {
      await app.close();
    }
  });
});
