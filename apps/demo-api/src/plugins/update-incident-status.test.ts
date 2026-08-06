import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  createIncident,
  transitionIncident,
  type Incident,
} from '../../../../packages/domain/src/index.js';
import {
  MemoryIncidentRepository,
  type IncidentRepository,
} from '../../../../packages/repository/src/index.js';
import { buildApp } from '../app.js';
import type { IncidentNotFoundResponse } from '../types/incident-not-found.js';
import type { IncidentStatusConflictResponse } from '../types/incident-status-conflict.js';

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const validCreate = {
  title: 'API down',
  source: 'demo-api',
  severity: 'high' as const,
  errorType: 'TimeoutError',
  description: 'keep this field',
  requestId: 'client-req-1',
  metadata: { service: 'checkout' },
};

async function seedOpenIncident(
  repository: MemoryIncidentRepository,
): Promise<Incident> {
  const incident = createIncident(validCreate);
  await repository.save(incident);
  return incident;
}

describe('PATCH /incidents/:id/status', () => {
  describe('successful transitions', () => {
    const repository = new MemoryIncidentRepository();
    const appPromise = buildApp({
      logger: false,
      incidentRepository: repository,
    });

    afterAll(async () => {
      const app = await appPromise;
      await app.close();
    });

    it('open -> investigating returns 200 and persists the update', async () => {
      const app = await appPromise;
      const seeded = await seedOpenIncident(repository);

      const response = await app.inject({
        method: 'PATCH',
        url: `/incidents/${seeded.id}/status`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ status: 'investigating' }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<Incident>();
      expect(body.status).toBe('investigating');
      expect(body.updatedAt).toMatch(ISO_UTC_PATTERN);
      expect(body.updatedAt).not.toBe(seeded.updatedAt);
      expect(body.title).toBe(seeded.title);
      expect(body.description).toBe(seeded.description);
      expect(body.source).toBe(seeded.source);
      expect(body.severity).toBe(seeded.severity);
      expect(body.errorType).toBe(seeded.errorType);
      expect(body.requestId).toBe(seeded.requestId);
      expect(body.metadata).toEqual(seeded.metadata);
      expect(body.createdAt).toBe(seeded.createdAt);
      expect(await repository.findById(seeded.id)).toEqual(body);
    });

    it('open -> resolved returns 200', async () => {
      const app = await appPromise;
      const seeded = await seedOpenIncident(repository);

      const response = await app.inject({
        method: 'PATCH',
        url: `/incidents/${seeded.id}/status`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ status: 'resolved' }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<Incident>().status).toBe('resolved');
    });

    it('investigating -> resolved returns 200', async () => {
      const app = await appPromise;
      const open = await seedOpenIncident(repository);
      const investigating = transitionIncident(open, 'investigating');
      await repository.save(investigating);

      const response = await app.inject({
        method: 'PATCH',
        url: `/incidents/${investigating.id}/status`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ status: 'resolved' }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<Incident>().status).toBe('resolved');
    });
  });

  describe('not found and conflict', () => {
    const repository = new MemoryIncidentRepository();
    const appPromise = buildApp({
      logger: false,
      incidentRepository: repository,
    });

    afterAll(async () => {
      const app = await appPromise;
      await app.close();
    });

    it('missing incident returns 404', async () => {
      const app = await appPromise;
      const response = await app.inject({
        method: 'PATCH',
        url: '/incidents/missing-id/status',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ status: 'investigating' }),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json<IncidentNotFoundResponse>()).toEqual({
        status: 'error',
        message: 'Incident not found',
      });
    });

    it('investigating -> open returns 409', async () => {
      const app = await appPromise;
      const open = await seedOpenIncident(repository);
      await repository.save(transitionIncident(open, 'investigating'));

      const response = await app.inject({
        method: 'PATCH',
        url: `/incidents/${open.id}/status`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ status: 'open' }),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json<IncidentStatusConflictResponse>()).toEqual({
        status: 'error',
        message: 'Invalid incident status transition',
      });
    });

    it('resolved -> open returns 409', async () => {
      const app = await appPromise;
      const open = await seedOpenIncident(repository);
      await repository.save(transitionIncident(open, 'resolved'));

      const response = await app.inject({
        method: 'PATCH',
        url: `/incidents/${open.id}/status`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ status: 'open' }),
      });

      expect(response.statusCode).toBe(409);
    });

    it('resolved -> investigating returns 409', async () => {
      const app = await appPromise;
      const open = await seedOpenIncident(repository);
      await repository.save(transitionIncident(open, 'resolved'));

      const response = await app.inject({
        method: 'PATCH',
        url: `/incidents/${open.id}/status`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ status: 'investigating' }),
      });

      expect(response.statusCode).toBe(409);
    });

    it('same-state transition returns 409', async () => {
      const app = await appPromise;
      const seeded = await seedOpenIncident(repository);

      const response = await app.inject({
        method: 'PATCH',
        url: `/incidents/${seeded.id}/status`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ status: 'open' }),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json<IncidentStatusConflictResponse>().message).toBe(
        'Invalid incident status transition',
      );
    });
  });

  describe('request validation', () => {
    const repository = new MemoryIncidentRepository();
    const appPromise = buildApp({
      logger: false,
      incidentRepository: repository,
    });

    afterAll(async () => {
      const app = await appPromise;
      await app.close();
    });

    it('unsupported status returns 400', async () => {
      const app = await appPromise;
      const seeded = await seedOpenIncident(repository);

      const response = await app.inject({
        method: 'PATCH',
        url: `/incidents/${seeded.id}/status`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ status: 'closed' }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('missing status returns 400', async () => {
      const app = await appPromise;
      const seeded = await seedOpenIncident(repository);

      const response = await app.inject({
        method: 'PATCH',
        url: `/incidents/${seeded.id}/status`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({}),
      });

      expect(response.statusCode).toBe(400);
    });

    it('unknown body field returns 400', async () => {
      const app = await appPromise;
      const seeded = await seedOpenIncident(repository);

      const response = await app.inject({
        method: 'PATCH',
        url: `/incidents/${seeded.id}/status`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({
          status: 'investigating',
          unexpected: true,
        }),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('with an injected repository', () => {
    it('does not call save for an invalid transition', async () => {
      const existing = createIncident(validCreate);
      const investigating = transitionIncident(existing, 'investigating');
      const save = vi.fn(() => Promise.resolve(investigating));
      const repository: IncidentRepository = {
        save,
        saveIfAbsent: vi.fn(() => Promise.resolve('created' as const)),
        findById: vi.fn(() => Promise.resolve(investigating)),
        findAll: vi.fn(),
      };

      const app = await buildApp({
        logger: false,
        incidentRepository: repository,
      });

      try {
        const response = await app.inject({
          method: 'PATCH',
          url: `/incidents/${investigating.id}/status`,
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ status: 'open' }),
        });

        expect(response.statusCode).toBe(409);
        expect(save).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('does not convert repository errors into 404 or 409', async () => {
      const existing = createIncident(validCreate);
      const repository: IncidentRepository = {
        save: vi.fn(() =>
          Promise.reject(new Error('Incident repository save failed')),
        ),
        saveIfAbsent: vi.fn(() => Promise.resolve('created' as const)),
        findById: vi.fn(() => Promise.resolve(existing)),
        findAll: vi.fn(),
      };

      const app = await buildApp({
        logger: false,
        incidentRepository: repository,
      });

      try {
        const response = await app.inject({
          method: 'PATCH',
          url: `/incidents/${existing.id}/status`,
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ status: 'investigating' }),
        });

        expect(response.statusCode).not.toBe(404);
        expect(response.statusCode).not.toBe(409);
        expect(response.statusCode).toBeGreaterThanOrEqual(500);
        expect(response.body).not.toMatch(/DynamoDB|UnrecognizedClient|AWS/i);
      } finally {
        await app.close();
      }
    });

    it('works with an injected repository for a valid update', async () => {
      const existing = createIncident(validCreate);
      const save = vi.fn((incident: Incident) => Promise.resolve(incident));
      const repository: IncidentRepository = {
        save,
        saveIfAbsent: vi.fn(() => Promise.resolve('created' as const)),
        findById: vi.fn(() => Promise.resolve(existing)),
        findAll: vi.fn(),
      };

      const app = await buildApp({
        logger: false,
        incidentRepository: repository,
      });

      try {
        const response = await app.inject({
          method: 'PATCH',
          url: `/incidents/${existing.id}/status`,
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ status: 'investigating' }),
        });

        expect(response.statusCode).toBe(200);
        expect(save).toHaveBeenCalledTimes(1);
        expect(response.json<Incident>().status).toBe('investigating');
      } finally {
        await app.close();
      }
    });
  });
});
