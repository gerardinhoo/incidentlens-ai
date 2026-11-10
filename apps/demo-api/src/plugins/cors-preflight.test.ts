import { afterAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';

describe('OPTIONS preflight', () => {
  const appPromise = buildApp({ logger: false });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('returns HTTP 204 for OPTIONS /incidents', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/incidents',
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('returns HTTP 204 for OPTIONS /incidents/:id', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/incidents/demo-incident-1',
    });

    expect(response.statusCode).toBe(204);
  });

  it('returns HTTP 204 for OPTIONS /incidents/:id/status', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/incidents/demo-incident-1/status',
    });

    expect(response.statusCode).toBe(204);
  });
});
