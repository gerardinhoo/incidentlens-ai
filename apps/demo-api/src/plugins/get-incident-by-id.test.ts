import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  createIncident,
  type Incident,
} from '../../../../packages/domain/src/index.js';
import {
  MemoryIncidentRepository,
  type IncidentRepository,
} from '../../../../packages/repository/src/index.js';
import { buildApp } from '../app.js';
import type { IncidentNotFoundResponse } from '../types/incident-not-found.js';

const validMinimal = {
  title: 'API down',
  source: 'demo-api',
  severity: 'high',
  errorType: 'TimeoutError',
} as const;

describe('GET /incidents/:id', () => {
  describe('with MemoryIncidentRepository', () => {
    const incidentRepository = new MemoryIncidentRepository();
    const appPromise = buildApp({
      logger: false,
      incidentRepository,
    });

    afterAll(async () => {
      const app = await appPromise;
      await app.close();
    });

    it('returns 200 with the stored incident when found', async () => {
      const app = await appPromise;
      const stored = createIncident({
        title: 'Lookup target',
        source: 'demo-api',
        severity: 'medium',
        errorType: 'Error',
        description: 'should not appear in logs',
        metadata: { secret: 'nope' },
      });
      await incidentRepository.save(stored);

      const response = await app.inject({
        method: 'GET',
        url: `/incidents/${stored.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<Incident>()).toEqual(stored);
    });

    it('returns 404 with a safe error body when missing', async () => {
      const app = await appPromise;

      const response = await app.inject({
        method: 'GET',
        url: '/incidents/missing-incident-id',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json<IncidentNotFoundResponse>()).toEqual({
        status: 'error',
        message: 'Incident not found',
      });
    });

    it('retrieves an incident created via POST on the same app/repository', async () => {
      const app = await appPromise;
      const createResponse = await app.inject({
        method: 'POST',
        url: '/incidents',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify(validMinimal),
      });

      expect(createResponse.statusCode).toBe(201);
      const created = createResponse.json<Incident>();

      const getResponse = await app.inject({
        method: 'GET',
        url: `/incidents/${created.id}`,
      });

      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.json<Incident>()).toEqual(created);
    });
  });

  describe('with an injected repository', () => {
    it('passes the path id to repository.findById', async () => {
      const findById = vi.fn(() => Promise.resolve(undefined));
      const repository: IncidentRepository = {
        save: vi.fn(),
        findById,
        findAll: vi.fn(),
      };

      const app = await buildApp({
        logger: false,
        incidentRepository: repository,
      });

      try {
        const pathId = 'path-incident-id';
        const response = await app.inject({
          method: 'GET',
          url: `/incidents/${pathId}`,
        });

        expect(findById).toHaveBeenCalledWith(pathId);
        expect(response.statusCode).toBe(404);
      } finally {
        await app.close();
      }
    });

    it('does not convert repository failures into 404', async () => {
      const repository: IncidentRepository = {
        save: vi.fn(),
        findById: vi.fn(() =>
          Promise.reject(new Error('Incident repository findById failed')),
        ),
        findAll: vi.fn(),
      };

      const app = await buildApp({
        logger: false,
        incidentRepository: repository,
      });

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/incidents/any-id',
        });

        expect(response.statusCode).not.toBe(404);
        expect(response.statusCode).toBeGreaterThanOrEqual(500);
        expect(response.body).not.toMatch(/DynamoDB|UnrecognizedClient|AWS/i);
      } finally {
        await app.close();
      }
    });
  });

  describe('parameter and routing behavior', () => {
    const appPromise = buildApp({
      logger: false,
      incidentRepository: new MemoryIncidentRepository(),
    });

    afterAll(async () => {
      const app = await appPromise;
      await app.close();
    });

    it('rejects an empty path id with HTTP 400', async () => {
      const app = await appPromise;
      const response = await app.inject({
        method: 'GET',
        url: '/incidents/',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ code?: string }>().code).toBe(
        'FST_ERR_VALIDATION',
      );
    });

    it('returns Fastify 404 for an unknown route', async () => {
      const app = await appPromise;
      const response = await app.inject({
        method: 'GET',
        url: '/incidents-unknown/does-not-exist',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<{ message: string; statusCode: number }>();
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/not found/i);
    });
  });
});
