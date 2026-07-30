import Fastify, { type LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';

import { getIncidentByIdSchema } from './get-incident-by-id.js';

async function validateParams(
  idSegment: string,
): Promise<LightMyRequestResponse> {
  const app = Fastify({ logger: false });

  app.get('/incidents/:id', {
    schema: getIncidentByIdSchema,
    handler: (request) => request.params,
  });

  await app.ready();

  const response = await app.inject({
    method: 'GET',
    url: `/incidents/${idSegment}`,
  });

  await app.close();
  return response;
}

describe('getIncidentByIdSchema', () => {
  it('accepts a non-empty string id', async () => {
    const response = await validateParams('incident-123');

    expect(response.statusCode).toBe(200);
    expect(response.json<{ id: string }>()).toEqual({ id: 'incident-123' });
  });

  it('rejects an empty id', async () => {
    const response = await validateParams('');

    expect(response.statusCode).toBe(400);
    expect(response.json<{ code?: string }>().code).toBe('FST_ERR_VALIDATION');
  });
});
