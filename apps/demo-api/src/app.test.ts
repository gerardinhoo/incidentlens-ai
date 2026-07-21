import { afterAll, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { env } from './config/env.js';
import type { HealthResponse } from './types/health.js';

describe('GET /health', () => {
  const appPromise = buildApp();

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('returns service health details with HTTP 200', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<HealthResponse>();

    expect(body.status).toBe('ok');
    expect(body.service).toBe(env.serviceName);
    expect(body.version).toBe(env.serviceVersion);
    expect(typeof body.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});
