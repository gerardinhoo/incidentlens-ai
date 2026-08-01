import { afterAll, describe, expect, it } from 'vitest';

import { MemoryIncidentRepository } from '../../../packages/repository/src/index.js';
import { buildApp } from './app.js';

/**
 * Smoke-tests that the Lambda entrypoint pattern (buildApp without listen)
 * serves requests via inject — same composition path used by lambda.ts.
 */
describe('Lambda composition path', () => {
  const repository = new MemoryIncidentRepository();
  const appPromise = buildApp({
    logger: false,
    incidentRepository: repository,
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('serves health without calling listen()', async () => {
    const app = await appPromise;
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>().status).toBe('ok');
  });
});
