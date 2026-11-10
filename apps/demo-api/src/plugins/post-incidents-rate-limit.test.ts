import { afterAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { MemoryIncidentRepository } from '../../../../packages/repository/src/index.js';
import { createTokenBucketLimiter } from '../rate-limit/token-bucket.js';

const payload = {
  title: 'API down',
  source: 'demo-api',
  severity: 'high',
  errorType: 'TimeoutError',
} as const;

describe('POST /incidents rate limit', () => {
  const appPromise = buildApp({
    logger: false,
    incidentRepository: new MemoryIncidentRepository(),
    postIncidentsRateLimit: createTokenBucketLimiter({
      capacity: 2,
      refillPerMinute: 1,
    }),
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('returns 429 after the per-IP burst with Retry-After', async () => {
    const app = await appPromise;
    const headers = {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.10',
    };

    const first = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers,
      payload: JSON.stringify(payload),
    });
    const second = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers,
      payload: JSON.stringify(payload),
    });
    const third = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers,
      payload: JSON.stringify(payload),
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(third.statusCode).toBe(429);
    expect(third.headers['retry-after']).toBeTruthy();
    expect(JSON.parse(third.body)).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
    });
  });

  it('does not rate-limit GET /incidents', async () => {
    const app = await appPromise;
    const response = await app.inject({ method: 'GET', url: '/incidents' });
    expect(response.statusCode).toBe(200);
  });
});
