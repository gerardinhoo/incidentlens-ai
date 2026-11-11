import { afterAll, describe, expect, it } from 'vitest';

import {
  createIncident,
  type Incident,
} from '../../../../packages/domain/src/index.js';
import { MemoryIncidentRepository } from '../../../../packages/repository/src/index.js';
import { buildApp } from '../app.js';
import type { IncidentNotFoundResponse } from '../types/incident-not-found.js';
import type { SignInRequiredResponse } from '../types/sign-in-required.js';

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function bearerToken(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `Bearer hdr.${encoded}.sig`;
}

async function seedOpenIncident(
  repository: MemoryIncidentRepository,
): Promise<Incident> {
  const incident = createIncident({
    title: 'API down',
    source: 'demo-api',
    severity: 'high',
    errorType: 'TimeoutError',
  });
  await repository.save(incident);
  return incident;
}

describe('PATCH /incidents/:id/assignee', () => {
  const repository = new MemoryIncidentRepository();
  const appPromise = buildApp({
    logger: false,
    incidentRepository: repository,
    postIncidentsRateLimit: false,
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('assigns the signed-in operator from the Bearer token', async () => {
    const app = await appPromise;
    const seeded = await seedOpenIncident(repository);

    const response = await app.inject({
      method: 'PATCH',
      url: `/incidents/${seeded.id}/assignee`,
      headers: {
        'content-type': 'application/json',
        authorization: bearerToken({
          sub: 'sub-1',
          email: 'ops@example.com',
        }),
      },
      payload: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Incident>();
    expect(body.assigneeId).toBe('sub-1');
    expect(body.assigneeEmail).toBe('ops@example.com');
    expect(body.updatedAt).toMatch(ISO_UTC_PATTERN);
    expect(body.updatedAt).not.toBe(seeded.updatedAt);
    expect(await repository.findById(seeded.id)).toEqual(body);
  });

  it('replaces a previous assignee', async () => {
    const app = await appPromise;
    const seeded = await seedOpenIncident(repository);
    await repository.save({
      ...seeded,
      assigneeId: 'sub-other',
      assigneeEmail: 'other@example.com',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/incidents/${seeded.id}/assignee`,
      headers: {
        'content-type': 'application/json',
        authorization: bearerToken({
          sub: 'sub-1',
          email: 'ops@example.com',
        }),
      },
      payload: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Incident>();
    expect(body.assigneeId).toBe('sub-1');
    expect(body.assigneeEmail).toBe('ops@example.com');
  });

  it('returns 401 when Authorization is missing', async () => {
    const app = await appPromise;
    const seeded = await seedOpenIncident(repository);

    const response = await app.inject({
      method: 'PATCH',
      url: `/incidents/${seeded.id}/assignee`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<SignInRequiredResponse>()).toEqual({
      status: 'error',
      message: 'Sign in required',
    });
    expect((await repository.findById(seeded.id))?.assigneeId).toBeUndefined();
  });

  it('returns 404 for a missing incident', async () => {
    const app = await appPromise;

    const response = await app.inject({
      method: 'PATCH',
      url: '/incidents/missing-id/assignee',
      headers: {
        'content-type': 'application/json',
        authorization: bearerToken({ sub: 'sub-1' }),
      },
      payload: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<IncidentNotFoundResponse>()).toEqual({
      status: 'error',
      message: 'Incident not found',
    });
  });
});
