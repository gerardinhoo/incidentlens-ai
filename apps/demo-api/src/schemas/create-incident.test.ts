import Fastify, { type LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';

import {
  createIncidentAjvOptions,
  createIncidentSchema,
} from './create-incident.js';

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
  requestId: 'req-123',
  metadata: {
    service: 'checkout',
    region: 'us-east-1',
  },
} as const;

async function validateBody(payload: unknown): Promise<LightMyRequestResponse> {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        ...createIncidentAjvOptions,
      },
    },
  });

  app.post('/validate-create-incident', {
    schema: createIncidentSchema,
    handler: () => ({ ok: true }),
  });

  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/validate-create-incident',
    headers: {
      'content-type': 'application/json',
    },
    payload: JSON.stringify(payload),
  });

  await app.close();
  return response;
}

describe('createIncidentSchema', () => {
  it('accepts a valid minimal payload', async () => {
    const response = await validateBody(validMinimal);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true });
  });

  it('accepts a valid complete payload', async () => {
    const response = await validateBody(validComplete);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true });
  });

  it('accepts a payload with optional fields omitted', async () => {
    const response = await validateBody({
      title: 'Disk pressure',
      source: 'node-exporter',
      severity: 'medium',
      errorType: 'DiskFull',
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejects missing required fields', async () => {
    const response = await validateBody({
      title: 'API down',
    });

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body) as {
      statusCode: number;
      error: string;
    };

    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
  });

  it('rejects unsupported severity values', async () => {
    const response = await validateBody({
      ...validMinimal,
      severity: 'urgent',
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a title that is too short', async () => {
    const response = await validateBody({
      ...validMinimal,
      title: 'ab',
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a title that is too long', async () => {
    const response = await validateBody({
      ...validMinimal,
      title: 'a'.repeat(201),
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects metadata values that are not strings', async () => {
    const response = await validateBody({
      ...validMinimal,
      metadata: {
        retryable: true,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects nested metadata objects', async () => {
    const response = await validateBody({
      ...validMinimal,
      metadata: {
        nested: { key: 'value' },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects unknown top-level fields', async () => {
    const response = await validateBody({
      ...validMinimal,
      unexpected: 'nope',
    });

    expect(response.statusCode).toBe(400);
  });
});
