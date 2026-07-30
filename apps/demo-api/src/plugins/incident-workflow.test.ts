import { afterAll, describe, expect, it } from 'vitest';

import type { Incident } from '../../../../packages/domain/src/index.js';
import { MemoryIncidentRepository } from '../../../../packages/repository/src/index.js';
import { buildApp } from '../app.js';

/**
 * End-to-end Phase 2 incident workflow through Fastify inject.
 * Uses one shared MemoryIncidentRepository instance for the whole flow.
 */
describe('Phase 2 incident workflow (integration)', () => {
  const incidentRepository = new MemoryIncidentRepository();
  const appPromise = buildApp({
    logger: false,
    incidentRepository,
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('creates, retrieves, lists, and resolves an incident through the API', async () => {
    const app = await appPromise;

    const createResponse = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        title: 'Workflow incident',
        description: 'end-to-end coverage',
        source: 'demo-api',
        severity: 'high',
        errorType: 'TimeoutError',
        requestId: 'workflow-req-1',
        metadata: { service: 'checkout' },
      }),
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json<Incident>();
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.status).toBe('open');

    const getCreated = await app.inject({
      method: 'GET',
      url: `/incidents/${created.id}`,
    });
    expect(getCreated.statusCode).toBe(200);
    expect(getCreated.json<Incident>()).toEqual(created);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/incidents',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(
      listResponse
        .json<Incident[]>()
        .some((incident) => incident.id === created.id),
    ).toBe(true);

    const toInvestigating = await app.inject({
      method: 'PATCH',
      url: `/incidents/${created.id}/status`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'investigating' }),
    });
    expect(toInvestigating.statusCode).toBe(200);
    expect(toInvestigating.json<Incident>().status).toBe('investigating');

    const getInvestigating = await app.inject({
      method: 'GET',
      url: `/incidents/${created.id}`,
    });
    expect(getInvestigating.statusCode).toBe(200);
    expect(getInvestigating.json<Incident>().status).toBe('investigating');

    const toResolved = await app.inject({
      method: 'PATCH',
      url: `/incidents/${created.id}/status`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'resolved' }),
    });
    expect(toResolved.statusCode).toBe(200);
    expect(toResolved.json<Incident>().status).toBe('resolved');

    const getResolved = await app.inject({
      method: 'GET',
      url: `/incidents/${created.id}`,
    });
    expect(getResolved.statusCode).toBe(200);
    const resolved = getResolved.json<Incident>();
    expect(resolved.status).toBe('resolved');
    expect(resolved.title).toBe(created.title);
    expect(resolved.description).toBe(created.description);
    expect(resolved.metadata).toEqual(created.metadata);
    expect(resolved.createdAt).toBe(created.createdAt);
    expect(resolved.updatedAt).not.toBe(created.updatedAt);
  });
});
